import { describe, expect, it } from "vitest";
import { parseGeoRedirectForm } from "../app/lib/geo-redirect";

function form(countries: string[], targetUrl: string) {
  const data = new FormData();
  for (const country of countries) data.append("countries", country);
  data.set("targetUrl", targetUrl);
  return data;
}

describe("parseGeoRedirectForm", () => {
  it("accepts countries and a full URL", () => {
    expect(parseGeoRedirectForm(form(["de", "AT", "DE"], "https://de.example.com"))).toEqual({
      ok: true,
      countries: ["DE", "AT"],
      targetUrl: "https://de.example.com/",
    });
  });

  it("rejects bad input", () => {
    expect(parseGeoRedirectForm(form([], "https://de.example.com")).ok).toBe(false);
    expect(parseGeoRedirectForm(form(["ZZ"], "https://de.example.com")).ok).toBe(false);
    expect(parseGeoRedirectForm(form(["DE"], "de.example.com")).ok).toBe(false);
    expect(parseGeoRedirectForm(form(["DE"], "javascript:alert(1)")).ok).toBe(false);
  });
});
