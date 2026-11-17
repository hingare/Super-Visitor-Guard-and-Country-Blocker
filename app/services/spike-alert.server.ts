import db from "../db.server";
import { mailConfigured, sendMail } from "./mailer.server";
import { safeTimeZone } from "../lib/analytics";
import {
  ALERT_COOLDOWN_MS,
  ALERT_WINDOW_MS,
  BASELINE_DAYS,
  alertDue,
  formatSpikeAlert,
  isSpike,
  type SpikeStats,
} from "../lib/spike-alert";

// Checks every 10 minutes whether a shop with blocking alerts on blocked more
// page views in the past hour than its alert level and its usual rate.

const CHECK_EVERY_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export async function countBlocked(shopId: string, now: Date) {
  return db.visit.count({
    where: { shopId, verdict: "BLOCKED", createdAt: { gte: new Date(now.getTime() - ALERT_WINDOW_MS), lt: now } },
  });
}

export async function collectSpikeStats(shopId: string, now: Date, blocked?: number): Promise<SpikeStats> {
  const windowStart = new Date(now.getTime() - ALERT_WINDOW_MS);
  const window = { shopId, createdAt: { gte: windowStart, lt: now } };
  const baselineStart = new Date(windowStart.getTime() - BASELINE_DAYS * 24 * HOUR_MS);
  const [blockedNow, visits, baseline, reasons, countries] = await Promise.all([
    blocked ?? countBlocked(shopId, now),
    db.visit.count({ where: window }),
    db.visit.count({
      where: { shopId, verdict: "BLOCKED", createdAt: { gte: baselineStart, lt: windowStart } },
    }),
    db.visit.groupBy({
      by: ["reason"],
      where: { ...window, verdict: "BLOCKED", reason: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    db.visit.groupBy({
      by: ["country", "countryName"],
      where: { ...window, verdict: "BLOCKED", country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);
  return {
    windowStart,
    windowEnd: now,
    blocked: blockedNow,
    visits,
    usualPerHour: baseline / (BASELINE_DAYS * 24),
    reasons: reasons.flatMap((row) => (row.reason ? [{ reason: row.reason, count: row._count._all }] : [])),
    countries: countries.map((row) => ({ country: row.country ?? "", name: row.countryName, count: row._count._all })),
  };
}

export async function sendSpikeAlert(
  shop: { id: string; shopDomain: string; timezone: string | null },
  to: string,
  threshold: number,
  options: { now?: Date; test?: boolean } = {},
) {
  const stats = await collectSpikeStats(shop.id, options.now ?? new Date());
  const { subject, text } = formatSpikeAlert(shop.shopDomain, stats, {
    threshold,
    timeZone: safeTimeZone(shop.timezone),
    test: options.test,
  });
  return sendMail({ to, subject, text });
}

export async function checkBlockingSpikes(now = new Date()) {
  if (!mailConfigured()) return 0;
  const candidates = await db.settings.findMany({
    where: {
      spikeAlertEnabled: true,
      alertEmail: { not: null },
      shop: { uninstalledAt: null },
      OR: [{ lastSpikeAlertAt: null }, { lastSpikeAlertAt: { lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } }],
    },
    select: {
      id: true,
      alertEmail: true,
      spikeAlertThreshold: true,
      lastSpikeAlertAt: true,
      shop: { select: { id: true, shopDomain: true, timezone: true } },
    },
    take: 1000,
  });

  let sent = 0;
  for (const settings of candidates) {
    if (!settings.alertEmail || !alertDue(settings.lastSpikeAlertAt, now)) continue;
    try {
      // The cheap count first; the rest only for shops over their level.
      const blocked = await countBlocked(settings.shop.id, now);
      if (blocked < settings.spikeAlertThreshold) continue;
      const stats = await collectSpikeStats(settings.shop.id, now, blocked);
      if (!isSpike(stats, settings.spikeAlertThreshold)) continue;

      // Claim the alert; another app instance that read the same row finds it changed.
      const claimed = await db.settings.updateMany({
        where: { id: settings.id, lastSpikeAlertAt: settings.lastSpikeAlertAt },
        data: { lastSpikeAlertAt: now },
      });
      if (claimed.count === 0) continue;
      const { subject, text } = formatSpikeAlert(settings.shop.shopDomain, stats, {
        threshold: settings.spikeAlertThreshold,
        timeZone: safeTimeZone(settings.shop.timezone),
      });
      try {
        if (await sendMail({ to: settings.alertEmail, subject, text })) sent++;
      } catch (error) {
        console.error(`Could not send the blocking alert for ${settings.shop.shopDomain}`, error);
        await db.settings.update({ where: { id: settings.id }, data: { lastSpikeAlertAt: settings.lastSpikeAlertAt } });
      }
    } catch (error) {
      console.error(`Blocking alert check failed for ${settings.shop.shopDomain}`, error);
    }
  }
  return sent;
}

const globalForAlerts = globalThis as unknown as { spikeAlertTimer?: NodeJS.Timeout };

export function startSpikeAlertJob() {
  if (globalForAlerts.spikeAlertTimer) return;
  const run = () =>
    checkBlockingSpikes().catch((error) => console.error("Blocking alert job failed", error));
  globalForAlerts.spikeAlertTimer = setInterval(run, CHECK_EVERY_MS);
  globalForAlerts.spikeAlertTimer.unref();
  setTimeout(run, 120_000).unref();
}
