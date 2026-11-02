import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, unguardCell } from "../app/lib/csv";
import { parseBackupCsv, rulesToCsv, type BackupRule } from "../app/lib/rule-backup";
import { formatReport, reportDue, REPORT_INTERVAL_MS } from "../app/lib/weekly-report";

describe("csv", () => {
  it("round-trips quotes, commas and new lines", () => {
    const text = toCsv(["a", "b"], [["x, y", 'say "hi"'], ["line\nbreak", null]]);
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["line\nbreak", ""],
    ]);
  });

  it("keeps formula-like text from running in a spreadsheet", () => {
    const text = toCsv(["v"], [["=HYPERLINK(1)"], ["-1"], [-1]]);
    const rows = parseCsv(text);
    expect(rows[1][0]).toBe("'=HYPERLINK(1)");
    expect(unguardCell(rows[1][0])).toBe("=HYPERLINK(1)");
    expect(unguardCell(rows[2][0])).toBe("-1");
    // Numbers are not text and are written as they are.
    expect(rows[3][0]).toBe("-1");
  });

  it("skips a byte order mark and blank lines", () => {
    expect(parseCsv("﻿a,b\r\n\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("rules backup", () => {
  const rules: BackupRule[] = [
    { type: "COUNTRY", list: "BLACKLIST", matchType: "EXACT", value: "RU", comment: null, enabled: true },
    { type: "STATE", list: "BLACKLIST", matchType: "EXACT", value: "US:texas", comment: "x", enabled: true },
    { type: "IP_RANGE", list: "WHITELIST", matchType: "EXACT", value: "10.0.0.0/8", comment: null, enabled: false },
    { type: "REFERRER", list: "BLACKLIST", matchType: "PARTIAL", value: "spam", comment: null, enabled: true },
    { type: "CUSTOMER_EMAIL", list: "BLACKLIST", matchType: "EXACT", value: "a@b.co", comment: null, enabled: true },
  ];

  it("restores what it exported", () => {
    const parsed = parseBackupCsv(rulesToCsv(rules));
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rules).toEqual(rules);
    expect(parsed.invalidCount).toBe(0);
    expect(parsed.customerRulesChanged).toBe(true);
  });

  it("normalizes values and fixes the IP rule type", () => {
    const parsed = parseBackupCsv(
      "type,value\ncountry,de\nIP,203.0.113.0/24\nIP_RANGE,203.0.113.7\npage_whitelist,https://shop.com/pages/About\n",
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rules.map((rule) => [rule.type, rule.value, rule.list])).toEqual([
      ["COUNTRY", "DE", "BLACKLIST"],
      ["IP_RANGE", "203.0.113.0/24", "BLACKLIST"],
      ["IP", "203.0.113.7", "BLACKLIST"],
      ["PAGE_WHITELIST", "/pages/about", "WHITELIST"],
    ]);
  });

  it("skips invalid and duplicate rows with line numbers", () => {
    const parsed = parseBackupCsv("type,list,value\nCOUNTRY,,XX\nNOPE,,1\nIP,GREYLIST,1.1.1.1\nASN,,AS15169\nASN,,15169\n");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.invalidCount).toBe(3);
    expect(parsed.errors[0]).toMatch(/^Line 2:/);
    expect(parsed.errors[2]).toMatch(/^Line 4:/);
  });

  it("rejects a file that is not a backup", () => {
    expect(parseBackupCsv("name,email\nx,y\n")).toHaveProperty("error");
  });
});

describe("weekly summary", () => {
  const now = new Date("2026-11-09T00:00:00Z");

  it("is due a week after the last one", () => {
    expect(reportDue(null, now)).toBe(true);
    expect(reportDue(new Date(now.getTime() - REPORT_INTERVAL_MS + 1000), now)).toBe(false);
    expect(reportDue(new Date(now.getTime() - REPORT_INTERVAL_MS), now)).toBe(true);
  });

  it("lists the week's numbers", () => {
    const { subject, text } = formatReport("demo.myshopify.com", {
      from: new Date("2026-11-02T00:00:00Z"),
      to: now,
      visits: 2000,
      blocked: 150,
      redirected: 4,
      bots: 90,
      uniqueVisitors: 800,
      topBlockedCountries: [{ country: "RU", name: "Russia", count: 100 }],
      byBlocker: [{ blocker: "COUNTRY", count: 100 }],
      orders: [{ action: "CANCELLED", count: 2 }, { action: "SKIPPED", count: 5 }],
    });
    expect(subject).toContain("150 blocked of 2,000");
    expect(text).toContain("Blocked: 150 (7.5%)");
    expect(text).toContain("Russia (RU): 100");
    expect(text).toContain("Country Blocker: 100");
    expect(text).toContain("2 cancelled");
    expect(text).not.toContain("5 ");
  });
});
