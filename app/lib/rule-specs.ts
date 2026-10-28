// Validation for the list-style rules managed on the Phase 3 blocker pages.

import { isVisitorCode } from "./storefront";

export type ListRuleType =
  | "REFERRER"
  | "URL"
  | "ISP"
  | "ASN"
  | "ORGANIZATION"
  | "CRAWLER"
  | "VISITOR";

export const LIST_RULE_TYPES: readonly ListRuleType[] = [
  "REFERRER",
  "URL",
  "ISP",
  "ASN",
  "ORGANIZATION",
  "CRAWLER",
  "VISITOR",
];

export function isListRuleType(value: unknown): value is ListRuleType {
  return LIST_RULE_TYPES.includes(value as ListRuleType);
}

export type ParsedRuleValue = { ok: true; value: string } | { ok: false; error: string };

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
