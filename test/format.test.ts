import { describe, expect, it } from "vitest";
import { flagEmoji, timeAgo } from "../app/lib/format";

describe("flagEmoji", () => {
  it("turns a country code into its flag", () => {
    expect(flagEmoji("BD")).toBe("🇧🇩");
    expect(flagEmoji("us")).toBe("🇺🇸");
  });

  it("returns an empty string for missing or invalid codes", () => {
    expect(flagEmoji(null)).toBe("");
    expect(flagEmoji("USA")).toBe("");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("says just now under a minute", () => {
    expect(timeAgo(new Date("2026-10-28T11:59:30Z"), now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(timeAgo(new Date("2026-10-28T11:58:00Z"), now)).toBe("2 minutes ago");
    expect(timeAgo(new Date("2026-10-28T11:00:00Z"), now)).toBe("1 hour ago");
    expect(timeAgo("2026-10-25T12:00:00Z", now)).toBe("3 days ago");
  });
});
