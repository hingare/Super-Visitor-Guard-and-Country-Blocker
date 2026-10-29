import type { OrderAction, OrderSource, Settings } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { getVerdictConfig } from "./rules.server";
import { toCustomerRules } from "../lib/checkout-validation";
import {
  decideOrder,
  decideRisk,
  orderFacts,
  parseRiskLevel,
  type OrderPayload,
} from "../lib/order-filters";
import { cancelOrder, deleteOrder, getOrderSummary, waitForJob } from "../services/orders.server";

// What the orders/create and orders/risk_assessment_changed webhooks do.

const AUTO_CANCEL_TYPES = ["AUTO_CANCEL_EMAIL", "AUTO_CANCEL_PHONE", "AUTO_CANCEL_NAME"] as const;

async function activeShop(shopDomain: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain }, include: { settings: true } });
  return shop?.settings && !shop.uninstalledAt ? { ...shop, settings: shop.settings } : null;
}

async function recordFlag(
  shopId: string,
  orderId: string,
  data: {
    orderName: string | null;
    email: string | null;
    riskLevel?: string | null;
    source: OrderSource;
    reason: string;
    actionTaken: OrderAction;
  },
) {
  await db.orderFlag.upsert({
    where: { shopId_orderId: { shopId, orderId } },
    create: { shopId, orderId, ...data },
    update: data,
  });
}

// Cancels the order with the merchant's refund and restock choices, then
// deletes it when asked. Returns what happened, for the order log.
async function cancelAndMaybeDelete(
  admin: AdminApiContext,
  settings: Settings,
  orderId: string,
  options: { reason: "FRAUD" | "OTHER"; note: string; delete: boolean },
): Promise<{ action: OrderAction; error?: string }> {
  try {
    return await runCancel(admin, settings, orderId, options);
  } catch (error) {
    console.error(`Could not act on order ${orderId}`, error);
    return { action: "FAILED", error: "Shopify could not be reached" };
  }
}

async function runCancel(
  admin: AdminApiContext,
  settings: Settings,
  orderId: string,
  options: { reason: "FRAUD" | "OTHER"; note: string; delete: boolean },
): Promise<{ action: OrderAction; error?: string }> {
  const cancelled = await cancelOrder(admin, orderId, {
    reason: options.reason,
    refund: settings.refundOnCancel,
    restock: settings.restockOnCancel,
    staffNote: options.note,
  });
  if (!cancelled.ok) return { action: "FAILED", error: cancelled.error };
  if (!options.delete) return { action: "CANCELLED" };

  if (cancelled.jobId && !(await waitForJob(admin, cancelled.jobId))) {
    return { action: "CANCELLED", error: "Cancelled; deleting timed out" };
  }
  const deleted = await deleteOrder(admin, orderId);
  return deleted.ok
    ? { action: "DELETED" }
    : { action: "CANCELLED", error: `Cancelled; could not delete: ${deleted.error}` };
}

export async function processNewOrder(
  shopDomain: string,
  admin: AdminApiContext,
  payload: OrderPayload,
) {
  const facts = orderFacts(payload);
  const shop = await activeShop(shopDomain);
  if (!facts || !shop) return;

  const existing = await db.orderFlag.findUnique({
    where: { shopId_orderId: { shopId: shop.id, orderId: facts.orderId } },
  });
  // Webhooks can arrive more than once.
  if (existing && existing.source !== "FRAUD_PROTECT" && existing.actionTaken !== "FAILED") return;

  const [verdictConfig, autoCancel] = await Promise.all([
    getVerdictConfig(shop.id, shop.settings),
    db.rule.findMany({
      where: { shopId: shop.id, enabled: true, type: { in: [...AUTO_CANCEL_TYPES] } },
      select: { type: true, value: true, matchType: true },
    }),
  ]);
  const decision = decideOrder(facts, {
    autoCancelRules: toCustomerRules(autoCancel),
    blockedVisitors: new Set(verdictConfig.blockedVisitors.map((rule) => rule.value)),
    ipWhitelist: verdictConfig.ipWhitelist,
    ipBlacklist: verdictConfig.ipBlacklist,
    deleteOrdersFromBlockedIps: shop.settings.deleteOrdersFromBlockedIps,
    deleteCodOrders: shop.settings.deleteCodOrders,
  });
  if (!decision) return;

  const result = await cancelAndMaybeDelete(admin, shop.settings, facts.orderId, {
    reason: "OTHER",
    note: decision.reason,
    delete: decision.delete,
  });
  await recordFlag(shop.id, facts.orderId, {
    orderName: facts.orderName,
    email: facts.email,
    source: decision.source,
    reason: result.error ? `${decision.reason}. ${result.error}` : decision.reason,
    actionTaken: result.action,
  });
}

export interface RiskPayload {
  risk_level?: string | null;
  order_id?: number | string | null;
  admin_graphql_api_order_id?: string | null;
}

export async function processRiskChange(
  shopDomain: string,
  admin: AdminApiContext,
  payload: RiskPayload,
) {
  const level = parseRiskLevel(payload.risk_level);
  const orderId =
    payload.admin_graphql_api_order_id ??
    (payload.order_id ? `gid://shopify/Order/${payload.order_id}` : null);
  const shop = await activeShop(shopDomain);
  if (!level || !orderId || !shop?.settings.fraudProtectEnabled) return;
  if (level === "PENDING") return;

  const existing = await db.orderFlag.findUnique({
    where: { shopId_orderId: { shopId: shop.id, orderId } },
  });
  if (existing && existing.actionTaken !== "SKIPPED" && existing.actionTaken !== "FAILED") return;

  const order = await getOrderSummary(admin, orderId);
  if (!order || order.cancelled) return;

  const whitelist = await db.rule.findMany({
    where: { shopId: shop.id, type: "FRAUD_WHITELIST_EMAIL", enabled: true },
    select: { value: true },
  });
  const decision = decideRisk(
    level,
    order.email,
    shop.settings,
    whitelist.map((rule) => rule.value),
  );

  const result = decision.cancel
    ? await cancelAndMaybeDelete(admin, shop.settings, orderId, {
        reason: "FRAUD",
        note: decision.reason,
        delete: shop.settings.deleteCodOrders && order.cashOnDelivery,
      })
    : { action: "SKIPPED" as const };
  await recordFlag(shop.id, orderId, {
    orderName: order.name,
    email: order.email,
    riskLevel: level,
    source: "FRAUD_PROTECT",
    reason: "error" in result && result.error ? `${decision.reason}. ${result.error}` : decision.reason,
    actionTaken: result.action,
  });
}
