import type { Blocker } from "@prisma/client";
import db from "../db.server";
import { dayKeys, fillDays, startOfLocalDay, type DayCounts } from "../lib/analytics";

// Numbers behind the Analytics page, for the last `days` calendar days in the
// shop's time zone.

export interface AnalyticsData {
  from: string;
  days: DayCounts[];
  totals: { visits: number; allowed: number; blocked: number; redirected: number; visitors: number; bots: number };
  byBlocker: { blocker: Blocker; count: number }[];
  countries: { country: string; name: string | null; visits: number; blocked: number }[];
  reasons: { reason: string; count: number }[];
  blockedIps: { ip: string; count: number }[];
}

const TOP = 10;

export async function getAnalytics(
  shopId: string,
  daysBack: number,
  timeZone: string,
  now = new Date(),
): Promise<AnalyticsData> {
  const keys = dayKeys(daysBack, now, timeZone);
  const from = startOfLocalDay(keys[0], timeZone);
  const range = { shopId, createdAt: { gte: from } };
  const blockedRange = { ...range, verdict: "BLOCKED" as const };

  const [daily, people, byBlocker, countries, reasons, blockedIps] = await Promise.all([
    db.$queryRaw<{ day: string; verdict: string; count: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             verdict::text AS verdict,
             COUNT(*)::int AS count
      FROM "Visit"
      WHERE "shopId" = ${shopId} AND "createdAt" >= ${from}
      GROUP BY 1, 2`,
    db.$queryRaw<{ visitors: number; bots: number }[]>`
      SELECT COUNT(DISTINCT "visitorId")::int AS visitors,
             COUNT(*) FILTER (WHERE "isBot")::int AS bots
      FROM "Visit"
      WHERE "shopId" = ${shopId} AND "createdAt" >= ${from}`,
    db.visit.groupBy({
      by: ["blocker"],
      where: { ...blockedRange, blocker: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    db.$queryRaw<{ country: string; name: string | null; visits: number; blocked: number }[]>`
      SELECT country,
             MAX("countryName") AS name,
             COUNT(*)::int AS visits,
             COUNT(*) FILTER (WHERE verdict = 'BLOCKED')::int AS blocked
      FROM "Visit"
      WHERE "shopId" = ${shopId} AND "createdAt" >= ${from} AND country IS NOT NULL
      GROUP BY country
      ORDER BY visits DESC
      LIMIT ${TOP}`,
    db.visit.groupBy({
      by: ["reason"],
      where: { ...blockedRange, reason: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: TOP,
    }),
    db.visit.groupBy({
      by: ["ip"],
      where: blockedRange,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: TOP,
    }),
  ]);

  const days = fillDays(daily, keys);
  const sum = (field: "allowed" | "blocked" | "redirected") =>
    days.reduce((total, day) => total + day[field], 0);
  const allowed = sum("allowed");
  const blocked = sum("blocked");
  const redirected = sum("redirected");

  return {
    from: from.toISOString(),
    days,
    totals: {
      visits: allowed + blocked + redirected,
      allowed,
      blocked,
      redirected,
      visitors: people[0]?.visitors ?? 0,
      bots: people[0]?.bots ?? 0,
    },
    byBlocker: byBlocker.flatMap((row) => (row.blocker ? [{ blocker: row.blocker, count: row._count._all }] : [])),
    countries,
    reasons: reasons.flatMap((row) => (row.reason ? [{ reason: row.reason, count: row._count._all }] : [])),
    blockedIps: blockedIps.map((row) => ({ ip: row.ip, count: row._count._all })),
  };
}
