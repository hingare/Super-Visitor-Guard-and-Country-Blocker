// Blocking alerts: an email when blocked page views suddenly jump, which
// usually means an attack, or a rule that started blocking real shoppers.

import { APP_NAME } from "./app-info";

export const ALERT_WINDOW_MS = 60 * 60 * 1000;
// At most one alert per shop in this time.
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// The usual hourly level is measured over this many days before the window.
export const BASELINE_DAYS = 7;
// A jump means at least this many times the usual hourly level.
export const SPIKE_FACTOR = 3;
export const MIN_THRESHOLD = 10;
export const MAX_THRESHOLD = 1_000_000;

export interface SpikeStats {
  windowStart: Date;
  windowEnd: Date;
  blocked: number;
  visits: number;
  // Average blocked page views per hour over the baseline days.
  usualPerHour: number;
  reasons: { reason: string; count: number }[];
  countries: { country: string; name: string | null; count: number }[];
}

export function parseThreshold(value: unknown): number | null {
  const number = Number(String(value ?? "").trim());
  if (!Number.isInteger(number) || number < MIN_THRESHOLD || number > MAX_THRESHOLD) return null;
  return number;
}

export function alertDue(lastAlertAt: Date | null, now: Date): boolean {
  return !lastAlertAt || now.getTime() - lastAlertAt.getTime() >= ALERT_COOLDOWN_MS;
}

// A store that is blocked at a steady high rate (an ongoing bot attack) only
// gets an alert when that rate jumps again, not every few hours.
export function isSpike(stats: Pick<SpikeStats, "blocked" | "usualPerHour">, threshold: number): boolean {
  return stats.blocked >= threshold && stats.blocked >= SPIKE_FACTOR * stats.usualPerHour;
}

const number = (value: number) => value.toLocaleString("en-US");

export function formatSpikeAlert(
  shopDomain: string,
  stats: SpikeStats,
  options: { threshold: number; timeZone: string; test?: boolean },
): { subject: string; text: string } {
  const time = (date: Date) =>
    date.toLocaleString("en-US", {
      timeZone: options.timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const usual = Math.round(stats.usualPerHour * 10) / 10;
  const share = stats.visits > 0 ? Math.round((stats.blocked / stats.visits) * 100) : 0;
  const lines = [
    options.test
      ? `This is a test of the ${APP_NAME} blocking alert for ${shopDomain}. These are the real numbers for the last hour.`
      : `${APP_NAME} blocked more page views than usual on ${shopDomain}.`,
    "",
    `From ${time(stats.windowStart)} to ${time(stats.windowEnd)} (${options.timeZone}):`,
    `  Blocked: ${number(stats.blocked)} of ${number(stats.visits)} page views (${share}%)`,
    `  Usual: about ${number(usual)} blocked page views an hour over the past ${BASELINE_DAYS} days`,
    `  Your alert level: ${number(options.threshold)} blocked page views in an hour`,
  ];
  if (stats.reasons.length > 0) {
    lines.push("", "Most common reasons:");
    for (const row of stats.reasons) lines.push(`  ${row.reason}: ${number(row.count)}`);
  }
  if (stats.countries.length > 0) {
    lines.push("", "Most blocked countries:");
    for (const row of stats.countries) lines.push(`  ${row.name ?? row.country} (${row.country}): ${number(row.count)}`);
  }
  lines.push(
    "",
    "What to check:",
    "  - If the reasons point at one rule and the visitors look like real shoppers, that rule may be too broad. Open Shop Visitor Logs and filter by Blocked to see who was stopped.",
    "  - If it looks like bots or an attack, nothing needs to be done: they were kept out.",
    "",
    `You get this email because blocking alerts are on in ${APP_NAME} (Backup & Reports). You get at most one every ${ALERT_COOLDOWN_MS / 3_600_000} hours.`,
  );
  return {
    subject: options.test
      ? `${APP_NAME} test alert: ${number(stats.blocked)} page views blocked in the last hour`
      : `${APP_NAME} alert: ${number(stats.blocked)} page views blocked in the last hour on ${shopDomain}`,
    text: lines.join("\n"),
  };
}
