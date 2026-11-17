import { describe, expect, it } from "vitest";
import {
  canExpire,
  expiryText,
  isActive,
  linkStatus,
  linkUsable,
  parseAutoBlock,
  parseExpiry,
  parseMaxUses,
} from "../app/lib/limits";
import { RateLimiter } from "../app/lib/rate-limit";
import { parseBackupCsv, rulesToCsv } from "../app/lib/rule-backup";

const now = new Date("2026-11-17T12:00:00Z");

describe("rule end dates", () => {
  it("turns a choice into a date", () => {
    expect(parseExpiry("1h", now)?.toISOString()).toBe("2026-11-17T13:00:00.000Z");
    expect(parseExpiry("7d", now)?.toISOString()).toBe("2026-11-24T12:00:00.000Z");
    expect(parseExpiry("", now)).toBeNull();
    expect(parseExpiry("forever", now)).toBeNull();
  });

  it("only applies to storefront rules", () => {
    expect(canExpire("IP")).toBe(true);
    expect(canExpire("REFERRER")).toBe(true);
    expect(canExpire("COUNTRY")).toBe(false);
    expect(canExpire("CUSTOMER_EMAIL")).toBe(false);
    expect(canExpire("AUTO_CANCEL_EMAIL")).toBe(false);
  });

  it("says when a rule ends", () => {
    expect(isActive(null, now)).toBe(true);
    expect(isActive(new Date("2026-11-17T12:00:01Z"), now)).toBe(true);
    expect(isActive(new Date("2026-11-17T12:00:00Z"), now)).toBe(false);
    expect(expiryText(new Date("2026-11-17T12:30:00Z"), now)).toBe("in 30 minutes");
    expect(expiryText(new Date("2026-11-17T15:00:00Z"), now)).toBe("in 3 hours");
    expect(expiryText(new Date("2026-11-24T12:00:00Z"), now)).toBe("in 7 days");
    expect(expiryText(new Date("2026-11-17T11:00:00Z"), now)).toBe("expired");
  });
});

describe("access link limits", () => {
  it("stops a link at its end date or use limit", () => {
    expect(linkUsable({ uses: 3, maxUses: null, expiresAt: null }, now)).toBe(true);
    expect(linkUsable({ uses: 4, maxUses: 5, expiresAt: null }, now)).toBe(true);
    expect(linkUsable({ uses: 5, maxUses: 5, expiresAt: null }, now)).toBe(false);
    expect(linkUsable({ uses: 0, maxUses: null, expiresAt: new Date("2026-11-17T11:00:00Z") }, now)).toBe(false);
  });

  it("describes what is left", () => {
    expect(linkStatus({ uses: 0, maxUses: null, expiresAt: null }, now)).toBe("No limit");
    expect(linkStatus({ uses: 2, maxUses: 5, expiresAt: new Date("2026-11-18T12:00:00Z") }, now)).toBe(
      "3 of 5 uses left, expires in 24 hours",
    );
    expect(linkStatus({ uses: 5, maxUses: 5, expiresAt: null }, now)).toBe("Used up");
    expect(linkStatus({ uses: 0, maxUses: 5, expiresAt: new Date("2026-11-01T00:00:00Z") }, now)).toBe("Expired");
  });

  it("accepts sensible use limits only", () => {
    expect(parseMaxUses("10")).toBe(10);
    expect(parseMaxUses("")).toBeNull();
    expect(parseMaxUses("0")).toBeNull();
    expect(parseMaxUses("2.5")).toBeNull();
  });
});

describe("auto-block settings", () => {
  it("checks the limit and the duration", () => {
    expect(parseAutoBlock("120", "60")).toEqual({ limit: 120, minutes: 60 });
    expect(parseAutoBlock("10", "60")).toBeNull();
    expect(parseAutoBlock("120", "45")).toBeNull();
    expect(parseAutoBlock("abc", "60")).toBeNull();
  });

  it("counts page views per window", () => {
    const counter = new RateLimiter(Number.MAX_SAFE_INTEGER, 60_000);
    expect(counter.count("a", 0)).toBe(1);
    expect(counter.count("a", 1000)).toBe(2);
    expect(counter.count("b", 1000)).toBe(1);
    expect(counter.count("a", 61_000)).toBe(1);
  });
});

describe("rule end dates in backups", () => {
  it("keeps an end date through export and import", () => {
    const expiresAt = new Date("2026-12-01T00:00:00Z");
    const csv = rulesToCsv([
      { type: "IP", list: "BLACKLIST", matchType: "EXACT", value: "203.0.113.7", comment: null, enabled: true, expiresAt },
    ]);
    expect(csv).toContain("2026-12-01T00:00:00.000Z");
    const parsed = parseBackupCsv(csv, now);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rules[0].expiresAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("skips past, invalid and unsupported end dates", () => {
    const parsed = parseBackupCsv(
      "type,value,expires\nIP,203.0.113.7,2026-11-01T00:00:00Z\nIP,203.0.113.8,soon\nCOUNTRY,RU,2026-12-01T00:00:00Z\nIP,203.0.113.9,\n",
      now,
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rules.map((rule) => rule.value)).toEqual(["203.0.113.9"]);
    expect(parsed.errors).toEqual([
      "Line 2: this rule has already expired",
      "Line 3: expires must be a date, such as 2026-12-31T00:00:00Z",
      "Line 4: this rule type cannot have an end date",
    ]);
  });
});
