import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { BILLING_DISABLED, BILLING_TEST, syncBilling } from "../models/billing.server";
import {
  FREE_VIEWS,
  PAY_AS_YOU_GO_PLAN,
  PREMIUM_PLAN,
  PREMIUM_PRICE,
  PREMIUM_TRIAL_DAYS,
  PRICE_PER_CHARGE,
  USAGE_CAP,
  VIEWS_PER_CHARGE,
  usageCost,
  type PlanName,
} from "../lib/billing";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection } from "../components/ui";

// Not in the sidebar: reached from the top bar, and every other page sends
// the merchant here until a plan is active (see app.tsx).

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  // Loaders run in parallel, so this page syncs the subscription itself
  // instead of relying on app.tsx having done it first.
  let shop = await getShopWithSettings(session.shop);
  if (!BILLING_DISABLED) {
    const { appSubscriptions } = await billing.check({ isTest: BILLING_TEST });
    await syncBilling(shop, appSubscriptions);
    shop = await getShopWithSettings(session.shop);
  }
  const active = BILLING_DISABLED || shop.billingActive;
  return {
    current: active ? shop.plan : null,
    views: shop.pageViewsThisCycle,
    charged: Number(shop.chargedThisCycle),
    periodEnd: shop.billingCycleEnd?.toISOString() ?? null,
    trialEndsAt: shop.trialEndsAt && shop.trialEndsAt > new Date() ? shop.trialEndsAt.toISOString() : null,
    billingDisabled: BILLING_DISABLED,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = form.get("plan");
  if (plan !== PAY_AS_YOU_GO_PLAN && plan !== PREMIUM_PLAN) {
    return { ok: false as const, error: "Unknown plan." };
  }
  // Redirects to Shopify's approval page; the merchant comes back to the app.
  return billing.request({ plan: plan as PlanName, isTest: BILLING_TEST });
};

interface PlanCardProps {
  name: PlanName;
  price: string;
  priceNote: string;
  features: string[];
  current: boolean;
  submitting: boolean;
  onChoose: () => void;
}

function PlanCard({ name, price, priceNote, features, current, submitting, onChoose }: PlanCardProps) {
  return (
    <div className={styles.statCard} style={{ gap: 12 }}>
      <span className={styles.statTitle}>{name}</span>
      <span className={styles.statValue}>{price}</span>
      <span className={styles.statLabel}>{priceNote}</span>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, textAlign: "left" }}>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {current ? (
        <span className={styles.outlineButton} aria-current="true">
          <s-icon type="check-circle-filled" tone="success" /> Current plan
        </span>
      ) : (
        <button type="button" className={styles.primaryButton} disabled={submitting} onClick={onChoose}>
          Choose {name}
        </button>
      )}
    </div>
  );
}

const ALL_FEATURES = "Every blocker, order filter and tool";

export default function Plans() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const submitting = fetcher.state !== "idle";
  const choose = (plan: PlanName) => fetcher.submit({ plan }, { method: "POST" });
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const date = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <>
      <PageHeader title="Plans" subtitle="Pick how you want to pay. You can switch at any time." />

      {!data.current && !data.billingDisabled && (
        <Banner tone="warning">
          <p>Choose a plan to start protecting your store. Filters stay off until a plan is active.</p>
        </Banner>
      )}
      {error && (
        <Banner tone="warning">
          <p>{error}</p>
        </Banner>
      )}

      <Card>
        <CardSection>
          <div className={styles.statGrid}>
            <PlanCard
              name={PAY_AS_YOU_GO_PLAN}
              price="$0"
              priceNote={`then $${PRICE_PER_CHARGE.toFixed(2)} per ${VIEWS_PER_CHARGE} page views`}
              features={[
                ALL_FEATURES,
                `First ${FREE_VIEWS} page views free every 30 days`,
                `Never more than $${USAGE_CAP} per 30 days`,
              ]}
              current={data.current === "PAY_AS_YOU_GO"}
              submitting={submitting}
              onChoose={() => choose(PAY_AS_YOU_GO_PLAN)}
            />
            <PlanCard
              name={PREMIUM_PLAN}
              price={`$${PREMIUM_PRICE}`}
              priceNote="every 30 days"
              features={[ALL_FEATURES, "Unlimited page views", `${PREMIUM_TRIAL_DAYS}-day free trial`]}
              current={data.current === "PREMIUM"}
              submitting={submitting}
              onChoose={() => choose(PREMIUM_PLAN)}
            />
          </div>
        </CardSection>
      </Card>

      {data.current && (
        <Card>
          <CardSection title="This billing period">
            <p>
              Page views checked: <strong>{data.views.toLocaleString()}</strong>
              {data.periodEnd && <> (period ends {date(data.periodEnd)})</>}
            </p>
            {data.current === "PAY_AS_YOU_GO" ? (
              <p>
                Usage charges so far: <strong>${data.charged.toFixed(2)}</strong> of $
                {USAGE_CAP} maximum (views so far are worth ${usageCost(data.views).toFixed(2)}).
              </p>
            ) : (
              data.trialEndsAt && <p>Free trial until {date(data.trialEndsAt)}.</p>
            )}
            <p className={styles.helpText}>
              Charges appear on your Shopify invoice. A page view is counted each
              time the app checks a storefront visit; your own devices with Admin
              Access are not counted.
            </p>
          </CardSection>
        </Card>
      )}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
