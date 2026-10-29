import { buildIdentity, findCustomerMatch, normalizeEmail, type CustomerIdentity, type CustomerRule } from "./customer-match";
import { ipMatches, normalizeIp, parseIp, type ParsedIp } from "./ip";
import type { IpRule } from "./verdict";
import { isVisitorCode } from "./storefront";

// Decisions behind the order webhooks: which new orders to cancel or delete
// (Auto-cancel filters, Block Lists, IP Blocker) and which risky orders
// Fraud Protect cancels. The webhooks do the API calls.

// The storefront script stores the visitor id on the cart under this
// attribute, so it reaches the order as a note attribute.
export const VISITOR_ATTRIBUTE = "_vg_visitor";

interface AddressPayload {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  phone?: string | null;
  zip?: string | null;
}

// The parts of the orders/create payload the filters read.
export interface OrderPayload {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  email?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  browser_ip?: string | null;
  client_details?: { browser_ip?: string | null } | null;
  cancelled_at?: string | null;
  payment_gateway_names?: string[] | null;
  note_attributes?: { name: string; value: unknown }[] | null;
  customer?: (AddressPayload & { email?: string | null }) | null;
  billing_address?: AddressPayload | null;
  shipping_address?: AddressPayload | null;
}

export interface OrderFacts {
  orderId: string;
  orderName: string | null;
  email: string | null;
  identity: CustomerIdentity;
  visitorCode: string | null;
  ip: ParsedIp | null;
  ipText: string | null;
  cancelled: boolean;
  // Cash on delivery and other manual payments; never card payments.
  manualPayment: boolean;
  cashOnDelivery: boolean;
}

export const COD_GATEWAY = /cash on delivery|\bcod\b/i;
const MANUAL_GATEWAY = /cash on delivery|\bcod\b|manual|bank deposit|money order|bank transfer/i;

export function orderFacts(order: OrderPayload): OrderFacts | null {
  const orderId = order.admin_graphql_api_id ?? (order.id ? `gid://shopify/Order/${order.id}` : null);
  if (!orderId) return null;
  const addresses = [order.billing_address, order.shipping_address, order.customer].filter(
    (address): address is AddressPayload => address != null,
  );
  const gateways = order.payment_gateway_names ?? [];
  const visitor = order.note_attributes?.find((attribute) => attribute.name === VISITOR_ATTRIBUTE);
  const visitorCode = typeof visitor?.value === "string" ? visitor.value.toUpperCase() : null;
  const ip = order.browser_ip ?? order.client_details?.browser_ip ?? null;
  const email = order.email || order.contact_email || order.customer?.email || null;

  return {
    orderId,
    orderName: order.name ?? null,
    email,
    identity: buildIdentity({
      emails: [order.email, order.contact_email, order.customer?.email],
      phones: [order.phone, ...addresses.map((address) => address.phone)],
      names: addresses.flatMap((address) => [
        [address.first_name, address.last_name] as [string | null | undefined, string | null | undefined],
        address.name,
      ]),
      zips: addresses.map((address) => address.zip),
    }),
    visitorCode: visitorCode && isVisitorCode(visitorCode) ? visitorCode : null,
    ip: ip ? parseIp(ip) : null,
    ipText: ip ? normalizeIp(ip) : null,
    cancelled: Boolean(order.cancelled_at),
    manualPayment: gateways.every((gateway) => MANUAL_GATEWAY.test(gateway)),
    cashOnDelivery: gateways.some((gateway) => COD_GATEWAY.test(gateway)),
  };
}

export type OrderSourceName = "AUTO_CANCEL" | "BLOCK_LIST" | "IP_BLOCKER";

export interface OrderDecision {
  source: OrderSourceName;
  reason: string;
  // Delete the order after cancelling it.
  delete: boolean;
}

export interface OrderFilterConfig {
  autoCancelRules: CustomerRule[];
  blockedVisitors: ReadonlySet<string>;
  ipWhitelist: IpRule[];
  ipBlacklist: IpRule[];
  deleteOrdersFromBlockedIps: boolean;
  deleteCodOrders: boolean;
}

const FIELD_LABELS: Record<CustomerRule["by"], string> = {
  EMAIL: "email",
  PHONE: "phone",
  NAME: "name",
  ZIP: "ZIP code",
};

export function decideOrder(facts: OrderFacts, config: OrderFilterConfig): OrderDecision | null {
  if (facts.cancelled) return null;
  const deleteCod = config.deleteCodOrders && facts.cashOnDelivery;

  const { ip } = facts;
  if (
    ip &&
    config.deleteOrdersFromBlockedIps &&
    facts.manualPayment &&
    !config.ipWhitelist.some((rule) => ipMatches(ip, rule.matcher))
  ) {
    const blocked = config.ipBlacklist.find((rule) => ipMatches(ip, rule.matcher));
    if (blocked) {
      return { source: "IP_BLOCKER", reason: `IP ${facts.ipText} is on the IP blacklist`, delete: true };
    }
  }

  const rule = findCustomerMatch(facts.identity, config.autoCancelRules);
  if (rule) {
    return {
      source: "AUTO_CANCEL",
      reason: `Buyer ${FIELD_LABELS[rule.by]} matches auto-cancel filter "${rule.value}"`,
      delete: deleteCod,
    };
  }

  if (facts.visitorCode && config.blockedVisitors.has(facts.visitorCode)) {
    return {
      source: "BLOCK_LIST",
      reason: `Visitor ${facts.visitorCode} is on the block list`,
      delete: deleteCod,
    };
  }
  return null;
}

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE" | "PENDING";

export function parseRiskLevel(value: unknown): RiskLevel | null {
  const level = String(value ?? "").toUpperCase();
  return ["HIGH", "MEDIUM", "LOW", "NONE", "PENDING"].includes(level) ? (level as RiskLevel) : null;
}

export type RiskDecision =
  | { cancel: true; reason: string }
  | { cancel: false; reason: string };

export function decideRisk(
  level: RiskLevel,
  email: string | null,
  settings: { cancelHighRisk: boolean; cancelMediumRisk: boolean },
  whitelist: readonly string[],
): RiskDecision {
  const normalized = email ? normalizeEmail(email) : null;
  if (normalized && whitelist.includes(normalized)) {
    return { cancel: false, reason: "Buyer email is on the Fraud Protect whitelist" };
  }
  if (level === "HIGH" && settings.cancelHighRisk) {
    return { cancel: true, reason: "Shopify marked the order as high risk" };
  }
  if (level === "MEDIUM" && settings.cancelMediumRisk) {
    return { cancel: true, reason: "Shopify marked the order as medium risk" };
  }
  return { cancel: false, reason: `Risk level ${level.toLowerCase()}; no action set` };
}
