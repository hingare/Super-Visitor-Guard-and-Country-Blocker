import type { Shop } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { AppSubscription } from "@shopify/shopify-api";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  PERIOD_DAYS,
  amountDue,
  crossesChargeStep,
  currentPeriod,
  planFromName,
} from "../lib/billing";

// Keeps each shop's subscription state in the database and charges
// Pay-as-you-go page views through Shopify usage records.

/* eslint-disable no-undef */
// Local development without a Partner app: skip the plan gate and charges.
export const BILLING_DISABLED = process.env.BILLING_DISABLED === "true";
// Development stores can only accept test charges.
export const BILLING_TEST =
  process.env.NODE_ENV !== "production" || process.env.BILLING_TEST === "true";
/* eslint-enable no-undef */

const DAY_MS = 24 * 60 * 60 * 1000;

function usageLineItem(subscription: AppSubscription) {
  return subscription.lineItems?.find((item) => "cappedAmount" in item.plan.pricingDetails) ?? null;
}

// Stores what billing.check returned. Returns the active plan, or null.
export async function syncBilling(
  shop: Shop,
  subscriptions: AppSubscription[],
): Promise<Shop["plan"] | null> {
  const subscription = subscriptions.find(
    (item) => item.status === "ACTIVE" && planFromName(item.name),
  );
  if (!subscription) {
    if (shop.billingActive) {
      await db.shop.update({ where: { id: shop.id }, data: { billingActive: false } });
    }
    return null;
  }

  const plan = planFromName(subscription.name)!;
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const data: Prisma.ShopUpdateInput = {
    plan,
    billingActive: true,
    usageLineItemId: usageLineItem(subscription)?.id ?? null,
    trialEndsAt: subscription.trialDays
      ? new Date(new Date(subscription.createdAt).getTime() + subscription.trialDays * DAY_MS)
      : null,
  };

  if (subscription.id !== shop.subscriptionId) {
    // A new subscription starts a new period with a fresh usage balance.
    Object.assign(data, {
      subscriptionId: subscription.id,
      billingCycleStart: new Date(),
      billingCycleEnd: periodEnd,
      pageViewsThisCycle: 0,
      chargedThisCycle: 0,
    });
  } else if (periodEnd && (!shop.billingCycleEnd || periodEnd > shop.billingCycleEnd)) {
    // Shopify moved on to a later period than the one we were counting.
    const moved = !shop.billingCycleEnd || periodEnd.getTime() - shop.billingCycleEnd.getTime() > DAY_MS;
    Object.assign(
      data,
      moved
        ? {
            billingCycleStart: new Date(periodEnd.getTime() - PERIOD_DAYS * DAY_MS),
            billingCycleEnd: periodEnd,
            pageViewsThisCycle: 0,
            chargedThisCycle: 0,
          }
        : { billingCycleEnd: periodEnd },
    );
  }

  await db.shop.update({ where: { id: shop.id }, data });
  return plan;
}

// Whether the storefront filters run for this shop.
export function filteringAllowed(shop: Pick<Shop, "billingActive">) {
  return BILLING_DISABLED || shop.billingActive;
}

// Counts one storefront page view, and charges when it completes a block.
export async function recordPageView(shop: Shop) {
  const period = currentPeriod(new Date(), shop.billingCycleStart, shop.billingCycleEnd);
  if (period.rolled) {
    await db.shop.updateMany({
      where: { id: shop.id, billingCycleStart: shop.billingCycleStart },
      data: {
        billingCycleStart: period.start,
        billingCycleEnd: period.end,
        pageViewsThisCycle: 0,
        chargedThisCycle: 0,
      },
    });
  }
  const updated = await db.shop.update({
    where: { id: shop.id },
    data: { pageViewsThisCycle: { increment: 1 } },
  });
  if (
    !BILLING_DISABLED &&
    updated.billingActive &&
    updated.plan === "PAY_AS_YOU_GO" &&
    crossesChargeStep(updated.pageViewsThisCycle)
  ) {
    chargeUsage(updated).catch((error) =>
      console.error(`Usage charge failed for ${shop.shopDomain}`, error),
    );
  }
}

async function findUsageLineItemId(shopDomain: string): Promise<string | null> {
  const { admin } = await unauthenticated.admin(shopDomain);
  const response = await admin.graphql(`#graphql
    query UsageLineItem {
      currentAppInstallation {
        activeSubscriptions {
          lineItems {
            id
            plan {
              pricingDetails {
                __typename
              }
            }
          }
        }
      }
    }`);
  const { data } = await response.json();
  const items: { id: string; plan: { pricingDetails: { __typename: string } } }[] =
    data?.currentAppInstallation?.activeSubscriptions?.flatMap(
      (subscription: { lineItems: unknown[] }) => subscription.lineItems,
    ) ?? [];
  return items.find((item) => item.plan.pricingDetails.__typename === "AppUsagePricing")?.id ?? null;
}

// Charges whatever the period's views cost beyond what was already charged.
// The UsageRecord row (unique per period and view count) and a conditional
// update of chargedThisCycle stop two processes charging the same views.
export async function chargeUsage(shop: Shop) {
  const charged = Number(shop.chargedThisCycle);
  const due = amountDue(shop.pageViewsThisCycle, charged);
  if (due <= 0) return;

  let recordId: string;
  try {
    const record = await db.usageRecord.create({
      data: {
        shopId: shop.id,
        periodStart: shop.billingCycleStart,
        views: shop.pageViewsThisCycle,
        chargedUsd: due,
      },
    });
    recordId = record.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }

  const claimed = await db.shop.updateMany({
    where: { id: shop.id, chargedThisCycle: shop.chargedThisCycle, billingCycleStart: shop.billingCycleStart },
    data: { chargedThisCycle: { increment: due } },
  });
  const release = async () => {
    await db.usageRecord.delete({ where: { id: recordId } });
  };
  if (claimed.count === 0) {
    await release();
    return;
  }

  try {
    const lineItemId = shop.usageLineItemId ?? (await findUsageLineItemId(shop.shopDomain));
    if (!lineItemId) throw new Error("No active usage subscription");
    const { admin } = await unauthenticated.admin(shop.shopDomain);
    const response = await admin.graphql(
      `#graphql
      mutation ChargeUsage($lineItemId: ID!, $amount: Decimal!, $description: String!, $key: String!) {
        appUsageRecordCreate(
          subscriptionLineItemId: $lineItemId
          price: { amount: $amount, currencyCode: USD }
          description: $description
          idempotencyKey: $key
        ) {
          appUsageRecord {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          lineItemId,
          amount: due.toFixed(2),
          description: `${shop.pageViewsThisCycle} page views this billing period`,
          key: recordId,
        },
      },
    );
    const { data } = await response.json();
    const errors: { message: string }[] = data?.appUsageRecordCreate?.userErrors ?? [];
    if (errors.length > 0) throw new Error(errors.map((item) => item.message).join("; "));
    await db.usageRecord.update({
      where: { id: recordId },
      data: { shopifyUsageRecordId: data?.appUsageRecordCreate?.appUsageRecord?.id ?? null },
    });
    if (!shop.usageLineItemId) {
      await db.shop.update({ where: { id: shop.id }, data: { usageLineItemId: lineItemId } });
    }
  } catch (error) {
    // Undo the claim so the next block of views charges this amount too.
    await db.shop.updateMany({
      where: { id: shop.id, billingCycleStart: shop.billingCycleStart },
      data: { chargedThisCycle: { decrement: due } },
    });
    await release();
    throw error;
  }
}

// app_subscriptions/update webhook.
export async function applySubscriptionUpdate(
  shopDomain: string,
  update: { id: string; name: string; status: string },
) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const plan = planFromName(update.name);
  if (update.status === "ACTIVE" && plan) {
    await db.shop.update({
      where: { id: shop.id },
      data:
        update.id === shop.subscriptionId
          ? { plan, billingActive: true }
          : {
              plan,
              billingActive: true,
              subscriptionId: update.id,
              usageLineItemId: null,
              billingCycleStart: new Date(),
              billingCycleEnd: null,
              pageViewsThisCycle: 0,
              chargedThisCycle: 0,
            },
    });
  } else if (update.id === shop.subscriptionId) {
    await db.shop.update({ where: { id: shop.id }, data: { billingActive: false } });
  }
}
