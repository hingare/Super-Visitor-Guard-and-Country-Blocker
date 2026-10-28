// Decides whether a storefront visit passes or is blocked. Pure so it can be
// unit tested; the verdict API loads the shop's rules and calls decide().
//
// Order of checks, first match wins:
//   1. Admin Access Mode on this device
//   2. All filters switched off
//   3. Page White Lists
//   4. Selective Page Filtering (page not selected)
//   5. IP whitelist, then IP blacklist (highest-priority blocker)
//   6. Verified search/ads crawlers, then the crawler allow and block lists
//   7. Block Lists(Legacy), Referrer, URL and ISP/ASN blockers
//   8. Bot(VPN/Proxy) Blocker, unless the organization is whitelisted
//   9. Country Blocker (countries, then states/provinces and cities)

import type { IpMatcher } from "./ip";
import type { NetworkInfo } from "./network";
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

export interface ListRule {
  id: string;
  matchType: MatchType;
  value: string;
}

export type BlockerName = "COUNTRY" | "IP" | "BOT_VPN" | "BLOCK_LIST" | "REFERRER" | "ISP_ASN" | "URL";

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
  botBlockerEnabled: boolean;
  orgWhitelist: ListRule[];
  crawlerWhitelist: ListRule[];
  crawlerBlacklist: ListRule[];
  blockedVisitors: ListRule[];
  referrerRules: ListRule[];
  urlRules: ListRule[];
  ispRules: ListRule[];
  asnRules: ListRule[];
  geoRedirects: GeoRedirectRule[];
}

export interface GeoRedirectRule {
  id: string;
  countries: string[];
  targetUrl: string;
}

export interface BotInfo {
  isBot: boolean;
  // Trusted crawler the user agent claims to be, and whether it checked out.
  claimedName: string | null;
  verified: boolean;
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
  referrer: string;
  userAgent: string;
  visitorCode: string | null;
  network: NetworkInfo;
  bot: BotInfo;
}

export type Decision =
  | { verdict: "ALLOWED"; reason: string; ruleId?: string }
  | { verdict: "BLOCKED"; blocker: BlockerName; reason: string; ruleId?: string };

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

  return decideLists(config, ctx) ?? decideBotVpn(config, ctx) ?? decideCountry(config, ctx);
}

function textMatches(rule: ListRule, text: string): boolean {
  const value = rule.value.toLowerCase();
  const subject = text.toLowerCase();
  return rule.matchType === "EXACT" ? subject === value : subject.includes(value);
}

export function referrerMatches(rule: ListRule, referrer: string): boolean {
  if (!referrer) return false;
  if (rule.matchType === "PARTIAL") return referrer.toLowerCase().includes(rule.value.toLowerCase());
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host === rule.value || host.endsWith(`.${rule.value}`);
  } catch {
    return false;
  }
}

function blocked(blocker: BlockerName, reason: string, rule?: ListRule): Decision {
  return { verdict: "BLOCKED", blocker, reason, ruleId: rule?.id };
}

function decideLists(config: VerdictConfig, ctx: VisitContext): Decision | null {
  if (ctx.bot.claimedName && ctx.bot.verified) {
    return { verdict: "ALLOWED", reason: `Trusted bot: ${ctx.bot.claimedName}` };
  }
  const ua = ctx.userAgent;
  if (ua) {
    const allowed = config.crawlerWhitelist.find((rule) => ua.toLowerCase().includes(rule.value));
    if (allowed) return { verdict: "ALLOWED", reason: `Crawler allow list: ${allowed.value}`, ruleId: allowed.id };
    const crawler = config.crawlerBlacklist.find((rule) => ua.toLowerCase().includes(rule.value));
    if (crawler) return blocked("BOT_VPN", `Crawler: ${crawler.value}`, crawler);
  }

  if (ctx.visitorCode) {
    const visitor = config.blockedVisitors.find((rule) => rule.value === ctx.visitorCode);
    if (visitor) return blocked("BLOCK_LIST", `Visitor: ${visitor.value}`, visitor);
  }

  const referrer = config.referrerRules.find((rule) => referrerMatches(rule, ctx.referrer));
  if (referrer) return blocked("REFERRER", `Referrer: ${referrer.value}`, referrer);

  const url = config.urlRules.find((rule) => pageRuleMatches(rule, ctx.path, ctx.search));
  if (url) return blocked("URL", `URL: ${url.value}`, url);

  const { asn, organization } = ctx.network;
  if (asn !== null) {
    const rule = config.asnRules.find((item) => item.value === String(asn));
    if (rule) return blocked("ISP_ASN", `ASN: AS${asn}`, rule);
  }
  if (organization) {
    const rule = config.ispRules.find((item) => textMatches(item, organization));
    if (rule) return blocked("ISP_ASN", `ISP: ${organization}`, rule);
  }
  return null;
}

function decideBotVpn(config: VerdictConfig, ctx: VisitContext): Decision | null {
  if (!config.botBlockerEnabled) return null;
  const { network, bot } = ctx;
  const organization = network.organization?.toLowerCase() ?? "";
  if (organization && config.orgWhitelist.some((rule) => organization.includes(rule.value))) {
    return null;
  }
  if (network.isTor) return blocked("BOT_VPN", "Tor exit node");
  if (network.isVpn) return blocked("BOT_VPN", "VPN");
  if (network.isProxy) return blocked("BOT_VPN", "Proxy");
  if (network.isHosting) return blocked("BOT_VPN", "Hosting network");
  if (bot.claimedName && !bot.verified) return blocked("BOT_VPN", `Fake ${bot.claimedName}`);
  return null;
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

// Geolocation Redirects run only after every filter has let the visitor in.
// Admins and bots are never redirected, and neither is a visitor already on
// the target site.
export function findGeoRedirect(
  config: VerdictConfig,
  ctx: VisitContext,
  decision: Decision,
  host: string,
): GeoRedirectRule | null {
  if (decision.verdict !== "ALLOWED" || ctx.adminAccess || ctx.bot.isBot || !ctx.country) {
    return null;
  }
  if (!config.filtersEnabled) return null;
  const country = ctx.country.toUpperCase();
  return (
    config.geoRedirects.find((rule) => {
      if (!rule.countries.includes(country)) return false;
      try {
        return new URL(rule.targetUrl).hostname.toLowerCase() !== host.toLowerCase();
      } catch {
        return false;
      }
    }) ?? null
  );
}
