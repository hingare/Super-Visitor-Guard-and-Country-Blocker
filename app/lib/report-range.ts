// Report ranges for the dashboard's "Report Range" select.

export const REPORT_RANGES = {
  "24h": { label: "24 hours", hours: 24 },
  "7d": { label: "7 days", hours: 24 * 7 },
  "30d": { label: "30 days", hours: 24 * 30 },
} as const;
export type ReportRange = keyof typeof REPORT_RANGES;

export function parseReportRange(value: string | null): ReportRange {
  return value && value in REPORT_RANGES ? (value as ReportRange) : "24h";
}

export function rangeStart(range: ReportRange, now = new Date()): Date {
  return new Date(now.getTime() - REPORT_RANGES[range].hours * 60 * 60 * 1000);
}
