// Helpers for the General Settings page. Kept free of server imports so they
// can be unit tested and reused by the storefront API later.

export const MAX_SELECTED_PAGES = 50;

// Polaris checkboxes and switches submit "on" when checked and nothing when not.
export function isChecked(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

export type PagePathResult = { ok: true; path: string } | { ok: false; error: string };

// Accepts a storefront path ("/products/hat") or a full store URL and
// returns the normalized path without query string, hash or trailing slash.
export function parsePagePath(input: string): PagePathResult {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Enter a page path or URL." };

  let path: string;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      return { ok: false, error: "Enter a valid URL." };
    }
  } else {
    path = raw.startsWith("/") ? raw : `/${raw}`;
    path = path.split(/[?#]/)[0];
  }

  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (!/^\/[\w\-./%]*$/.test(path)) {
    return { ok: false, error: "Use letters, numbers, dashes and slashes only." };
  }
  return { ok: true, path: path.toLowerCase() };
}

export function readSelectedPages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export const ACCESS_PARAM = {
  ADMIN_INVITE: "vg_admin",
  AUTO_WHITELIST: "vg_whitelist",
} as const;

export function accessLinkUrl(
  shopDomain: string,
  kind: keyof typeof ACCESS_PARAM,
  token: string,
): string {
  const url = new URL(`https://${shopDomain}/`);
  url.searchParams.set(ACCESS_PARAM[kind], token);
  return url.toString();
}
