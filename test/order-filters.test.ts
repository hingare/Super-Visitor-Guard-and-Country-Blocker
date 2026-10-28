import { describe, expect, it } from "vitest";
import { buildIdentity, findCustomerMatch, type CustomerRule } from "../app/lib/customer-match";
import { parseRuleValue } from "../app/lib/rule-specs";
import { decideOrder, decideRisk, orderFacts, parseRiskLevel, type OrderFilterConfig } from "../app/lib/order-filters";
import { buildCheckoutConfig, parseErrorMessage } from "../app/lib/checkout-validation";
import { parseIpRule } from "../app/lib/ip";
import {
  cartValidationsGenerateRun,
  type CartValidationsGenerateRunInput,
} from "../extensions/checkout-validation/src/cart_validations_generate_run";

const rule = (by: CustomerRule["by"], value: string, match: CustomerRule["match"] = "EXACT"): CustomerRule => ({
  by,
  value,
  match,
});

describe("customer rule values", () => {
  it("normalises each field", () => {
    expect(parseRuleValue("CUSTOMER_EMAIL", " Bad@Example.COM ", "EXACT")).toEqual({ ok: true, value: "bad@example.com" });
    expect(parseRuleValue("CUSTOMER_PHONE", "+1 (555) 010-9999", "EXACT")).toEqual({ ok: true, value: "15550109999" });
    expect(parseRuleValue("AUTO_CANCEL_NAME", "  John   O'Neil ", "EXACT")).toEqual({ ok: true, value: "john o neil" });
    expect(parseRuleValue("CUSTOMER_ZIP", "sw1a 1aa", "EXACT")).toEqual({ ok: true, value: "SW1A1AA" });
  });

  it("needs a full email for exact rules only", () => {
    expect(parseRuleValue("CUSTOMER_EMAIL", "@spam.com", "EXACT").ok).toBe(false);
    expect(parseRuleValue("CUSTOMER_EMAIL", "@spam.com", "PARTIAL")).toEqual({ ok: true, value: "@spam.com" });
    expect(parseRuleValue("CUSTOMER_PHONE", "12", "EXACT").ok).toBe(false);
  });
});

describe("findCustomerMatch", () => {
  const identity = buildIdentity({
    emails: ["Jane@Spam.com", null],
    phones: ["+44 7700 900123"],
    names: [["Jane", "Doe"], ""],
    zips: ["sw1a 1aa"],
  });

  it("matches exact and partial values", () => {
    expect(findCustomerMatch(identity, [rule("EMAIL", "jane@spam.com")])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("EMAIL", "@spam.com", "PARTIAL")])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("NAME", "jane doe")])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("ZIP", "SW1A1AA")])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("EMAIL", "jane@other.com")])).toBeNull();
    expect(findCustomerMatch(identity, [rule("NAME", "jane")])).toBeNull();
  });

  it("matches phones with or without the country code", () => {
    expect(findCustomerMatch(identity, [rule("PHONE", "07700900123".slice(1))])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("PHONE", "447700900123")])).not.toBeNull();
    expect(findCustomerMatch(identity, [rule("PHONE", "900123")])).toBeNull();
  });
});

describe("checkout validation function", () => {
  const input = (overrides: Partial<CartValidationsGenerateRunInput["cart"]> = {}, config: unknown = {
    message: "Sorry, you cannot check out.",
    preventZero: true,
    rules: [rule("EMAIL", "bad@example.com")],
  }, step = "CHECKOUT_COMPLETION"): CartValidationsGenerateRunInput => ({
    buyerJourney: { step },
    validation: { metafield: { jsonValue: config } },
    cart: {
      lines: [{ quantity: 1 }],
      cost: { totalAmount: { amount: "25.0" } },
      buyerIdentity: { email: "good@example.com", phone: null, customer: null },
      deliveryGroups: [{ deliveryAddress: { firstName: "Ann", lastName: "Lee", phone: null, zip: "10001" } }],
      ...overrides,
    },
  });

  it("lets ordinary buyers through", () => {
    expect(cartValidationsGenerateRun(input()).operations).toEqual([]);
  });

  it("stops blocked buyers with the merchant's message", () => {
    const result = cartValidationsGenerateRun(
      input({ buyerIdentity: { email: "BAD@example.com" } }),
    );
    expect(result.operations).toEqual([
      { validationAdd: { errors: [{ message: "Sorry, you cannot check out.", target: "$.cart" }] } },
    ]);
  });

  it("stops zero-total checkouts when asked", () => {
    expect(cartValidationsGenerateRun(input({ cost: { totalAmount: { amount: "0.0" } } })).operations).toHaveLength(1);
  });

  it("never blocks adding to cart or runs without config", () => {
    expect(
      cartValidationsGenerateRun(input({ buyerIdentity: { email: "bad@example.com" } }, undefined, "CART_INTERACTION"))
        .operations,
    ).toEqual([]);
    expect(cartValidationsGenerateRun(input({}, null)).operations).toEqual([]);
  });

  it("reads the config the admin page builds", () => {
    const config = buildCheckoutConfig(
      { checkoutErrorMessage: "  ", preventZeroCheckout: false },
      [{ type: "CUSTOMER_ZIP", value: "10001", matchType: "EXACT" }],
    );
    expect(config).toEqual({
      message: "An error occurred during the checkout process.",
      preventZero: false,
      rules: [{ by: "ZIP", value: "10001", match: "EXACT" }],
    });
    expect(cartValidationsGenerateRun(input({}, config)).operations).toHaveLength(1);
  });

  it("validates the error message", () => {
    expect(parseErrorMessage(" ").ok).toBe(false);
    expect(parseErrorMessage("x".repeat(201)).ok).toBe(false);
    expect(parseErrorMessage(" Not allowed ")).toEqual({ ok: true, value: "Not allowed" });
  });
});

describe("decideOrder", () => {
  const ipRule = (value: string) => {
    const parsed = parseIpRule(value);
    if (!parsed.ok) throw new Error(value);
    return { id: value, value, matcher: parsed.matcher };
  };
  const config: OrderFilterConfig = {
    autoCancelRules: [rule("EMAIL", "bad@example.com")],
    blockedVisitors: new Set(["CT-123456789"]),
    ipWhitelist: [ipRule("203.0.113.9")],
    ipBlacklist: [ipRule("203.0.113.0/24")],
    deleteOrdersFromBlockedIps: true,
    deleteCodOrders: false,
  };
  const facts = (order: Parameters<typeof orderFacts>[0]) => {
    const result = orderFacts({ id: 1, name: "#1001", ...order });
    if (!result) throw new Error("no facts");
    return result;
  };

  it("cancels orders from auto-cancel buyers", () => {
    expect(decideOrder(facts({ customer: { email: "Bad@example.com" } }), config)).toMatchObject({
      source: "AUTO_CANCEL",
      delete: false,
    });
  });

  it("cancels orders from blocked visitors", () => {
    const order = facts({ note_attributes: [{ name: "_vg_visitor", value: "ct-123456789" }] });
    expect(decideOrder(order, config)).toMatchObject({ source: "BLOCK_LIST" });
  });

  it("deletes COD orders from blocked IPs, never card orders", () => {
    const cod = facts({ browser_ip: "203.0.113.7", payment_gateway_names: ["Cash on Delivery (COD)"] });
    expect(decideOrder(cod, config)).toMatchObject({ source: "IP_BLOCKER", delete: true });
    const card = facts({ browser_ip: "203.0.113.7", payment_gateway_names: ["shopify_payments"] });
    expect(decideOrder(card, config)).toBeNull();
    const whitelisted = facts({ browser_ip: "203.0.113.9", payment_gateway_names: ["manual"] });
    expect(decideOrder(whitelisted, config)).toBeNull();
  });

  it("deletes cancelled COD orders when asked", () => {
    const order = facts({ email: "bad@example.com", payment_gateway_names: ["Cash on Delivery (COD)"] });
    expect(decideOrder(order, { ...config, deleteCodOrders: true })).toMatchObject({ delete: true });
  });

  it("ignores cancelled and clean orders", () => {
    expect(decideOrder(facts({ email: "bad@example.com", cancelled_at: "2026-01-01" }), config)).toBeNull();
    expect(decideOrder(facts({ email: "ok@example.com" }), config)).toBeNull();
  });
});

describe("decideRisk", () => {
  const settings = { cancelHighRisk: true, cancelMediumRisk: false };

  it("cancels the risk levels the merchant chose", () => {
    expect(decideRisk("HIGH", "a@b.com", settings, []).cancel).toBe(true);
    expect(decideRisk("MEDIUM", "a@b.com", settings, []).cancel).toBe(false);
    expect(decideRisk("MEDIUM", "a@b.com", { ...settings, cancelMediumRisk: true }, []).cancel).toBe(true);
    expect(decideRisk("LOW", "a@b.com", settings, []).cancel).toBe(false);
  });

  it("skips whitelisted buyers", () => {
    expect(decideRisk("HIGH", "VIP@b.com", settings, ["vip@b.com"]).cancel).toBe(false);
  });

  it("parses webhook risk levels", () => {
    expect(parseRiskLevel("medium")).toBe("MEDIUM");
    expect(parseRiskLevel("weird")).toBeNull();
  });
});
