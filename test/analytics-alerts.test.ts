import { describe, expect, it } from "vitest";
import {
  dayKeys,
  fillDays,
  localDay,
  niceMax,
  parseAnalyticsRange,
  safeTimeZone,
  share,
  startOfLocalDay,
} from "../app/lib/analytics";
import { alertDue, formatSpikeAlert, isSpike, parseThreshold, type SpikeStats } from "../app/lib/spike-alert";

describe("analytics days", () => {
  it("uses the store's calendar day", () => {
    const now = new Date("2026-11-17T20:30:00Z");
    expect(localDay(now, "UTC")).toBe("2026-11-17");
    expect(localDay(now, "Asia/Dhaka")).toBe("2026-11-18");
    expect(localDay(now, "America/Los_Angeles")).toBe("2026-11-17");
  });

  it("lists the last days oldest first, across month ends", () => {
    expect(dayKeys(3, new Date("2026-12-01T10:00:00Z"), "UTC")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
    expect(dayKeys(2, new Date("2026-11-17T20:30:00Z"), "Asia/Dhaka")).toEqual(["2026-11-17", "2026-11-18"]);
  });

  it("finds the start of a local day, including over a clock change", () => {
    expect(startOfLocalDay("2026-11-17", "Asia/Dhaka").toISOString()).toBe("2026-11-16T18:00:00.000Z");
    expect(startOfLocalDay("2026-11-17", "UTC").toISOString()).toBe("2026-11-17T00:00:00.000Z");
    // New York changes from EDT to EST on 2026-11-01.
    expect(startOfLocalDay("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfLocalDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("fills quiet days with zeros and ignores days outside the range", () => {
    const days = fillDays(
      [
        { day: "2026-11-16", verdict: "ALLOWED", count: 5 },
        { day: "2026-11-16", verdict: "BLOCKED", count: 2 },
        { day: "2026-11-17", verdict: "REDIRECTED", count: 1 },
        { day: "2026-11-01", verdict: "BLOCKED", count: 99 },
      ],
      ["2026-11-15", "2026-11-16", "2026-11-17"],
    );
    expect(days).toEqual([
      { day: "2026-11-15", allowed: 0, blocked: 0, redirected: 0 },
      { day: "2026-11-16", allowed: 5, blocked: 2, redirected: 0 },
      { day: "2026-11-17", allowed: 0, blocked: 0, redirected: 1 },
    ]);
  });

  it("rounds chart tops and shares", () => {
    expect(niceMax(0)).toBe(10);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(2400)).toBe(2500);
    expect(share(1, 3)).toBe("33%");
    expect(share(1, 200)).toBe("0.5%");
    expect(share(0, 0)).toBe("0%");
  });

  it("accepts known ranges and time zones only", () => {
    expect(parseAnalyticsRange("30d")).toBe("30d");
    expect(parseAnalyticsRange("1y")).toBe("7d");
    expect(safeTimeZone("Asia/Dhaka")).toBe("Asia/Dhaka");
    expect(safeTimeZone("Mars/Base")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
  });
});

describe("blocking alerts", () => {
  it("needs both the alert level and a jump over the usual rate", () => {
    expect(isSpike({ blocked: 120, usualPerHour: 5 }, 100)).toBe(true);
    expect(isSpike({ blocked: 90, usualPerHour: 5 }, 100)).toBe(false);
    // Under a steady attack of 80 an hour, 150 is not a jump.
    expect(isSpike({ blocked: 150, usualPerHour: 80 }, 100)).toBe(false);
    expect(isSpike({ blocked: 240, usualPerHour: 80 }, 100)).toBe(true);
  });

  it("waits six hours between alerts", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(alertDue(null, now)).toBe(true);
    expect(alertDue(new Date("2026-11-17T07:00:00Z"), now)).toBe(false);
    expect(alertDue(new Date("2026-11-17T06:00:00Z"), now)).toBe(true);
  });

  it("checks the alert level the merchant enters", () => {
    expect(parseThreshold("100")).toBe(100);
    expect(parseThreshold(" 25 ")).toBe(25);
    expect(parseThreshold("5")).toBeNull();
    expect(parseThreshold("12.5")).toBeNull();
    expect(parseThreshold("abc")).toBeNull();
  });

  it("writes an email that names the reasons", () => {
    const stats: SpikeStats = {
      windowStart: new Date("2026-11-17T11:00:00Z"),
      windowEnd: new Date("2026-11-17T12:00:00Z"),
      blocked: 340,
      visits: 400,
      usualPerHour: 4.25,
      reasons: [{ reason: "Country: US", count: 300 }],
      countries: [{ country: "US", name: "United States", count: 300 }],
    };
    const { subject, text } = formatSpikeAlert("demo.myshopify.com", stats, { threshold: 100, timeZone: "Asia/Dhaka" });
    expect(subject).toContain("340 page views blocked");
    expect(text).toContain("Blocked: 340 of 400 page views (85%)");
    expect(text).toContain("about 4.3 blocked page views an hour");
    expect(text).toContain("Country: US: 300");
    expect(text).toContain("Nov 17, 5:00 PM");
    const test = formatSpikeAlert("demo.myshopify.com", stats, { threshold: 100, timeZone: "UTC", test: true });
    expect(test.subject).toContain("test alert");
  });
});
