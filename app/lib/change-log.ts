// Change History: turns an admin form post into a short, readable record.

// Form fields that say nothing to a reader, or are too sensitive or too big.
const SKIPPED_FIELDS = new Set(["intent", "id", "file", "backup", "csv"]);
const FIELD_LABELS: Record<string, string> = {
  type: "type",
  list: "list",
  value: "value",
  values: "values",
  matchType: "match",
  comment: "comment",
  expires: "ends",
  handling: "handling",
  header: "header",
  message: "message",
  redirectUrl: "redirect",
  templateId: "template",
  sectionSelector: "section",
  countries: "countries",
  targetUrl: "target",
  enabled: "on",
  path: "page",
  kind: "link",
};
const MAX_VALUE = 80;
const MAX_DETAILS = 500;

function shorten(value: string): string {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const joined = lines.length > 1 ? `${lines.slice(0, 5).join(", ")}${lines.length > 5 ? ` … (${lines.length} lines)` : ""}` : value.trim();
  return joined.length > MAX_VALUE ? `${joined.slice(0, MAX_VALUE - 1)}…` : joined;
}

// "type: IP · value: 203.0.113.5", or null when nothing worth showing.
export function describeForm(form: FormData): string | null {
  const values = new Map<string, string[]>();
  for (const [key, raw] of form.entries()) {
    if (SKIPPED_FIELDS.has(key) || typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const parts = [...values].map(([key, list]) => `${FIELD_LABELS[key] ?? key}: ${shorten(list.join("\n"))}`);
  if (parts.length === 0) return null;
  const details = parts.join(" · ");
  return details.length > MAX_DETAILS ? `${details.slice(0, MAX_DETAILS - 1)}…` : details;
}

export const CHANGE_LOG_DAYS = 365;
