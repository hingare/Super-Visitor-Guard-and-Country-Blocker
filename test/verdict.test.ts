import { describe, expect, it } from "vitest";
import { parseIpRule } from "../app/lib/ip";
import { UNKNOWN_NETWORK } from "../app/lib/network";
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
  botBlockerEnabled: false,
  orgWhitelist: [],
  crawlerWhitelist: [],
  crawlerBlacklist: [],
  blockedVisitors: [],
  referrerRules: [],
  urlRules: [],
  ispRules: [],
  asnRules: [],
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
  referrer: "",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15",
  visitorCode: "CT-123456789",
  network: UNKNOWN_NETWORK,
  bot: { isBot: false, claimedName: null, verified: false },
};

const rule = (value: string, matchType: "EXACT" | "PARTIAL" = "EXACT") => ({
  id: value,
  value,
  matchType,
});

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

describe("decide: phase 3 blockers", () => {
  const vpn = { ...UNKNOWN_NETWORK, asn: 9009, organization: "M247 Europe SRL", isVpn: true };

  it("blocks VPN, Tor, proxy and hosting traffic only when the bot blocker is on", () => {
    expect(decide(baseConfig, { ...visit, network: vpn }).verdict).toBe("ALLOWED");
    const on = config({ botBlockerEnabled: true });
    expect(decide(on, { ...visit, network: vpn })).toMatchObject({ blocker: "BOT_VPN", reason: "VPN" });
    expect(decide(on, { ...visit, network: { ...UNKNOWN_NETWORK, isTor: true } }).reason).toBe("Tor exit node");
    expect(decide(on, { ...visit, network: { ...UNKNOWN_NETWORK, isHosting: true } }).verdict).toBe("BLOCKED");
  });

  it("lets whitelisted organizations through the bot blocker", () => {
    const on = config({ botBlockerEnabled: true, orgWhitelist: [rule("m247", "PARTIAL")] });
    expect(decide(on, { ...visit, network: vpn }).verdict).toBe("ALLOWED");
  });

  it("always admits verified crawlers and blocks fake ones", () => {
    const strict = config({ botBlockerEnabled: true, countries: ["RU"] });
    expect(
      decide(strict, { ...visit, bot: { isBot: true, claimedName: "Googlebot", verified: true } }),
    ).toMatchObject({ verdict: "ALLOWED", reason: "Trusted bot: Googlebot" });
    expect(
      decide(config({ botBlockerEnabled: true }), {
        ...visit,
        bot: { isBot: true, claimedName: "Googlebot", verified: false },
      }),
    ).toMatchObject({ verdict: "BLOCKED", reason: "Fake Googlebot" });
  });

  it("applies crawler allow and block lists to the user agent", () => {
    const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0)";
    expect(decide(config({ crawlerBlacklist: [rule("ahrefsbot")] }), { ...visit, userAgent: ua })).toMatchObject({
      blocker: "BOT_VPN",
    });
    expect(
      decide(config({ crawlerBlacklist: [rule("ahrefsbot")], crawlerWhitelist: [rule("ahrefs")] }), {
        ...visit,
        userAgent: ua,
      }).verdict,
    ).toBe("ALLOWED");
  });

  it("blocks listed visitor ids", () => {
    expect(decide(config({ blockedVisitors: [rule("CT-123456789")] }), visit)).toMatchObject({
      blocker: "BLOCK_LIST",
    });
  });

  it("matches referrers by site or by text", () => {
    const exact = config({ referrerRules: [rule("spam.com")] });
    expect(decide(exact, { ...visit, referrer: "https://m.spam.com/x" })).toMatchObject({ blocker: "REFERRER" });
    expect(decide(exact, { ...visit, referrer: "https://notspam.com/" }).verdict).toBe("ALLOWED");
    expect(decide(exact, visit).verdict).toBe("ALLOWED");
    const partial = config({ referrerRules: [rule("ref=bad", "PARTIAL")] });
    expect(decide(partial, { ...visit, referrer: "https://x.com/?ref=bad" })).toMatchObject({ blocker: "REFERRER" });
  });

  it("blocks matching page URLs", () => {
    const rules = config({ urlRules: [rule("utm_source=spam", "PARTIAL")] });
    expect(decide(rules, { ...visit, search: "?utm_source=spam" })).toMatchObject({ blocker: "URL" });
    expect(decide(rules, visit).verdict).toBe("ALLOWED");
  });

  it("blocks by ASN and ISP name", () => {
    const network = { ...UNKNOWN_NETWORK, asn: 14061, organization: "DigitalOcean, LLC" };
    expect(decide(config({ asnRules: [rule("14061")] }), { ...visit, network }).reason).toBe("ASN: AS14061");
    expect(decide(config({ ispRules: [rule("digitalocean", "PARTIAL")] }), { ...visit, network })).toMatchObject({ blocker: "ISP_ASN" });
    expect(decide(config({ ispRules: [rule("digitalocean")] }), { ...visit, network }).verdict).toBe("ALLOWED");
  });

  it("keeps the IP whitelist above every phase 3 blocker", () => {
    const rules = config({
      botBlockerEnabled: true,
      blockedVisitors: [rule("CT-123456789")],
      ipWhitelist: [ipRule("203.0.113.7")],
    });
    expect(decide(rules, { ...visit, network: vpn }).verdict).toBe("ALLOWED");
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
