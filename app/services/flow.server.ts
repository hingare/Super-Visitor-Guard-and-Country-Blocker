import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { RateLimiter } from "../lib/rate-limit";
import { triggerFromCallback, type FlowTrigger } from "../lib/flow";

// Sends Shopify Flow triggers, but only to shops with an enabled workflow
// that uses the trigger (known from Flow's lifecycle callbacks), so stores
// without Flow cost no API calls.

const USAGE_TTL_MS = 60_000;
const usageCache = new Map<string, { enabled: boolean; at: number }>();

export async function flowTriggerInUse(shopId: string, trigger: FlowTrigger, now = Date.now()) {
  const key = `${shopId}:${trigger.handle}`;
  const cached = usageCache.get(key);
  if (cached && now - cached.at < USAGE_TTL_MS) return cached.enabled;
  const usage = await db.flowTriggerUsage.findUnique({
    where: { shopId_trigger: { shopId, trigger: trigger.handle } },
  });
  const enabled = Boolean(usage?.enabled);
  if (usageCache.size > 20_000) usageCache.clear();
  usageCache.set(key, { enabled, at: now });
  return enabled;
}

export interface LifecyclePayload {
  flow_trigger_definition_id?: unknown;
  has_enabled_flow?: unknown;
  shopify_domain?: unknown;
  timestamp?: unknown;
}

// Stores a lifecycle callback; an older callback never overwrites a newer one.
export async function recordFlowLifecycle(payload: LifecyclePayload): Promise<boolean> {
  const trigger = triggerFromCallback(payload.flow_trigger_definition_id);
  const at = new Date(String(payload.timestamp ?? ""));
  if (!trigger || typeof payload.shopify_domain !== "string" || Number.isNaN(at.getTime())) return false;
  const shop = await db.shop.findUnique({ where: { shopDomain: payload.shopify_domain }, select: { id: true } });
  if (!shop) return false;
  const enabled = payload.has_enabled_flow === true;
  const updated = await db.flowTriggerUsage.updateMany({
    where: { shopId: shop.id, trigger: trigger.handle, updatedAt: { lt: at } },
    data: { enabled, updatedAt: at },
  });
  if (updated.count === 0) {
    await db.flowTriggerUsage
      .create({ data: { shopId: shop.id, trigger: trigger.handle, enabled, updatedAt: at } })
      .catch(() => null); // Already there with a newer timestamp.
  }
  usageCache.delete(`${shop.id}:${trigger.handle}`);
  return true;
}

export async function sendFlowTrigger(
  admin: AdminApiContext,
  trigger: FlowTrigger,
  payload: Record<string, unknown>,
) {
  const response = await admin.graphql(
    `#graphql
    mutation SendFlowTrigger($handle: String!, $payload: JSON!) {
      flowTriggerReceive(handle: $handle, payload: $payload) {
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { handle: trigger.handle, payload } },
  );
  const { data } = await response.json();
  const errors = data?.flowTriggerReceive?.userErrors ?? [];
  if (errors.length > 0) {
    console.error(`Flow trigger ${trigger.handle} was refused`, errors);
  }
}

// One "Visitor blocked" trigger a day per shop and IP address.
const blockedSent = new RateLimiter(1, 24 * 3_600_000, 100_000);

export function sendVisitorBlocked(
  shop: { id: string; shopDomain: string },
  ip: string,
  trigger: FlowTrigger,
  payload: Record<string, unknown>,
) {
  // Never holds up the verdict.
  void (async () => {
    try {
      if (!(await flowTriggerInUse(shop.id, trigger))) return;
      if (!blockedSent.hit(`${shop.id}:${ip}`)) return;
      const { admin } = await unauthenticated.admin(shop.shopDomain);
      await sendFlowTrigger(admin, trigger, payload);
    } catch (error) {
      console.error("Could not send the Flow trigger", error);
    }
  })();
}
