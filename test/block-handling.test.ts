import { describe, expect, it } from "vitest";
import { DEFAULT_HEADER, parseHandlingForm } from "../app/lib/block-handling";
import { clientIp, isVisitorCode, newVisitorCode, storefrontAction } from "../app/lib/storefront";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseHandlingForm", () => {
  it("fills in default header and message", () => {
    expect(parseHandlingForm(form({ handling: "CUSTOM_INFO" }))).toMatchObject({
      ok: true,
      value: { handling: "CUSTOM_INFO", header: DEFAULT_HEADER },
    });
  });

  it("only returns the fields the option uses", () => {
    const result = parseHandlingForm(
      form({ handling: "REDIRECT", redirectUrl: "/pages/blocked", header: "ignored" }),
    );
    expect(result).toEqual({ ok: true, value: { handling: "REDIRECT", redirectUrl: "/pages/blocked" } });
  });

  it("validates each option", () => {
    expect(parseHandlingForm(form({ handling: "NOPE" })).ok).toBe(false);
    expect(parseHandlingForm(form({ handling: "REDIRECT", redirectUrl: "javascript:alert(1)" })).ok).toBe(false);
    expect(parseHandlingForm(form({ handling: "TEMPLATE", templateId: "missing" })).ok).toBe(false);
    expect(parseHandlingForm(form({ handling: "HIDE_SECTION", sectionSelector: "a{}" })).ok).toBe(false);
    expect(parseHandlingForm(form({ handling: "HIDE_SECTION", sectionSelector: ".price" })).ok).toBe(true);
  });
});

describe("storefrontAction", () => {
  const base = {
    handling: "CUSTOM_INFO" as const,
    header: "Closed",
    message: "Sorry",
    redirectUrl: null,
    templateId: null,
    sectionSelector: null,
  };

  it("falls back to the info page when a setting is missing", () => {
    expect(storefrontAction({ ...base, handling: "REDIRECT" }).type).toBe("CUSTOM_INFO");
    expect(storefrontAction({ ...base, handling: "HIDE_SECTION" }).type).toBe("CUSTOM_INFO");
    expect(storefrontAction(null).type).toBe("CUSTOM_INFO");
  });

  it("passes the chosen settings through", () => {
    expect(storefrontAction({ ...base, handling: "REDIRECT", redirectUrl: "/x" })).toMatchObject({
      type: "REDIRECT",
      redirectUrl: "/x",
    });
    expect(storefrontAction({ ...base, handling: "TEMPLATE" }).templateId).toBe("classic");
  });
});

describe("visitor helpers", () => {
  it("creates valid visitor codes", () => {
    const code = newVisitorCode();
    expect(isVisitorCode(code)).toBe(true);
    expect(isVisitorCode("CT-1")).toBe(false);
  });

  it("reads the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });
});
