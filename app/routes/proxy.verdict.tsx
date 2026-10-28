import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getVerdictConfig, invalidateVerdictConfig } from "../models/rules.server";
import { lookupGeo } from "../services/geoip.server";
import { normalizeIp } from "../lib/ip";
import { decide, isRedirectTarget, normalizePath } from "../lib/verdict";
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

const json = (body: VerdictResponse) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ verdict: "ALLOWED" });

  const url = new URL(request.url);
  const param = (name: string) => (url.searchParams.get(name) ?? "").slice(0, 2048);

  const shop = await getShopWithSettings(session.shop);
  if (shop.uninstalledAt) return json({ verdict: "ALLOWED" });

  const ip = normalizeIp(clientIp(request.headers) ?? "");
  const response: VerdictResponse = { verdict: "ALLOWED" };

  // Admin Access Mode: an invitation token in the URL turns it on for this
  // device; the script then sends the token back on every page.
  let adminAccess = false;
  const inviteToken = param("vg_admin");
  const storedToken = param("at");
  if (inviteToken || storedToken) {
    const link = await db.accessLink.findFirst({
      where: { shopId: shop.id, kind: "ADMIN_INVITE", token: inviteToken || storedToken },
    });
    if (link) {
      adminAccess = true;
      if (inviteToken) {
        await db.accessLink.update({ where: { id: link.id }, data: { uses: { increment: 1 } } });
        response.adminToken = link.token;
      }
    } else if (storedToken) {
      // The link was deleted, so access is revoked.
      response.clearAdminToken = true;
    }
  }

  // Auto-Whitelist link: add the visitor's IP to the IP whitelist.
  const whitelistToken = param("vg_whitelist");
  if (whitelistToken && ip) {
    const link = await db.accessLink.findFirst({
      where: { shopId: shop.id, kind: "AUTO_WHITELIST", token: whitelistToken },
    });
    if (link) {
      await db.$transaction([
        db.rule.upsert({
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
        }),
        db.accessLink.update({ where: { id: link.id }, data: { uses: { increment: 1 } } }),
      ]);
      invalidateVerdictConfig(shop.id);
      response.redirect = "/";
    }
  }

  // eslint-disable-next-line no-undef
  const devCountry = process.env.NODE_ENV !== "production" ? param("vg_test_country") : "";
  const geo = devCountry
    ? { country: devCountry.toUpperCase(), countryName: null, regionCode: null, regionName: null, city: null }
    : await lookupGeo(ip);

  const path = normalizePath(param("path") || "/");
  const config = await getVerdictConfig(shop.id, shop.settings);
  let decision = decide(config, {
    ip,
    country: geo?.country ?? null,
    regionCode: geo?.regionCode ?? null,
    regionName: geo?.regionName ?? null,
    city: geo?.city ?? null,
    path,
    search: param("search"),
    adminAccess,
  });

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
      response.action = storefrontAction(blockerConfig);
    }
  }

  // Record the visit. Admin traffic is not logged.
  let code = param("vc");
  if (!isVisitorCode(code)) code = newVisitorCode();
  response.visitorCode = code;
  if (!adminAccess && ip) {
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
        userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        pageType: param("pt") || null,
        url: param("url") || null,
        referrer: param("ref") || null,
        verdict: decision.verdict,
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
  }

  return json(response);
};
