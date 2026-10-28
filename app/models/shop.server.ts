import type { Blocker } from "@prisma/client";
import db from "../db.server";

export const BLOCKERS: Blocker[] = [
  "COUNTRY",
  "IP",
  "BOT_VPN",
  "BLOCK_LIST",
  "REFERRER",
  "ISP_ASN",
  "URL",
];

// Creates the shop with default settings and one block-handling config per
// blocker on first install, and clears uninstalledAt on reinstall.
export async function ensureShop(shopDomain: string, ownerName?: string | null) {
  const shop = await db.shop.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      ownerName: ownerName ?? null,
      settings: { create: {} },
      blockerConfigs: {
        create: BLOCKERS.map((blocker) => ({ blocker })),
      },
    },
    update: {
      uninstalledAt: null,
      ...(ownerName ? { ownerName } : {}),
    },
    include: { settings: true },
  });
  return shop;
}

export async function getShopWithSettings(shopDomain: string) {
  const shop = await db.shop.findUnique({
    where: { shopDomain },
    include: { settings: true },
  });
  if (shop?.settings) return { ...shop, settings: shop.settings };

  // Sessions can exist before afterAuth ran (e.g. after a database reset).
  const created = await ensureShop(shopDomain);
  return { ...created, settings: created.settings! };
}

export async function markUninstalled(shopDomain: string) {
  await db.shop.updateMany({
    where: { shopDomain },
    data: { uninstalledAt: new Date() },
  });
}

export async function deleteShopData(shopDomain: string) {
  // Cascades to settings, rules, visitors, visits, order flags and the rest.
  await db.shop.deleteMany({ where: { shopDomain } });
  await db.session.deleteMany({ where: { shop: shopDomain } });
}

export interface DashboardCounts {
  blockList: number;
  fraudCancelled: number;
  ispAsn: number;
  ip: number;
  country: number;
  botVpn: number;
}

// Numbers behind the six dashboard cards.
export async function getDashboardCounts(
  shopId: string,
  since: Date,
): Promise<DashboardCounts> {
  const [grouped, fraudCancelled] = await Promise.all([
    db.visit.groupBy({
      by: ["blocker"],
      where: { shopId, verdict: "BLOCKED", createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.orderFlag.count({
      where: { shopId, actionTaken: "CANCELLED", createdAt: { gte: since } },
    }),
  ]);
  const count = (blocker: Blocker) =>
    grouped.find((row) => row.blocker === blocker)?._count._all ?? 0;

  return {
    blockList: count("BLOCK_LIST"),
    fraudCancelled,
    ispAsn: count("ISP_ASN"),
    ip: count("IP"),
    country: count("COUNTRY"),
    botVpn: count("BOT_VPN"),
  };
}

export async function getRecentVisits(shopId: string, take = 5) {
  return db.visit.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      ip: true,
      city: true,
      region: true,
      country: true,
      countryName: true,
      verdict: true,
    },
  });
}
