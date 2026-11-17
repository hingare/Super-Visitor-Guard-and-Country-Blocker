import { describe, expect, it } from "vitest";
import { DEFAULT_HEADER, DEFAULT_MESSAGE } from "../app/lib/block-handling";
import { countryNameIn, localizeBlockText, pickLanguage, visitorTexts, VISITOR_LANGUAGES } from "../app/lib/visitor-texts";
import { geoTargetUrl } from "../app/lib/geo-redirect";
import { disposableDomain, DISPOSABLE_EMAIL_DOMAINS } from "../app/lib/disposable-emails";
import { decideOrder, orderFacts } from "../app/lib/order-filters";
import { parseBlockPageLook, storefrontBrand } from "../app/lib/block-page-look";

describe("visitor language", () => {
  it("picks the first supported language", () => {
    expect(pickLanguage("de-AT,de;q=0.9,en")).toBe("de");
    expect(pickLanguage("xx,fr-CA,en")).toBe("fr");
    expect(pickLanguage("zh-TW")).toBe("zh-TW");
    expect(pickLanguage("zh-Hant-HK")).toBe("zh-TW");
    expect(pickLanguage("zh")).toBe("zh-CN");
    expect(pickLanguage("pt_BR")).toBe("pt");
    expect(pickLanguage("")).toBe("en");
    expect(pickLanguage("xx,yy")).toBe("en");
  });

  it("has every text in every language", () => {
    for (const lang of VISITOR_LANGUAGES) {
      const texts = visitorTexts(lang);
      for (const value of Object.values(texts)) expect(value, lang).toBeTruthy();
    }
    expect(visitorTexts("ar").dir).toBe("rtl");
    expect(visitorTexts("bn").dir).toBe("ltr");
    expect(visitorTexts("nope").lang).toBe("en");
  });

  it("translates only the default block text", () => {
    expect(localizeBlockText(DEFAULT_HEADER, DEFAULT_MESSAGE, "de")).toEqual({
      header: "Zugriff verweigert",
      message: visitorTexts("de").message,
    });
    expect(localizeBlockText("Closed", DEFAULT_MESSAGE, "es")).toEqual({
      header: "Closed",
      message: visitorTexts("es").message,
    });
    expect(localizeBlockText(DEFAULT_HEADER, "Mine", "en")).toEqual({ header: DEFAULT_HEADER, message: "Mine" });
  });

  it("names the country in the visitor's language", () => {
    expect(countryNameIn("DE", "de")).toBe("Deutschland");
    expect(countryNameIn("DE", "en")).toBe("Germany");
  });
});

describe("geo redirect target", () => {
  it("keeps the page and query when asked", () => {
    expect(geoTargetUrl("https://de.example.com/", true, "/products/hat", "?color=red&vg_test_ip=1")).toBe(
      "https://de.example.com/products/hat?color=red",
    );
    expect(geoTargetUrl("https://example.com/de", true, "/products/hat", "")).toBe(
      "https://example.com/de/products/hat",
    );
    expect(geoTargetUrl("https://de.example.com/?ref=geo", true, "/cart", "?a=1")).toBe(
      "https://de.example.com/cart?ref=geo",
    );
  });

  it("goes to the plain target otherwise", () => {
    expect(geoTargetUrl("https://de.example.com/", false, "/products/hat", "")).toBe("https://de.example.com/");
    expect(geoTargetUrl("https://de.example.com/", true, "//evil.com/x", "")).toBe("https://de.example.com/");
  });
});

describe("throwaway email addresses", () => {
  it("finds known services and their subdomains", () => {
    expect(DISPOSABLE_EMAIL_DOMAINS.size).toBeGreaterThan(100);
    expect(disposableDomain("someone@Mailinator.com")).toBe("mailinator.com");
    expect(disposableDomain("x@inbox.yopmail.com")).toBe("yopmail.com");
    expect(disposableDomain("x@gmail.com")).toBeNull();
    expect(disposableDomain("x@notmailinator.com")).toBeNull();
    expect(disposableDomain("nobody")).toBeNull();
  });

  it("cancels such orders only when the filter is on", () => {
    const facts = orderFacts({ id: 7, name: "#1007", email: "buyer@yopmail.com" })!;
    const config = {
      autoCancelRules: [],
      blockedVisitors: new Set<string>(),
      ipWhitelist: [],
      ipBlacklist: [],
      deleteOrdersFromBlockedIps: false,
      deleteCodOrders: false,
    };
    expect(decideOrder(facts, config)).toBeNull();
    expect(decideOrder(facts, { ...config, cancelDisposableEmails: true })).toMatchObject({
      source: "AUTO_CANCEL",
      reason: "Buyer email buyer@yopmail.com uses a throwaway email service (yopmail.com)",
    });
  });
});

describe("block page look", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  it("validates the logo and color", () => {
    expect(parseBlockPageLook(form({ useBrand: "on", color: "#1A73E8" }))).toEqual({
      ok: true,
      value: { blockPageBranding: true, blockPageLogoUrl: null, blockPageColor: "#1a73e8" },
    });
    expect(parseBlockPageLook(form({ useBrand: "on", logoUrl: "http://x.com/a.png" })).ok).toBe(false);
    expect(parseBlockPageLook(form({ useBrand: "on", logoUrl: "javascript:alert(1)" })).ok).toBe(false);
    expect(parseBlockPageLook(form({ useBrand: "on", color: "red" })).ok).toBe(false);
  });

  it("sends the brand only when it is on", () => {
    expect(storefrontBrand({ useBrand: false, logoUrl: "https://a/b.png", color: null })).toBeUndefined();
    expect(storefrontBrand({ useBrand: true, logoUrl: null, color: "#000000" })).toEqual({
      logo: undefined,
      color: "#000000",
    });
  });
});
