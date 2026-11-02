import db from "../db.server";
import { sendMail, mailConfigured } from "./mailer.server";
import { REPORT_INTERVAL_MS, formatReport, reportDue, type ReportStats } from "../lib/weekly-report";

// Sends each shop that turned on the weekly summary its email, checked once
// an hour. lastReportAt is claimed before sending, so two app instances never
// send the same week twice.

const HOUR_MS = 60 * 60 * 1000;

export async function collectReportStats(shopId: string, to: Date): Promise<ReportStats> {
  const from = new Date(to.getTime() - REPORT_INTERVAL_MS);
  const range = { shopId, createdAt: { gte: from, lt: to } };
  const [verdicts, bots, visitors, countries, blockers, orders] = await Promise.all([
    db.visit.groupBy({ by: ["verdict"], where: range, _count: { _all: true } }),
    db.visit.count({ where: { ...range, isBot: true } }),
    db.visit.groupBy({ by: ["visitorId"], where: { ...range, visitorId: { not: null } } }),
    db.visit.groupBy({
      by: ["country", "countryName"],
      where: { ...range, verdict: "BLOCKED", country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    db.visit.groupBy({
      by: ["blocker"],
      where: { ...range, verdict: "BLOCKED", blocker: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    db.orderFlag.groupBy({ by: ["actionTaken"], where: range, _count: { _all: true } }),
  ]);

  const byVerdict = (verdict: string) =>
    verdicts.find((row) => row.verdict === verdict)?._count._all ?? 0;
  return {
    from,
    to,
    visits: verdicts.reduce((sum, row) => sum + row._count._all, 0),
    blocked: byVerdict("BLOCKED"),
    redirected: byVerdict("REDIRECTED"),
    bots,
    uniqueVisitors: visitors.length,
    topBlockedCountries: countries.map((row) => ({
      country: row.country ?? "",
      name: row.countryName,
      count: row._count._all,
    })),
    byBlocker: blockers.flatMap((row) => (row.blocker ? [{ blocker: row.blocker, count: row._count._all }] : [])),
    orders: orders.map((row) => ({ action: row.actionTaken, count: row._count._all })),
  };
}

export async function sendReport(shopId: string, shopDomain: string, to: string, now = new Date()) {
  const stats = await collectReportStats(shopId, now);
  const { subject, text } = formatReport(shopDomain, stats);
  return sendMail({ to, subject, text });
}

export async function sendDueReports(now = new Date()) {
  if (!mailConfigured()) return 0;
  const candidates = await db.settings.findMany({
    where: {
      weeklyReportEnabled: true,
      reportEmail: { not: null },
      shop: { uninstalledAt: null },
      OR: [{ lastReportAt: null }, { lastReportAt: { lte: new Date(now.getTime() - REPORT_INTERVAL_MS) } }],
    },
    select: { id: true, shopId: true, reportEmail: true, lastReportAt: true, shop: { select: { shopDomain: true } } },
    take: 500,
  });

  let sent = 0;
  for (const settings of candidates) {
    if (!settings.reportEmail || !reportDue(settings.lastReportAt, now)) continue;
    // Claim this week; another instance that read the same row finds it changed.
    const claimed = await db.settings.updateMany({
      where: { id: settings.id, lastReportAt: settings.lastReportAt },
      data: { lastReportAt: now },
    });
    if (claimed.count === 0) continue;
    try {
      if (await sendReport(settings.shopId, settings.shop.shopDomain, settings.reportEmail, now)) sent++;
    } catch (error) {
      console.error(`Could not send the weekly summary for ${settings.shop.shopDomain}`, error);
      // Try again at the next hourly check.
      await db.settings.update({ where: { id: settings.id }, data: { lastReportAt: settings.lastReportAt } });
    }
  }
  return sent;
}

const globalForReports = globalThis as unknown as { weeklyReportTimer?: NodeJS.Timeout };

export function startWeeklyReportJob() {
  if (globalForReports.weeklyReportTimer) return;
  const run = () =>
    sendDueReports().catch((error) => console.error("Weekly summary job failed", error));
  globalForReports.weeklyReportTimer = setInterval(run, HOUR_MS);
  globalForReports.weeklyReportTimer.unref();
  setTimeout(run, 90_000).unref();
}
