// Validation for the list-style rules managed on the blocker and order filter pages.

import { isVisitorCode } from "./storefront";
import { NORMALIZERS, type CustomerField } from "./customer-match";

export type ListRuleType =
  | "REFERRER"
  | "URL"
  | "ISP"
  | "ASN"
  | "ORGANIZATION"
  | "CRAWLER"
  | "VISITOR"
  | CustomerRuleType;

// Rules on buyer details: checkout validation, auto-cancel filters and the
// Fraud Protect email whitelist.
export type CustomerRuleType =
  | "CUSTOMER_EMAIL"
  | "CUSTOMER_PHONE"
  | "CUSTOMER_NAME"
  | "CUSTOMER_ZIP"
  | "AUTO_CANCEL_EMAIL"
  | "AUTO_CANCEL_PHONE"
  | "AUTO_CANCEL_NAME"
  | "FRAUD_WHITELIST_EMAIL";

export const CUSTOMER_RULE_FIELDS: Record<CustomerRuleType, CustomerField> = {
  CUSTOMER_EMAIL: "EMAIL",
  CUSTOMER_PHONE: "PHONE",
  CUSTOMER_NAME: "NAME",
  CUSTOMER_ZIP: "ZIP",
  AUTO_CANCEL_EMAIL: "EMAIL",
  AUTO_CANCEL_PHONE: "PHONE",
  AUTO_CANCEL_NAME: "NAME",
  FRAUD_WHITELIST_EMAIL: "EMAIL",
};

export const LIST_RULE_TYPES: readonly ListRuleType[] = [
  "REFERRER",
  "URL",
  "ISP",
  "ASN",
  "ORGANIZATION",
  "CRAWLER",
  "VISITOR",
  ...(Object.keys(CUSTOMER_RULE_FIELDS) as CustomerRuleType[]),
];

export function isListRuleType(value: unknown): value is ListRuleType {
  return LIST_RULE_TYPES.includes(value as ListRuleType);
}

export type ParsedRuleValue = { ok: true; value: string } | { ok: false; error: string };

function parseCustomerValue(field: CustomerField, raw: string, exact: boolean): ParsedRuleValue {
  const value = NORMALIZERS[field](raw);
  switch (field) {
    case "EMAIL":
      if (exact && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        return { ok: false, error: "Enter a full email address, or use Partial Match for text such as @example.com." };
      }
      break;
    case "PHONE":
      if (value.length < (exact ? 7 : 3)) {
        return { ok: false, error: "Enter a phone number with at least 7 digits." };
      }
      break;
    case "NAME":
    case "ZIP":
      if (value === "") return { ok: false, error: "Enter a value." };
      break;
  }
  return { ok: true, value };
}

// Referrer rules hold a host ("facebook.com") or any text for partial match.
function parseReferrer(raw: string, exact: boolean): ParsedRuleValue {
  if (!exact) return { ok: true, value: raw.toLowerCase() };
  try {
    const host = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
    return { ok: true, value: host.replace(/^www\./, "").toLowerCase() };
  } catch {
    return { ok: false, error: "Enter a site such as facebook.com." };
  }
}

export function parseRuleValue(
  type: ListRuleType,
  input: string,
  matchType: "EXACT" | "PARTIAL",
): ParsedRuleValue {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Enter a value." };
  if (raw.length > 500) return { ok: false, error: "That value is too long." };

  switch (type) {
    case "REFERRER":
      return parseReferrer(raw, matchType === "EXACT");
    case "URL":
      return { ok: true, value: raw.toLowerCase() };
    case "ASN": {
      const match = /^(?:as)?\s*(\d{1,10})$/i.exec(raw);
      const asn = match ? Number(match[1]) : NaN;
      if (!Number.isInteger(asn) || asn < 1 || asn > 4294967295) {
        return { ok: false, error: "Enter an AS number such as AS15169 or 15169." };
      }
      return { ok: true, value: String(asn) };
    }
    case "VISITOR": {
      const code = raw.toUpperCase();
      if (!isVisitorCode(code)) {
        return { ok: false, error: "Enter a visitor id from Shop Visitor Logs, such as CT-123456789." };
      }
      return { ok: true, value: code };
    }
    case "ISP":
    case "ORGANIZATION":
    case "CRAWLER":
      return { ok: true, value: raw.toLowerCase() };
    default:
      return parseCustomerValue(CUSTOMER_RULE_FIELDS[type], raw, matchType === "EXACT");
  }
}

// Shown under "Add Widely-Used Organizations": privacy relays and corporate
// networks whose users are almost always real shoppers.
export const WIDELY_USED_ORGANIZATIONS = [
  "icloud private relay",
  "apple",
  "cloudflare",
  "microsoft",
];
