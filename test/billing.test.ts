import { describe, expect, it } from "vitest";
import { amountDue, crossesChargeStep, currentPeriod, planFromName, usageCost } from "../app/lib/billing";

describe("usageCost", () => {
  it("keeps the first 500 views free", () => {
    expect(usageCost(0)).toBe(0);
    expect(usageCost(500)).toBe(0);
    expect(usageCost(599)).toBe(0);
  });

  it("charges $0.20 per full 100 views after that", () => {
    expect(usageCost(600)).toBe(0.2);
    expect(usageCost(1550)).toBe(2);
  });

  it("never exceeds the $4 cap", () => {
    expect(usageCost(2500)).toBe(4);
    expect(usageCost(1_000_000)).toBe(4);
  });
});

describe("amountDue", () => {
  it("charges only what was not charged yet", () => {
    expect(amountDue(800, 0.2)).toBe(0.4);
    expect(amountDue(800, 0.6)).toBe(0);
    expect(amountDue(10_000, 3.8)).toBe(0.2);
    expect(amountDue(10_000, 4)).toBe(0);
  });
});

describe("crossesChargeStep", () => {
  it("fires once per completed block of 100", () => {
    expect(crossesChargeStep(500)).toBe(false);
    expect(crossesChargeStep(600)).toBe(true);
    expect(crossesChargeStep(650)).toBe(false);
    expect(crossesChargeStep(700)).toBe(true);
  });
});

describe("currentPeriod", () => {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date("2026-10-01T00:00:00Z");

  it("stays in the stored period", () => {
    const period = currentPeriod(new Date(start.getTime() + 5 * day), start, null);
    expect(period).toEqual({ start, end: new Date(start.getTime() + 30 * day), rolled: false });
  });

  it("rolls over to the period containing now", () => {
    const end = new Date("2026-10-20T00:00:00Z");
    const period = currentPeriod(new Date(end.getTime() + 35 * day), start, end);
    expect(period.rolled).toBe(true);
    expect(period.start).toEqual(new Date(end.getTime() + 30 * day));
    expect(period.end).toEqual(new Date(end.getTime() + 60 * day));
  });
});

describe("planFromName", () => {
  it("maps Shopify subscription names to plans", () => {
    expect(planFromName("Pay as you go")).toBe("PAY_AS_YOU_GO");
    expect(planFromName("Premium")).toBe("PREMIUM");
    expect(planFromName("Other app plan")).toBeNull();
  });
});
