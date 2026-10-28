import type { Prisma, RuleList, RuleType, Settings } from "@prisma/client";
import db from "../db.server";
import { parseIpRule } from "../lib/ip";
import type { IpRule, ListRule, VerdictConfig } from "../lib/verdict";
import { readSelectedPages } from "../lib/settings";

export const PAGE_SIZE = 20;

export async function listRules({
  shopId,
  type,
  list,
  search,
  page,
}: {
  shopId: string;
  type: RuleType | RuleType[];
  list?: RuleList;
  search?: string;
  page?: number;
}) {
  const where: Prisma.RuleWhereInput = {
    shopId,
    type: Array.isArray(type) ? { in: type } : type,
    ...(list ? { list } : {}),
    ...(search ? { value: { contains: search.trim().toLowerCase(), mode: "insensitive" } } : {}),
  };
  const current = Math.max(1, page ?? 1);
  const [total, rules] = await Promise.all([
    db.rule.count({ where }),
    db.rule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return {
    rules,
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// Adds rules, skipping values that already exist. Returns how many were new.
export async function addRules(
  shopId: string,
  type: RuleType,
  list: RuleList,
  values: { value: string; matchType?: "EXACT" | "PARTIAL"; comment?: string | null }[],
): Promise<number> {
  if (values.length === 0) return 0;
  const result = await db.rule.createMany({
    data: values.map((item) => ({
      shopId,
      type,
      list,
      value: item.value,
      matchType: item.matchType ?? "EXACT",
      comment: item.comment ?? null,
    })),
    skipDuplicates: true,
  });
  invalidateVerdictConfig(shopId);
  return result.count;
}

export async function deleteRules(shopId: string, where: Prisma.RuleWhereInput) {
  const result = await db.rule.deleteMany({ where: { ...where, shopId } });
  invalidateVerdictConfig(shopId);
  return result.count;
}

export async function updateRule(
  shopId: string,
  id: string,
  data: {
    type?: RuleType;
    value?: string;
    comment?: string | null;
    matchType?: "EXACT" | "PARTIAL";
  },
) {
  const result = await db.rule.updateMany({ where: { id, shopId }, data });
  invalidateVerdictConfig(shopId);
  return result.count;
}

// The verdict API runs on every storefront page view, so each process keeps
// a short-lived copy of a shop's rules. Admin writes clear it right away in
// this process; other processes pick changes up within CACHE_MS.
const CACHE_MS = 15_000;
const cache = new Map<string, { expires: number; config: Promise<VerdictConfig> }>();

export function invalidateVerdictConfig(shopId: string) {
  cache.delete(shopId);
}

export function getVerdictConfig(shopId: string, settings: Settings): Promise<VerdictConfig> {
  const hit = cache.get(shopId);
  if (hit && hit.expires > Date.now()) return hit.config;
  const config = loadVerdictConfig(shopId, settings);
  cache.set(shopId, { expires: Date.now() + CACHE_MS, config });
  config.catch(() => cache.delete(shopId));
  return config;
}

async function loadVerdictConfig(shopId: string, settings: Settings): Promise<VerdictConfig> {
  const geoRedirects = await db.geoRedirect.findMany({
    where: { shopId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, countries: true, targetUrl: true },
  });
  const rules = await db.rule.findMany({
    where: {
      shopId,
      enabled: true,
      type: {
        in: [
          "PAGE_WHITELIST",
          "IP",
          "IP_RANGE",
          "COUNTRY",
          "STATE",
          "CITY",
          "ORGANIZATION",
          "CRAWLER",
          "VISITOR",
          "REFERRER",
          "URL",
          "ISP",
          "ASN",
        ],
      },
    },
    select: { id: true, type: true, list: true, matchType: true, value: true },
  });

  const ipRules = (list: RuleList): IpRule[] =>
    rules
      .filter((rule) => (rule.type === "IP" || rule.type === "IP_RANGE") && rule.list === list)
      .flatMap((rule) => {
        const parsed = parseIpRule(rule.value);
        return parsed.ok ? [{ id: rule.id, value: rule.value, matcher: parsed.matcher }] : [];
      });
  const listRules = (type: RuleType, list: RuleList = "BLACKLIST"): ListRule[] =>
    rules
      .filter((rule) => rule.type === type && rule.list === list)
      .map((rule) => ({ id: rule.id, matchType: rule.matchType, value: rule.value }));
  const placeRules = (type: RuleType) =>
    rules
      .filter((rule) => rule.type === type && rule.list === settings.countryMode)
      .map((rule) => rule.value);

  return {
    filtersEnabled: settings.filtersEnabled,
    selectedPages: readSelectedPages(settings.selectedPages),
    countryMode: settings.countryMode,
    blockByStateCity: settings.blockByStateCity,
    pageWhitelist: rules
      .filter((rule) => rule.type === "PAGE_WHITELIST")
      .map((rule) => ({ matchType: rule.matchType, value: rule.value })),
    ipWhitelist: ipRules("WHITELIST"),
    ipBlacklist: ipRules("BLACKLIST"),
    countries: placeRules("COUNTRY"),
    regions: placeRules("STATE"),
    cities: placeRules("CITY"),
    botBlockerEnabled: settings.botBlockerEnabled,
    orgWhitelist: listRules("ORGANIZATION", "WHITELIST"),
    crawlerWhitelist: listRules("CRAWLER", "WHITELIST"),
    crawlerBlacklist: listRules("CRAWLER"),
    blockedVisitors: listRules("VISITOR"),
    referrerRules: listRules("REFERRER"),
    urlRules: listRules("URL"),
    ispRules: listRules("ISP"),
    asnRules: listRules("ASN"),
    geoRedirects,
  };
}
