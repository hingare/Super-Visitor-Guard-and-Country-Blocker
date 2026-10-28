import type { Prisma } from "@prisma/client";
import db from "../db.server";
import type { VisitFilters } from "../lib/visit-filters";
import { normalizeIp } from "../lib/ip";

export const VISIT_PAGE_SIZE = 20;

function visitWhere(shopId: string, filters: VisitFilters): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = { shopId };
  if (filters.blockedOnly) where.verdict = { in: ["BLOCKED", "REDIRECTED"] };
  if (filters.botsOnly) where.isBot = true;
  if (filters.hideLowRiskBots) where.isLowRiskBot = false;
  if (filters.q) {
    if (filters.by === "ip") {
      const exact = normalizeIp(filters.q);
      where.ip = exact ? exact : { contains: filters.q.toLowerCase() };
    } else if (/^[a-z]{2}$/i.test(filters.q)) {
      where.country = filters.q.toUpperCase();
    } else {
      where.countryName = { contains: filters.q, mode: "insensitive" };
    }
  }
  return where;
}

export async function listVisits(shopId: string, filters: VisitFilters) {
  const where = visitWhere(shopId, filters);
  const [total, visits] = await Promise.all([
    db.visit.count({ where }),
    db.visit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * VISIT_PAGE_SIZE,
      take: VISIT_PAGE_SIZE,
      include: { visitor: { select: { id: true, code: true, alias: true } } },
    }),
  ]);
  return {
    visits,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / VISIT_PAGE_SIZE)),
  };
}

export async function blockedVisitorCodes(shopId: string, codes: string[]) {
  if (codes.length === 0) return new Set<string>();
  const rules = await db.rule.findMany({
    where: { shopId, type: "VISITOR", list: "BLACKLIST", value: { in: codes } },
    select: { value: true },
  });
  return new Set(rules.map((rule) => rule.value));
}
