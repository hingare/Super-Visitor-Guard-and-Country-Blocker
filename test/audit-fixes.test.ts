import { describe, expect, it } from "vitest";
import { customerSubject, formatDataRequest } from "../app/lib/compliance";
import { orderFacts, orderNeedsAnotherLook } from "../app/lib/order-filters";

describe("customerSubject", () => {
  it("reads a customers/redact payload", () => {
    const subject = customerSubject({
      customer: { id: 191167, email: " John@Example.com ", phone: "555-625-1199" },
      orders_to_redact: [299938, "280263", 220458],
    });
    expect(subject.orderIds).toEqual([
      "gid://shopify/Order/299938",
      "gid://shopify/Order/280263",
      "gid://shopify/Order/220458",
    ]);
    expect(subject.email).toBe("john@example.com");
    expect(subject.requestId).toBeNull();
  });

  it("reads a customers/data_request payload", () => {
    const subject = customerSubject({
      customer: { id: 191167, email: "john@example.com" },
      orders_requested: [299938, 299938],
      data_request: { id: 9999 },
    });
    expect(subject.orderIds).toEqual(["gid://shopify/Order/299938"]);
    expect(subject.requestId).toBe("9999");
  });

  it("ignores missing and malformed values", () => {
    expect(customerSubject({})).toEqual({ orderIds: [], email: null, requestId: null });
    const subject = customerSubject({ customer: { email: "  " }, orders_to_redact: ["12 OR 1=1", "", 7] });
    expect(subject).toEqual({ orderIds: ["gid://shopify/Order/7"], email: null, requestId: null });
  });
});

describe("formatDataRequest", () => {
  const subject = { orderIds: [], email: "john@example.com", requestId: "9999" };

  it("lists each order log entry", () => {
    const text = formatDataRequest("Super Visitor Guard", "demo.myshopify.com", subject, [
      {
        orderName: "#1001",
        email: "john@example.com",
        reason: "Shopify marked the order as high risk",
        actionTaken: "CANCELLED",
        createdAt: new Date("2026-11-01T10:00:00Z"),
      },
    ]);
    expect(text).toContain("Shopify data request 9999");
    expect(text).toContain("1 log entry");
    expect(text).toContain("2026-11-01  #1001  john@example.com  cancelled: Shopify marked the order as high risk");
  });

  it("says when nothing is held", () => {
    const text = formatDataRequest("Super Visitor Guard", "demo.myshopify.com", subject, []);
    expect(text).toContain("0 log entries");
    expect(text).toContain("(none)");
  });
});

describe("orderNeedsAnotherLook", () => {
  it("leaves finished orders alone", () => {
    expect(orderNeedsAnotherLook({ source: "FRAUD_PROTECT", actionTaken: "CANCELLED" })).toBe(false);
    expect(orderNeedsAnotherLook({ source: "FRAUD_PROTECT", actionTaken: "DELETED" })).toBe(false);
    expect(orderNeedsAnotherLook({ source: "AUTO_CANCEL", actionTaken: "CANCELLED" })).toBe(false);
    expect(orderNeedsAnotherLook({ source: "BLOCK_LIST", actionTaken: "DELETED" })).toBe(false);
  });

  it("retries failures and orders Fraud Protect only skipped", () => {
    expect(orderNeedsAnotherLook({ source: "AUTO_CANCEL", actionTaken: "FAILED" })).toBe(true);
    expect(orderNeedsAnotherLook({ source: "FRAUD_PROTECT", actionTaken: "FAILED" })).toBe(true);
    expect(orderNeedsAnotherLook({ source: "FRAUD_PROTECT", actionTaken: "SKIPPED" })).toBe(true);
  });
});

describe("manual payment", () => {
  it("is not assumed when the order names no payment gateway", () => {
    expect(orderFacts({ id: 1, payment_gateway_names: [] })?.manualPayment).toBe(false);
    expect(orderFacts({ id: 1 })?.manualPayment).toBe(false);
    expect(orderFacts({ id: 1, payment_gateway_names: ["Cash on Delivery (COD)"] })?.manualPayment).toBe(true);
    expect(orderFacts({ id: 1, payment_gateway_names: ["manual", "shopify_payments"] })?.manualPayment).toBe(false);
  });
});
