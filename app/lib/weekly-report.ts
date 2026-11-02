// The weekly email summary: what the filters did over the past seven days.

import type { Blocker, OrderAction } from "@prisma/client";
import { APP_NAME } from "./app-info";

export const REPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const BLOCKER_LABELS: Record<Blocker, string> = {
  COUNTRY: "Country Blocker",
  IP: "IP Blocker",
  BOT_VPN: "Bot (VPN/Proxy) Blocker",
  BLOCK_LIST: "Block Lists",
  REFERRER: "Referrer Blocker",
  ISP_ASN: "ISP/ASN Blocker",
  URL: "URL Blocker",
};

export interface ReportStats {
  from: Date;
  to: Date;
  visits: number;
  blocked: number;
  redirected: number;
  bots: number;
  uniqueVisitors: number;
  topBlockedCountries: { country: string; name: string | null; count: number }[];
  byBlocker: { blocker: Blocker; count: number }[];
  orders: { action: OrderAction; count: number }[];
}

// A report is due once a week, counted from the last one (or from when the
// merchant turned it on).
export function reportDue(lastReportAt: Date | null, now: Date): boolean {
  return !lastReportAt || now.getTime() - lastReportAt.getTime() >= REPORT_INTERVAL_MS;
}

const number = (value: number) => value.toLocaleString("en-US");
const percent = (part: number, whole: number) =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 1000) / 10}%`;
const day = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const ORDER_ACTION_LABELS: Partial<Record<OrderAction, string>> = {
  CANCELLED: "cancelled",
  DELETED: "cancelled and deleted",
  REFUNDED: "refunded",
  FAILED: "could not be cancelled",
};

export function formatReport(shopDomain: string, stats: ReportStats): { subject: string; text: string } {
  const lines = [
    `Here is what ${APP_NAME} did on ${shopDomain} from ${day(stats.from)} to ${day(stats.to)}.`,
    "",
    `Page views checked: ${number(stats.visits)}`,
    `Unique visitors: ${number(stats.uniqueVisitors)}`,
    `Blocked: ${number(stats.blocked)} (${percent(stats.blocked, stats.visits)})`,
    `Redirected: ${number(stats.redirected)}`,
    `Bot visits: ${number(stats.bots)}`,
  ];

  if (stats.topBlockedCountries.length > 0) {
    lines.push("", "Most blocked countries:");
    for (const row of stats.topBlockedCountries) {
      lines.push(`  ${row.name ?? row.country} (${row.country}): ${number(row.count)}`);
    }
  }
  if (stats.byBlocker.length > 0) {
    lines.push("", "Blocks by filter:");
    for (const row of stats.byBlocker) {
      lines.push(`  ${BLOCKER_LABELS[row.blocker]}: ${number(row.count)}`);
    }
  }
  const orderLines = stats.orders.flatMap((row) =>
    ORDER_ACTION_LABELS[row.action] ? [`  ${number(row.count)} ${ORDER_ACTION_LABELS[row.action]}`] : [],
  );
  if (orderLines.length > 0) lines.push("", "Orders handled by your order filters:", ...orderLines);
  if (stats.visits === 0) {
    lines.push(
      "",
      `No storefront visits were recorded. If that is unexpected, check that the ${APP_NAME} app embed is turned on in your theme.`,
    );
  }
  lines.push(
    "",
    `You get this email because the weekly summary is on in ${APP_NAME} (Backup & Reports). Turn it off there to stop it.`,
  );

  return {
    subject: `${APP_NAME} weekly summary: ${number(stats.blocked)} blocked of ${number(stats.visits)} page views`,
    text: lines.join("\n"),
  };
}
