import { describe, expect, it } from "vitest";
import {
  accessLinkUrl,
  isChecked,
  parsePagePath,
  readSelectedPages,
} from "../app/lib/settings";

describe("parsePagePath", () => {
  it("normalizes paths", () => {
    expect(parsePagePath("/products/Hat/")).toEqual({
      ok: true,
      path: "/products/hat",
    });
    expect(parsePagePath("collections/all?page=2#top")).toEqual({
      ok: true,
      path: "/collections/all",
    });
    expect(parsePagePath("/")).toEqual({ ok: true, path: "/" });
  });

  it("takes the path from a full URL", () => {
    expect(parsePagePath("https://demo.myshopify.com/pages/about-us")).toEqual({
      ok: true,
      path: "/pages/about-us",
    });
  });

  it("rejects empty input and odd characters", () => {
    expect(parsePagePath("  ").ok).toBe(false);
    expect(parsePagePath("/pages/<script>").ok).toBe(false);
  });
});

describe("readSelectedPages", () => {
  it("keeps only strings from stored JSON", () => {
    expect(readSelectedPages(["/a", 3, null, "/b"])).toEqual(["/a", "/b"]);
    expect(readSelectedPages({})).toEqual([]);
  });
});

describe("isChecked", () => {
  it("reads checkbox values", () => {
    expect(isChecked("on")).toBe(true);
    expect(isChecked("true")).toBe(true);
    expect(isChecked(null)).toBe(false);
  });
});

describe("accessLinkUrl", () => {
  it("builds storefront links with the right parameter", () => {
    expect(accessLinkUrl("demo.myshopify.com", "AUTO_WHITELIST", "abc")).toBe(
      "https://demo.myshopify.com/?vg_whitelist=abc",
    );
    expect(accessLinkUrl("demo.myshopify.com", "ADMIN_INVITE", "xyz")).toBe(
      "https://demo.myshopify.com/?vg_admin=xyz",
    );
  });
});
