// Matching of buyer details (email, phone, name, ZIP) against block rules.
// Shared by the checkout validation function (extensions/checkout-validation)
// and the order webhooks, so keep it free of Node and app imports.

export type CustomerField = "EMAIL" | "PHONE" | "NAME" | "ZIP";
export type MatchType = "EXACT" | "PARTIAL";

export interface CustomerRule {
  by: CustomerField;
  value: string;
  match: MatchType;
}

// Every value a buyer gave for each field (account, contact, addresses).
export interface CustomerIdentity {
  emails: string[];
  phones: string[];
  names: string[];
  zips: string[];
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,'"`()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeZip(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export const NORMALIZERS: Record<CustomerField, (value: string) => string> = {
  EMAIL: normalizeEmail,
  PHONE: normalizePhone,
  NAME: normalizeName,
  ZIP: normalizeZip,
};

const FIELD_VALUES: Record<CustomerField, keyof CustomerIdentity> = {
  EMAIL: "emails",
  PHONE: "phones",
  NAME: "names",
  ZIP: "zips",
};

// Phone numbers arrive with or without the country code, so an exact rule
// also matches when one number ends with the other (7+ digits).
function phoneEquals(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.endsWith(short);
}

function valueMatches(rule: CustomerRule, candidate: string): boolean {
  const value = NORMALIZERS[rule.by](candidate);
  if (value === "" || rule.value === "") return false;
  if (rule.match === "PARTIAL") return value.includes(rule.value);
  return rule.by === "PHONE" ? phoneEquals(value, rule.value) : value === rule.value;
}

// The first rule that matches any of the buyer's details, or null.
export function findCustomerMatch(
  identity: CustomerIdentity,
  rules: readonly CustomerRule[],
): CustomerRule | null {
  for (const rule of rules) {
    const candidates = identity[FIELD_VALUES[rule.by]];
    if (candidates.some((candidate) => valueMatches(rule, candidate))) return rule;
  }
  return null;
}

// Collects identity values, skipping empty ones and joining name parts.
export function buildIdentity(parts: {
  emails?: (string | null | undefined)[];
  phones?: (string | null | undefined)[];
  names?: ([string | null | undefined, string | null | undefined] | string | null | undefined)[];
  zips?: (string | null | undefined)[];
}): CustomerIdentity {
  const clean = (values: (string | null | undefined)[] = []) =>
    values.filter((value): value is string => typeof value === "string" && value.trim() !== "");
  return {
    emails: clean(parts.emails),
    phones: clean(parts.phones),
    names: clean(
      (parts.names ?? []).map((name) =>
        Array.isArray(name) ? name.filter(Boolean).join(" ") : name,
      ),
    ),
    zips: clean(parts.zips),
  };
}
