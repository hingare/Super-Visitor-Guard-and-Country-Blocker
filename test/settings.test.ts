import { describe, expect, it } from "vitest";
import { parseGeneralSettings } from "../app/lib/settings";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseGeneralSettings", () => {
  it("accepts valid input", () => {
    const result = parseGeneralSettings(
      form({
        failOpenMs: "1500",
        excludeAdmins: "on",
        orderAction: "CANCELLED",
        notifyEmail: " owner@example.com ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        failOpenMs: 1500,
        excludeAdmins: true,
        orderAction: "CANCELLED",
        notifyEmail: "owner@example.com",
      },
    });
  });

  it("treats a missing checkbox as unchecked and an empty email as none", () => {
    const result = parseGeneralSettings(
      form({ failOpenMs: "800", orderAction: "TAGGED", notifyEmail: "" }),
    );
    expect(result.ok && result.data.excludeAdmins).toBe(false);
    expect(result.ok && result.data.notifyEmail).toBeNull();
  });

  it("rejects out-of-range timeouts, unknown actions and bad emails", () => {
    const result = parseGeneralSettings(
      form({ failOpenMs: "100", orderAction: "DELETE", notifyEmail: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "failOpenMs",
        "notifyEmail",
        "orderAction",
      ]);
    }
  });

  it("rejects a non-integer timeout", () => {
    const result = parseGeneralSettings(
      form({ failOpenMs: "1500.5", orderAction: "TAGGED" }),
    );
    expect(result.ok).toBe(false);
  });
});
