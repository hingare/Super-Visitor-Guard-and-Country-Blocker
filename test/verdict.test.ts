import { describe, expect, it } from "vitest";
import { parseIpRule } from "../app/lib/ip";
import {
  decide,
  isRedirectTarget,
  normalizePath,
  pageRuleMatches,
  type VerdictConfig,
  type VisitContext,
} from "../app/lib/verdict";

function ipRule(value: string) {
  const parsed = parseIpRule(value);
  if (!parsed.ok) throw new Error(parsed.error);
  return { id: value, value: parsed.value, matcher: parsed.matcher };
}

const baseConfig: VerdictConfig = {
  filtersEnabled: true,
  selectedPages: [],
  countryMode: "BLACKLIST",
  blockByStateCity: false,
  pageWhitelist: [],
  ipWhitelist: [],
  ipBlacklist: [],
  countries: [],
  regions: [],
  cities: [],
};

const visit: VisitContext = {
  ip: "203.0.113.7",
  country: "RU",
  regionCode: "MOW",
  regionName: "Moscow",
  city: "Moscow",
  path: "/products/hat",
  search: "",
  adminAccess: false,
};

const config = (overrides: Partial<VerdictConfig>) => ({ ...baseConfig, ...overrides });

describe("decide", () => {
  it("allows when nothing is configured", () => {
    expect(decide(baseConfig, visit).verdict).toBe("ALLOWED");
  });

  it("blocks a blacklisted country", () => {
    expect(decide(config({ countries: ["RU"] }), visit)).toMatchObject({
      verdict: "BLOCKED",
      blocker: "COUNTRY",
    });
  });

  it("whitelist mode blocks countries not on the list", () => {
    const whitelist = config({ countryMode: "WHITELIST", countries: ["US"] });
    expect(decide(whitelist, visit)).toMatchObject({ verdict: "BLOCKED", blocker: "COUNTRY" });
    expect(decide(whitelist, { ...visit, country: "US" }).verdict).toBe("ALLOWED");
  });

  it("whitelist mode lets everyone in while the list is empty or location is unknown", () => {
    expect(decide(config({ countryMode: "WHITELIST" }), visit).verdict).toBe("ALLOWED");
    expect(
      decide(config({ countryMode: "WHITELIST", countries: ["US"] }), { ...visit, country: null })
        .verdict,
    ).toBe("ALLOWED");
  });

  it("blocks by region and city only when the option is on", () => {
    const regions = config({ regions: ["RU:mow"], cities: [] });
    expect(decide(regions, visit).verdict).toBe("ALLOWED");
    expect(decide({ ...regions, blockByStateCity: true }, visit)).toMatchObject({
      verdict: "BLOCKED",
      reason: "Region: RU:mow",
    });
    const cities = config({ blockByStateCity: true, cities: ["RU:moscow"] });
    expect(decide(cities, visit)).toMatchObject({ verdict: "BLOCKED", reason: "City: RU:moscow" });
  });

  it("whitelist mode admits a whitelisted region of another country", () => {
    const whitelist = config({
      countryMode: "WHITELIST",
      blockByStateCity: true,
      countries: ["US"],
      regions: ["RU:moscow"],
    });
    expect(decide(whitelist, visit).verdict).toBe("ALLOWED");
    expect(decide(whitelist, { ...visit, regionCode: "SPE", regionName: "St.-Petersburg", city: null }).verdict).toBe(
      "BLOCKED",
    );
  });

  it("IP whitelist beats the country blacklist", () => {
    const result = decide(
      config({ countries: ["RU"], ipWhitelist: [ipRule("203.0.113.0/24")] }),
      visit,
    );
    expect(result).toMatchObject({ verdict: "ALLOWED", ruleId: "203.0.113.0/24" });
  });

  it("IP blacklist blocks before the country check", () => {
    const result = decide(config({ ipBlacklist: [ipRule("203.0.113.7")] }), {
      ...visit,
      country: "US",
    });
    expect(result).toMatchObject({ verdict: "BLOCKED", blocker: "IP", ruleId: "203.0.113.7" });
  });

  it("admin access, disabled filters and page white lists always pass", () => {
    const strict = config({ countries: ["RU"], ipBlacklist: [ipRule("203.0.113.7")] });
    expect(decide(strict, { ...visit, adminAccess: true }).verdict).toBe("ALLOWED");
    expect(decide({ ...strict, filtersEnabled: false }, visit).verdict).toBe("ALLOWED");
    expect(
      decide({ ...strict, pageWhitelist: [{ matchType: "EXACT", value: "/products/hat" }] }, visit)
        .verdict,
    ).toBe("ALLOWED");
  });

  it("only filters selected pages when some are selected", () => {
    const selective = config({ countries: ["RU"], selectedPages: ["/collections"] });
    expect(decide(selective, visit).verdict).toBe("ALLOWED");
    expect(decide(selective, { ...visit, path: "/collections/sale" }).verdict).toBe("BLOCKED");
    expect(decide(selective, { ...visit, path: "/collections-old" }).verdict).toBe("ALLOWED");
  });
});

describe("pageRuleMatches", () => {
  it("matches exact paths ignoring case and trailing slash", () => {
    expect(pageRuleMatches({ matchType: "EXACT", value: "/Pages/Contact/" }, "/pages/contact", "")).toBe(true);
    expect(pageRuleMatches({ matchType: "EXACT", value: "/pages/contact" }, "/pages/contact-us", "")).toBe(false);
  });

  it("matches partial text in path and query", () => {
    expect(pageRuleMatches({ matchType: "PARTIAL", value: "/blogs/" }, "/blogs/news/post", "")).toBe(true);
    expect(pageRuleMatches({ matchType: "PARTIAL", value: "ref=partner" }, "/", "?ref=partner")).toBe(true);
  });
});

describe("normalizePath", () => {
  it("lower-cases and trims slashes", () => {
    expect(normalizePath("/Products//Hat/")).toBe("/products/hat");
    expect(normalizePath("")).toBe("/");
  });
});

describe("isRedirectTarget", () => {
  const hosts = ["shop.example.com", "demo.myshopify.com"];

  it("recognises the redirect page on the store", () => {
    expect(isRedirectTarget("/pages/blocked", hosts, "/pages/blocked")).toBe(true);
    expect(isRedirectTarget("https://demo.myshopify.com/pages/blocked/", hosts, "/pages/blocked")).toBe(true);
  });

  it("ignores other pages and other sites", () => {
    expect(isRedirectTarget("/pages/blocked", hosts, "/")).toBe(false);
    expect(isRedirectTarget("https://other.com/pages/blocked", hosts, "/pages/blocked")).toBe(false);
    expect(isRedirectTarget(null, hosts, "/")).toBe(false);
  });
});
