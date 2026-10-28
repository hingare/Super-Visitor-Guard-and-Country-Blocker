// Decides whether a storefront visit passes or is blocked. Pure so it can be
// unit tested; the verdict API loads the shop's rules and calls decide().
//
// Order of checks, first match wins:
//   1. Admin Access Mode on this device
//   2. All filters switched off
//   3. Page White Lists
//   4. Selective Page Filtering (page not selected)
//   5. IP whitelist, then IP blacklist (highest-priority blocker)
//   6. Country Blocker (countries, then states/provinces and cities)

import type { IpMatcher } from "./ip";
import { ipMatches, parseIp } from "./ip";
import { regionRuleValue } from "./countries";

export type CountryMode = "BLACKLIST" | "WHITELIST";
export type MatchType = "EXACT" | "PARTIAL";

export interface PageRule {
  matchType: MatchType;
  value: string;
}

export interface IpRule {
  id: string;
  value: string;
  matcher: IpMatcher;
}

export interface VerdictConfig {
  filtersEnabled: boolean;
  selectedPages: string[];
  countryMode: CountryMode;
  blockByStateCity: boolean;
  pageWhitelist: PageRule[];
  ipWhitelist: IpRule[];
  ipBlacklist: IpRule[];
  // Rules for the active country mode only.
  countries: string[];
  regions: string[];
  cities: string[];
}

export interface VisitContext {
  ip: string | null;
  country: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  // Lower-cased storefront path without trailing slash, e.g. "/products/hat".
  path: string;
  // Query string including "?", used by partial page matches.
  search: string;
  adminAccess: boolean;
}

export type Decision =
  | { verdict: "ALLOWED"; reason: string; ruleId?: string }
  | { verdict: "BLOCKED"; blocker: "IP" | "COUNTRY"; reason: string; ruleId?: string };

export function normalizePath(pathname: string): string {
  let path = pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

export function pageRuleMatches(rule: PageRule, path: string, search: string): boolean {
  const value = rule.value.toLowerCase();
  if (rule.matchType === "EXACT") return normalizePath(value) === path;
  return `${path}${search.toLowerCase()}`.includes(value);
}

function isSelectedPage(selected: string[], path: string): boolean {
  return selected.some((page) => path === page || path.startsWith(`${page}/`));
}

function placeMatches(
  rules: string[],
  country: string | null,
  ...places: (string | null)[]
): string | null {
  if (!country) return null;
  for (const place of places) {
    if (!place) continue;
    const value = regionRuleValue(country, place);
    if (rules.includes(value)) return value;
  }
  return null;
}

export function decide(config: VerdictConfig, ctx: VisitContext): Decision {
  if (ctx.adminAccess) return { verdict: "ALLOWED", reason: "Admin access" };
  if (!config.filtersEnabled) return { verdict: "ALLOWED", reason: "Filters disabled" };

  if (config.pageWhitelist.some((rule) => pageRuleMatches(rule, ctx.path, ctx.search))) {
    return { verdict: "ALLOWED", reason: "Page white list" };
  }
  if (config.selectedPages.length > 0 && !isSelectedPage(config.selectedPages, ctx.path)) {
    return { verdict: "ALLOWED", reason: "Page not filtered" };
  }

  const ip = ctx.ip ? parseIp(ctx.ip) : null;
  if (ip) {
    const allowed = config.ipWhitelist.find((rule) => ipMatches(ip, rule.matcher));
    if (allowed) {
      return { verdict: "ALLOWED", reason: `IP whitelist: ${allowed.value}`, ruleId: allowed.id };
    }
    const blocked = config.ipBlacklist.find((rule) => ipMatches(ip, rule.matcher));
    if (blocked) {
      return {
        verdict: "BLOCKED",
        blocker: "IP",
        reason: `IP: ${blocked.value}`,
        ruleId: blocked.id,
      };
    }
  }

  return decideCountry(config, ctx);
}

function decideCountry(config: VerdictConfig, ctx: VisitContext): Decision {
  const country = ctx.country?.toUpperCase() ?? null;
  const countryListed = country !== null && config.countries.includes(country);
  const region = config.blockByStateCity
    ? placeMatches(config.regions, country, ctx.regionCode, ctx.regionName)
    : null;
  const city = config.blockByStateCity ? placeMatches(config.cities, country, ctx.city) : null;

  if (config.countryMode === "BLACKLIST") {
    if (countryListed) return { verdict: "BLOCKED", blocker: "COUNTRY", reason: `Country: ${country}` };
    if (region) return { verdict: "BLOCKED", blocker: "COUNTRY", reason: `Region: ${region}` };
    if (city) return { verdict: "BLOCKED", blocker: "COUNTRY", reason: `City: ${city}` };
    return { verdict: "ALLOWED", reason: "No rule matched" };
  }

  // Whitelist mode. An empty whitelist is treated as not set up rather than
  // blocking the whole world, and visitors we cannot locate are let through.
  const hasPlaces = config.blockByStateCity && (config.regions.length > 0 || config.cities.length > 0);
  if (config.countries.length === 0 && !hasPlaces) {
    return { verdict: "ALLOWED", reason: "Whitelist empty" };
  }
  if (!country) return { verdict: "ALLOWED", reason: "Location unknown" };
  if (countryListed || region || city) return { verdict: "ALLOWED", reason: "Country whitelist" };
  return { verdict: "BLOCKED", blocker: "COUNTRY", reason: `Country not whitelisted: ${country}` };
}

// A redirect page is never blocked itself, otherwise the visitor would be
// redirected to it forever.
export function isRedirectTarget(redirectUrl: string | null, shopHosts: string[], path: string): boolean {
  if (!redirectUrl) return false;
  try {
    const target = new URL(redirectUrl, `https://${shopHosts[0] ?? "localhost"}`);
    if (!shopHosts.includes(target.hostname.toLowerCase())) return false;
    return normalizePath(target.pathname) === path;
  } catch {
    return false;
  }
}
