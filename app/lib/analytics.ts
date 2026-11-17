// Helpers behind the Analytics page: ranges, day buckets in the shop's time
// zone, and chart scales.

export const ANALYTICS_RANGES = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
} as const;
export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return value && value in ANALYTICS_RANGES ? (value as AnalyticsRange) : "7d";
}

// Shopify sends an IANA zone such as "Asia/Dhaka"; anything the runtime does
// not know falls back to UTC.
export function safeTimeZone(value: string | null | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

// The calendar date (YYYY-MM-DD) of an instant in a time zone.
export function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// The last `days` calendar dates in the time zone, oldest first, ending today.
export function dayKeys(days: number, now: Date, timeZone: string): string[] {
  const [year, month, day] = localDay(now, timeZone).split("-").map(Number);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    keys.push(new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10));
  }
  return keys;
}

// How far the time zone is ahead of UTC at an instant, in milliseconds.
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant a calendar date (YYYY-MM-DD) starts in the time zone.
export function startOfLocalDay(key: string, timeZone: string): Date {
  const midnightUtc = Date.parse(`${key}T00:00:00Z`);
  const first = midnightUtc - zoneOffsetMs(new Date(midnightUtc), timeZone);
  return new Date(midnightUtc - zoneOffsetMs(new Date(first), timeZone));
}

export interface DayCounts {
  day: string;
  allowed: number;
  blocked: number;
  redirected: number;
}

// Turns grouped rows into one entry per day, with zeros for quiet days.
export function fillDays(
  rows: { day: string; verdict: string; count: number }[],
  keys: string[],
): DayCounts[] {
  const byDay = new Map(keys.map((day) => [day, { day, allowed: 0, blocked: 0, redirected: 0 }]));
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    if (row.verdict === "BLOCKED") entry.blocked += row.count;
    else if (row.verdict === "REDIRECTED") entry.redirected += row.count;
    else entry.allowed += row.count;
  }
  return keys.map((day) => byDay.get(day)!);
}

// A round number at or above the largest value, for the chart's top line.
export function niceMax(value: number): number {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}

export function share(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const value = (part / whole) * 100;
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)}%`;
}

// "Nov 17" for a YYYY-MM-DD key.
export function shortDay(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
