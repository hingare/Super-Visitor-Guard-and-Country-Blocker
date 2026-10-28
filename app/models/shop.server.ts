import db from "../db.server";

// Creates the shop with default settings and block page on first install,
// and clears uninstalledAt when a merchant reinstalls.
export async function ensureShop(shopDomain: string) {
  return db.shop.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      settings: { create: {} },
      blockPage: { create: {} },
    },
    update: { uninstalledAt: null },
    include: { settings: true },
  });
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
  // Cascades to settings, rules, visits, order flags and usage records.
  await db.shop.deleteMany({ where: { shopDomain } });
  await db.session.deleteMany({ where: { shop: shopDomain } });
}

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getVisitStats(shopId: string, since: Date) {
  const grouped = await db.visit.groupBy({
    by: ["verdict"],
    where: { shopId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const count = (verdict: string) =>
    grouped.find((row) => row.verdict === verdict)?._count._all ?? 0;
  const allowed = count("ALLOWED");
  const blocked = count("BLOCKED");
  const redirected = count("REDIRECTED");
  return { total: allowed + blocked + redirected, allowed, blocked, redirected };
}
