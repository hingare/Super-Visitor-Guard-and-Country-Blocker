import { isCountryCode } from "./countries";

export type GeoRedirectInput =
  | { ok: true; countries: string[]; targetUrl: string }
  | { ok: false; error: string };

export const MAX_GEO_REDIRECTS = 100;

export function parseGeoRedirectForm(form: FormData): GeoRedirectInput {
  const countries = [
    ...new Set(form.getAll("countries").map((value) => String(value).toUpperCase())),
  ].filter(isCountryCode);
  if (countries.length === 0) return { ok: false, error: "Choose at least one country." };

  const raw = String(form.get("targetUrl") ?? "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Enter the full address of the store to send visitors to, such as https://de.example.com." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "The address must start with https://." };
  }
  return { ok: true, countries, targetUrl: url.toString() };
}
