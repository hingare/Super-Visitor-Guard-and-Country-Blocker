import type { CustomerRule, MatchType } from "./customer-match";
import { CUSTOMER_RULE_FIELDS, type CustomerRuleType } from "./rule-specs";
import type { CheckoutValidationConfig } from "../../extensions/checkout-validation/src/cart_validations_generate_run";

// Builds the JSON the checkout validation function reads from its metafield.

export const CHECKOUT_RULE_TYPES = [
  "CUSTOMER_EMAIL",
  "CUSTOMER_PHONE",
  "CUSTOMER_NAME",
  "CUSTOMER_ZIP",
] as const satisfies readonly CustomerRuleType[];

// Function input is capped by Shopify, so the metafield carries at most this
// many rules (newest first).
export const MAX_CHECKOUT_RULES = 500;
export const MAX_ERROR_MESSAGE = 200;
export const DEFAULT_ERROR_MESSAGE = "An error occurred during the checkout process.";

export function toCustomerRules(
  rules: { type: string; value: string; matchType: MatchType }[],
): CustomerRule[] {
  return rules.flatMap((rule) => {
    const by = CUSTOMER_RULE_FIELDS[rule.type as CustomerRuleType];
    return by ? [{ by, value: rule.value, match: rule.matchType }] : [];
  });
}

export function buildCheckoutConfig(
  settings: { checkoutErrorMessage: string; preventZeroCheckout: boolean },
  rules: { type: string; value: string; matchType: MatchType }[],
): CheckoutValidationConfig {
  return {
    message: settings.checkoutErrorMessage.trim() || DEFAULT_ERROR_MESSAGE,
    preventZero: settings.preventZeroCheckout,
    rules: toCustomerRules(rules.slice(0, MAX_CHECKOUT_RULES)),
  };
}

export function parseErrorMessage(input: FormDataEntryValue | null):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const value = String(input ?? "").trim();
  if (value === "") return { ok: false, error: "Enter the message buyers will see." };
  if (value.length > MAX_ERROR_MESSAGE) {
    return { ok: false, error: `Keep the message under ${MAX_ERROR_MESSAGE} characters.` };
  }
  return { ok: true, value };
}
