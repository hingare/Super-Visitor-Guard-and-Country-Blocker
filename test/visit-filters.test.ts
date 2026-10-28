import { describe, expect, it } from "vitest";
import { pageTypeLabel, readVisitFilters } from "../app/lib/visit-filters";

describe("readVisitFilters", () => {
  it("hides low-risk bots by default", () => {
    expect(readVisitFilters(new URLSearchParams())).toEqual({
      by: "ip",
      q: "",
      blockedOnly: false,
      botsOnly: false,
      hideLowRiskBots: true,
      page: 1,
    });
  });

  it("reads every filter", () => {
    const filters = readVisitFilters(
      new URLSearchParams("by=country&q=+DE+&blocked=1&bots=1&lowrisk=1&page=3"),
    );
    expect(filters).toEqual({
      by: "country",
      q: "DE",
      blockedOnly: true,
      botsOnly: true,
      hideLowRiskBots: false,
      page: 3,
    });
  });

  it("ignores a bad page number", () => {
    expect(readVisitFilters(new URLSearchParams("page=-2")).page).toBe(1);
    expect(readVisitFilters(new URLSearchParams("page=abc")).page).toBe(1);
  });
});

describe("pageTypeLabel", () => {
  it("names Shopify page types", () => {
    expect(pageTypeLabel("product")).toBe("Product");
    expect(pageTypeLabel("index")).toBe("Home");
    expect(pageTypeLabel("gift_card")).toBe("Gift_card");
    expect(pageTypeLabel(null)).toBe("Page");
  });
});
