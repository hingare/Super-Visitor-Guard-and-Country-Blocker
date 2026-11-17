import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getVerdictConfig, invalidateVerdictConfig } from "../models/rules.server";
import { filteringAllowed, recordPageView } from "../models/billing.server";
import { RateLimiter } from "../lib/rate-limit";
import { lookupGeo, lookupNetwork } from "../services/geoip.server";
import { verifyBot } from "../services/bots.server";
import { classifyUserAgent } from "../lib/bots";
import { ipMatches, normalizeIp, parseIp } from "../lib/ip";
import { isActive } from "../lib/limits";
import { claimLinkUse } from "../models/access-links.server";
import { autoBlockIp } from "../models/auto-block.server";
import type { NetworkInfo } from "../lib/network";
import { decide, findGeoRedirect, isRedirectTarget, normalizePath } from "../lib/verdict";
import {
  clientIp,
  isVisitorCode,
  newVisitorCode,
  storefrontAction,
  type VerdictResponse,
} from "../lib/storefront";

// Storefront verdict API, reached through the app proxy at
// /apps/super-visitor-guard/verdict. Shopify signs every proxied request,
// which authenticate.public.appProxy verifies.

// Page views per visitor IP and shop each minute that are logged and
// counted for billing. Beyond it the verdict still applies, but the visit is
// neither recorded nor billed, so a flood cannot fill the log or the bill.
const logLimiter = new RateLimiter(60, 60_000);
// Page views per visitor IP and shop each minute, for Auto-block.
const floodCounter = new RateLimiter(Number.MAX_SAFE_INTEGER, 60_000);

const json = (body: VerdictResponse) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ verdict: "ALLOWED" });

  const url = new URL(request.url);
  const param = (name: string) => (url.searchParams.get(name) ?? "").slice(0, 2048);

  const shop = await getShopWithSettings(session.shop);
  // Without an active plan the storefront is left alone.
  if (shop.uninstalledAt || !filteringAllowed(shop)) return json({ verdict: "ALLOWED" });

  // Outside production, vg_test_* parameters stand in for the visitor's IP
  // and the GeoIP data, so filters can be tried from one computer.
  // eslint-disable-next-line no-undef
  const testing = process.env.NODE_ENV !== "production";
  const ip =
    (testing && normalizeIp(param("vg_test_ip"))) || normalizeIp(clientIp(request.headers) ?? "");
  const response: VerdictResponse = { verdict: "ALLOWED" };

  // Admin Access Mode: an invitation token in the URL turns it on for this
  // device; the script then sends the token back on every page.
  // An invitation with a use limit counts each opening; a device that already
  // holds the token keeps access until the link expires or is deleted.
  let adminAccess = false;
  const now = new Date();
  const inviteToken = param("vg_admin");
  const storedToken = param("at");
  const findInvite = (token: string) =>
    db.accessLink.findFirst({ where: { shopId: shop.id, kind: "ADMIN_INVITE", token } });
  if (inviteToken) {
    const link = await findInvite(inviteToken);
    if (link && (await claimLinkUse(link, now))) {
      adminAccess = true;
      response.adminToken = link.token;
    }
  }
  if (!adminAccess && storedToken) {
    const link = await findInvite(storedToken);
    if (link && isActive(link.expiresAt, now)) adminAccess = true;
    // The link was deleted or has expired, so access is revoked.
    else response.clearAdminToken = true;
  }

  // Auto-Whitelist link: add the visitor's IP to the IP whitelist.
  const whitelistToken = param("vg_whitelist");
  if (whitelistToken && ip) {
    const link = await db.accessLink.findFirst({
      where: { shopId: shop.id, kind: "AUTO_WHITELIST", token: whitelistToken },
    });
    if (link && (await claimLinkUse(link, now))) {
      await db.rule.upsert({
        where: {
          shopId_type_list_value: { shopId: shop.id, type: "IP", list: "WHITELIST", value: ip },
        },
        create: {
          shopId: shop.id,
          type: "IP",
          list: "WHITELIST",
          value: ip,
          comment: "Added by Auto-Whitelist link",
        },
        update: {},
      });
      invalidateVerdictConfig(shop.id);
      response.redirect = "/";
    }
  }

  const devCountry = testing ? param("vg_test_country") : "";
  const [geo, lookedUpNetwork] = await Promise.all([
    devCountry
      ? { country: devCountry.toUpperCase(), countryName: null, regionCode: null, regionName: null, city: null }
      : lookupGeo(ip),
    lookupNetwork(ip),
  ]);
  const network: NetworkInfo =
    testing && (param("vg_test_asn") || param("vg_test_org") || param("vg_test_vpn"))
      ? {
          ...lookedUpNetwork,
          asn: Number(param("vg_test_asn")) || null,
          organization: param("vg_test_org") || null,
          isVpn: param("vg_test_vpn") === "1",
        }
      : lookedUpNetwork;

  // The script reports navigator.userAgent, which is what the shopper's
  // browser sends; the proxied request's own header is only a fallback.
  const userAgent = (param("ua") || request.headers.get("user-agent") || "").slice(0, 500);
  const agent = classifyUserAgent(userAgent);
  const verified = agent.claimed && ip ? await verifyBot(agent.claimed, ip, network.asn) : false;

  let code = param("vc");
  if (!isVisitorCode(code)) code = newVisitorCode();
  response.visitorCode = code;

  const path = normalizePath(param("path") || "/");
  let config = await getVerdictConfig(shop.id, shop.settings);

  // Auto-block: the page view that goes over the limit puts the IP on the
  // blacklist, so it is blocked from this view on.
  if (shop.settings.autoBlockEnabled && ip && !adminAccess && !verified) {
    const views = floodCounter.count(`${shop.id}:${ip}`);
    const parsedIp = parseIp(ip);
    if (
      views === shop.settings.autoBlockLimit + 1 &&
      parsedIp &&
      !config.ipWhitelist.some((rule) => ipMatches(parsedIp, rule.matcher))
    ) {
      const blocked = await autoBlockIp(shop.id, ip, {
        limit: shop.settings.autoBlockLimit,
        minutes: shop.settings.autoBlockMinutes,
      }).catch((error) => {
        console.error(`Auto-block failed for ${shop.shopDomain}`, error);
        return false;
      });
      if (blocked) config = await getVerdictConfig(shop.id, shop.settings);
    }
  }
  const context = {
    ip,
    country: geo?.country ?? null,
    regionCode: geo?.regionCode ?? null,
    regionName: geo?.regionName ?? null,
    city: geo?.city ?? null,
    path,
    search: param("search"),
    adminAccess,
    referrer: param("ref"),
    userAgent,
    visitorCode: code,
    network,
    bot: { isBot: agent.isBot, claimedName: agent.claimed?.name ?? null, verified },
  };
  let decision = decide(config, context);
  let verdict: "ALLOWED" | "BLOCKED" | "REDIRECTED" = decision.verdict;

  if (decision.verdict === "BLOCKED") {
    const blockerConfig = await db.blockerConfig.findUnique({
      where: { shopId_blocker: { shopId: shop.id, blocker: decision.blocker } },
    });
    const host = param("host").toLowerCase();
    const hosts = [host, shop.shopDomain].filter(Boolean);
    if (
      blockerConfig?.handling === "REDIRECT" &&
      isRedirectTarget(blockerConfig.redirectUrl, hosts, path)
    ) {
      decision = { verdict: "ALLOWED", reason: "Redirect page" };
    } else {
      response.verdict = "BLOCKED";
      response.action = storefrontAction(blockerConfig, decision.blocker);
    }
  }
  verdict = decision.verdict;

  const geoRedirect = response.redirect
    ? null
    : findGeoRedirect(config, context, decision, param("host") || shop.shopDomain);
  if (geoRedirect) {
    response.redirect = geoRedirect.targetUrl;
    verdict = "REDIRECTED";
    decision = { verdict: "ALLOWED", reason: `Geolocation redirect: ${geoRedirect.targetUrl}` };
  }

  // Record the visit. Admin traffic is not logged.
  if (!adminAccess && ip && logLimiter.hit(`${shop.id}:${ip}`)) {
    const visitor = await db.visitor.upsert({
      where: { shopId_code: { shopId: shop.id, code } },
      create: { shopId: shop.id, code, lastIp: ip },
      update: { lastIp: ip, lastSeen: new Date() },
    });
    await db.visit.create({
      data: {
        shopId: shop.id,
        visitorId: visitor.id,
        ip,
        country: geo?.country ?? null,
        countryName: geo?.countryName ?? null,
        region: geo?.regionCode ?? geo?.regionName ?? null,
        city: geo?.city ?? null,
        isp: network.organization,
        organization: network.organization,
        asn: network.asn,
        isVpn: network.isVpn || network.isHosting,
        isProxy: network.isProxy,
        isTor: network.isTor,
        isBot: agent.isBot,
        isLowRiskBot: verified,
        userAgent: userAgent || null,
        pageType: param("pt") || null,
        url: param("url") || null,
        referrer: param("ref") || null,
        verdict,
        blocker: decision.verdict === "BLOCKED" ? decision.blocker : null,
        reason: decision.reason,
      },
    });
    if (decision.ruleId) {
      await db.rule.updateMany({
        where: { id: decision.ruleId, shopId: shop.id },
        data: { hits: { increment: 1 } },
      });
    }
    await recordPageView(shop);
  }

  return json(response);
};
