// Backup and restore of every rule a shop has (blockers, white lists, block
// lists and order filters) as one CSV file.

import type { MatchType, RuleList, RuleType } from "@prisma/client";
import { parseCsv, toCsv, unguardCell } from "./csv";
import { parseIpRule } from "./ip";
import { isCountryCode, regionRuleValue, splitRegionRule } from "./countries";
import { parsePagePath } from "./settings";
import { CUSTOMER_RULE_FIELDS, LIST_RULE_TYPES, parseRuleValue, type ListRuleType } from "./rule-specs";

export const BACKUP_HEADER = ["type", "list", "match", "value", "comment", "enabled"];
export const BACKUP_MAX_ROWS = 20_000;

const RULE_TYPES: readonly RuleType[] = [
  "COUNTRY",
  "STATE",
  "CITY",
  "IP",
  "IP_RANGE",
  "PAGE_WHITELIST",
  ...LIST_RULE_TYPES,
];

// Rule types that only exist as a white list.
const WHITELIST_ONLY: ReadonlySet<RuleType> = new Set([
  "PAGE_WHITELIST",
  "ORGANIZATION",
  "FRAUD_WHITELIST_EMAIL",
]);

export interface BackupRule {
  type: RuleType;
  list: RuleList;
  matchType: MatchType;
  value: string;
  comment: string | null;
  enabled: boolean;
}

export function rulesToCsv(rules: BackupRule[]): string {
  return toCsv(
    BACKUP_HEADER,
    rules.map((rule) => [
      rule.type,
      rule.list,
      rule.matchType,
      rule.value,
      rule.comment,
      rule.enabled ? "yes" : "no",
    ]),
  );
}

type Checked = { ok: true; type: RuleType; value: string; matchType: MatchType } | { ok: false; error: string };

function checkValue(type: RuleType, matchType: MatchType, raw: string): Checked {
  const value = raw.trim();
  switch (type) {
    case "COUNTRY": {
      const code = value.toUpperCase();
      return isCountryCode(code)
        ? { ok: true, type, value: code, matchType: "EXACT" }
        : { ok: false, error: "unknown country code" };
    }
    case "STATE":
    case "CITY": {
      const { country, place } = splitRegionRule(value);
      if (!isCountryCode(country.toUpperCase()) || place.trim() === "" || place.length > 100) {
        return { ok: false, error: "expected COUNTRY:place, such as US:texas" };
      }
      return { ok: true, type, value: regionRuleValue(country, place), matchType: "EXACT" };
    }
    case "IP":
    case "IP_RANGE": {
      const parsed = parseIpRule(value);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, type: parsed.isRange ? "IP_RANGE" : "IP", value: parsed.value, matchType: "EXACT" };
    }
    case "PAGE_WHITELIST": {
      if (matchType === "PARTIAL") {
        return value === "" || value.length > 500
          ? { ok: false, error: "enter the text the page URL should contain" }
          : { ok: true, type, value: value.toLowerCase(), matchType };
      }
      const parsed = parsePagePath(value);
      return parsed.ok ? { ok: true, type, value: parsed.path, matchType } : { ok: false, error: parsed.error };
    }
    default: {
      const parsed = parseRuleValue(type as ListRuleType, value, matchType);
      return parsed.ok ? { ok: true, type, value: parsed.value, matchType } : { ok: false, error: parsed.error };
    }
  }
}

export interface ParsedBackup {
  rules: BackupRule[];
  // "Line 4: unknown country code" and so on, at most 20.
  errors: string[];
  invalidCount: number;
  customerRulesChanged: boolean;
}

export function parseBackupCsv(text: string): ParsedBackup | { error: string } {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const col = Object.fromEntries(BACKUP_HEADER.map((name) => [name, header.indexOf(name)]));
  if (col.type < 0 || col.value < 0) {
    return { error: "This is not a rules backup file: the first row must name the type and value columns." };
  }
  if (rows.length - 1 > BACKUP_MAX_ROWS) {
    return { error: `A backup can hold at most ${BACKUP_MAX_ROWS.toLocaleString("en-US")} rules.` };
  }

  const rules: BackupRule[] = [];
  const errors: string[] = [];
  let invalidCount = 0;
  const seen = new Set<string>();
  const fail = (line: number, message: string) => {
    invalidCount++;
    if (errors.length < 20) errors.push(`Line ${line}: ${message}`);
  };

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const cell = (name: string) => (col[name] >= 0 ? unguardCell(row[col[name]] ?? "").trim() : "");

    const type = cell("type").toUpperCase() as RuleType;
    if (!RULE_TYPES.includes(type)) return fail(line, `unknown rule type "${cell("type")}"`);

    const listText = cell("list").toUpperCase();
    let list: RuleList = listText === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
    if (listText !== "" && listText !== "WHITELIST" && listText !== "BLACKLIST") {
      return fail(line, `list must be BLACKLIST or WHITELIST`);
    }
    if (WHITELIST_ONLY.has(type)) list = "WHITELIST";

    const matchType: MatchType = cell("match").toUpperCase() === "PARTIAL" ? "PARTIAL" : "EXACT";
    const checked = checkValue(type, matchType, cell("value"));
    if (!checked.ok) return fail(line, checked.error);

    const key = `${checked.type}|${list}|${checked.value}`;
    if (seen.has(key)) return;
    seen.add(key);

    const enabledText = cell("enabled").toLowerCase();
    rules.push({
      type: checked.type,
      list,
      matchType: checked.matchType,
      value: checked.value,
      comment: cell("comment").slice(0, 200) || null,
      enabled: !["no", "false", "0"].includes(enabledText),
    });
  });

  return {
    rules,
    errors,
    invalidCount,
    customerRulesChanged: rules.some((rule) => rule.type in CUSTOMER_RULE_FIELDS),
  };
}
