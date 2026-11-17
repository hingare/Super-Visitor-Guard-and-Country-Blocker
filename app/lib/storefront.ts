// Shapes shared by the verdict API and its tests.

import { DEFAULT_HEADER, DEFAULT_MESSAGE, type BlockHandling } from "./block-handling";

export interface StorefrontAction {
  type: BlockHandling;
  header: string;
  message: string;
  redirectUrl?: string;
  templateId?: string;
  sectionSelector?: string;
  // Page text in the visitor's language (see lib/visitor-texts).
  texts?: PageTexts;
  // Store logo and color, when the merchant turned on the block page look.
  // Empty fields fall back to the brand the theme embed reads from Shopify.
  brand?: StorefrontBrand;
}

export interface PageTexts {
  lang: string;
  dir: "ltr" | "rtl";
  checkTitle: string;
  checkNote: string;
}

export interface StorefrontBrand {
  logo?: string;
  color?: string;
}

// A banner offering the visitor's regional store (Geolocation Redirects
// with "ask first").
export interface GeoOffer {
  url: string;
  country: string;
  text: string;
  go: string;
  stay: string;
  lang: string;
  dir: "ltr" | "rtl";
  brand?: StorefrontBrand;
}

export interface VerdictResponse {
  verdict: "ALLOWED" | "BLOCKED";
  action?: StorefrontAction;
  visitorCode?: string;
  // Set when an Admin Access invitation was accepted on this device.
  adminToken?: string;
  clearAdminToken?: boolean;
  // Where to send the visitor next, e.g. home after an Auto-Whitelist link.
  redirect?: string;
  geoOffer?: GeoOffer;
}

// Shopify's app proxy passes the shopper's address first in X-Forwarded-For.
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return headers.get("x-real-ip");
}

const VISITOR_CODE = /^CT-\d{9}$/;

export function isVisitorCode(value: string): boolean {
  return VISITOR_CODE.test(value);
}

export function newVisitorCode(): string {
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000_000;
  return `CT-${100_000_000 + digits}`;
}

// The referrer blocker cannot show information on the page (the visitor
// would simply browse on from it), so it redirects instead.
export const DEFAULT_REFERRER_REDIRECT = "https://www.google.com";

export function storefrontAction(
  config: {
    handling: BlockHandling;
    header: string;
    message: string;
    redirectUrl: string | null;
    templateId: string | null;
    sectionSelector: string | null;
  } | null,
  blocker?: string,
): StorefrontAction {
  const needsRedirect =
    !config ||
    config.handling === "CUSTOM_INFO" ||
    (config.handling === "REDIRECT" && !config.redirectUrl);
  if (blocker === "REFERRER" && needsRedirect) {
    return {
      type: "REDIRECT",
      header: DEFAULT_HEADER,
      message: DEFAULT_MESSAGE,
      redirectUrl: config?.redirectUrl || DEFAULT_REFERRER_REDIRECT,
    };
  }
  if (!config) return { type: "CUSTOM_INFO", header: DEFAULT_HEADER, message: DEFAULT_MESSAGE };
  const action: StorefrontAction = {
    type: config.handling,
    header: config.header || DEFAULT_HEADER,
    message: config.message || DEFAULT_MESSAGE,
  };
  // Fall back to the custom information page when the chosen option is
  // missing its setting.
  if (config.handling === "REDIRECT") {
    if (config.redirectUrl) action.redirectUrl = config.redirectUrl;
    else action.type = "CUSTOM_INFO";
  }
  if (config.handling === "TEMPLATE") action.templateId = config.templateId ?? "classic";
  if (config.handling === "HIDE_SECTION") {
    if (config.sectionSelector) action.sectionSelector = config.sectionSelector;
    else action.type = "CUSTOM_INFO";
  }
  return action;
}
