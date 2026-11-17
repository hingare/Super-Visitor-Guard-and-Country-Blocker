// Shopify Flow triggers the app sends (see extensions/flow-*). Payload keys
// must match the [[settings.fields]] keys in each extension's TOML exactly.

export const FLOW_TRIGGERS = {
  orderCancelled: {
    handle: "order-cancelled",
    name: "Order cancelled by Super Visitor Guard",
  },
  visitorBlocked: {
    handle: "visitor-blocked",
    name: "Visitor blocked by Super Visitor Guard",
  },
} as const;

export type FlowTrigger = (typeof FLOW_TRIGGERS)[keyof typeof FLOW_TRIGGERS];

// Flow's lifecycle callback names the trigger by its name; accept the handle too.
export function triggerFromCallback(definition: unknown): FlowTrigger | null {
  if (typeof definition !== "string") return null;
  return (
    Object.values(FLOW_TRIGGERS).find(
      (trigger) => trigger.name === definition || trigger.handle === definition,
    ) ?? null
  );
}

// "gid://shopify/Order/123" or 123 → 123
export function legacyOrderId(orderId: string): number | null {
  const match = /(\d+)$/.exec(orderId);
  return match ? Number(match[1]) : null;
}

const SOURCE_NAMES: Record<string, string> = {
  FRAUD_PROTECT: "Fraud Protect",
  AUTO_CANCEL: "Auto-cancel filters",
  BLOCK_LIST: "Block Lists",
  IP_BLOCKER: "IP Blocker",
};

export function orderCancelledPayload(order: {
  orderId: string;
  source: string;
  action: string;
  reason: string;
}): Record<string, string | number> | null {
  const id = legacyOrderId(order.orderId);
  if (!id) return null;
  return {
    order_id: id,
    Filter: SOURCE_NAMES[order.source] ?? order.source,
    Result: order.action.toLowerCase(),
    Reason: order.reason.slice(0, 1000),
  };
}

export function visitorBlockedPayload(visit: {
  ip: string;
  country: string | null;
  blocker: string;
  reason: string;
  visitorCode: string;
}): Record<string, string> {
  return {
    "IP address": visit.ip,
    "Country code": visit.country ?? "",
    Blocker: visit.blocker,
    Reason: visit.reason.slice(0, 500),
    "Visitor ID": visit.visitorCode,
  };
}
