import { describe, expect, it } from "vitest";
import { classifyUserAgent, hostMatchesDomains } from "../app/lib/bots";
import { parseRuleValue } from "../app/lib/rule-specs";
import { storefrontAction } from "../app/lib/storefront";

describe("parseRuleValue", () => {
  it("reduces exact referrers to their host", () => {
    expect(parseRuleValue("REFERRER", "https://www.Spam.com/path", "EXACT")).toEqual({ ok: true, value: "spam.com" });
    expect(parseRuleValue("REFERRER", "spam.com", "EXACT")).toEqual({ ok: true, value: "spam.com" });
    expect(parseRuleValue("REFERRER", "Ref=Bad", "PARTIAL")).toEqual({ ok: true, value: "ref=bad" });
  });

  it("accepts AS numbers with or without the prefix", () => {
    expect(parseRuleValue("ASN", "AS14061", "EXACT")).toEqual({ ok: true, value: "14061" });
    expect(parseRuleValue("ASN", "14061", "EXACT")).toEqual({ ok: true, value: "14061" });
    expect(parseRuleValue("ASN", "abc", "EXACT").ok).toBe(false);
  });

  it("only accepts visitor ids for block lists", () => {
    expect(parseRuleValue("VISITOR", "ct-123456789", "EXACT")).toEqual({ ok: true, value: "CT-123456789" });
    expect(parseRuleValue("VISITOR", "123", "EXACT").ok).toBe(false);
  });

  it("rejects empty values", () => {
    expect(parseRuleValue("ISP", "  ", "EXACT").ok).toBe(false);
  });
});

describe("classifyUserAgent", () => {
  it("recognises trusted crawlers and other bots", () => {
    expect(
      classifyUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)").claimed?.name,
    ).toBe("Googlebot");
    expect(classifyUserAgent("Mozilla/5.0 (compatible; AhrefsBot/7.0)")).toEqual({ isBot: true, claimed: null });
    expect(
      classifyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148").isBot,
    ).toBe(false);
  });
});

describe("hostMatchesDomains", () => {
  it("accepts the domain and its subdomains only", () => {
    expect(hostMatchesDomains("crawl-66-249-66-1.googlebot.com.", ["googlebot.com"])).toBe(true);
    expect(hostMatchesDomains("evilgooglebot.com", ["googlebot.com"])).toBe(false);
  });
});

describe("storefrontAction for the referrer blocker", () => {
  const config = {
    handling: "CUSTOM_INFO" as const,
    header: "h",
    message: "m",
    redirectUrl: null,
    templateId: null,
    sectionSelector: null,
  };

  it("redirects instead of showing information", () => {
    expect(storefrontAction(config, "REFERRER")).toMatchObject({
      type: "REDIRECT",
      redirectUrl: "https://www.google.com",
    });
    expect(storefrontAction({ ...config, handling: "TEMPLATE" }, "REFERRER").type).toBe("TEMPLATE");
    expect(storefrontAction(config, "IP").type).toBe("CUSTOM_INFO");
  });
});
