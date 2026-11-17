import { isCountryCode } from "./countries";

export type GeoRedirectInput =
  | { ok: true; countries: string[]; targetUrl: string; keepPath: boolean; askFirst: boolean }
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
  return {
    ok: true,
    countries,
    targetUrl: url.toString(),
    keepPath: form.get("keepPath") === "on",
    askFirst: form.get("askFirst") === "on",
  };
}

// Where a redirect sends the visitor. With keepPath, the page they opened
// is kept: https://de.example.com + /products/hat?color=red becomes
// https://de.example.com/products/hat?color=red. The app's own vg_*
// parameters are dropped, and a query on the target address wins.
export function geoTargetUrl(targetUrl: string, keepPath: boolean, path: string, search: string): string {
  if (!keepPath || !path.startsWith("/") || path.startsWith("//")) return targetUrl;
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return targetUrl;
  }
  target.pathname = target.pathname.replace(/\/+$/, "") + path;
  if (!target.search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const key of [...params.keys()]) if (key.startsWith("vg_")) params.delete(key);
    target.search = params.toString();
  }
  return target.toString();
}
