import { describe, expect, it } from "vitest";
import { ipMatches, normalizeIp, parseBulkIps, parseIp, parseIpRule } from "../app/lib/ip";

describe("parseIp", () => {
  it("parses IPv4", () => {
    expect(parseIp("192.0.2.1")).toEqual({ version: 4, value: 3221225985n });
  });

  it("rejects malformed IPv4", () => {
    for (const bad of ["256.0.0.1", "1.2.3", "1.2.3.4.5", "a.b.c.d", ""]) {
      expect(parseIp(bad)).toBeNull();
    }
  });

  it("parses IPv6 with and without compression", () => {
    expect(parseIp("2001:db8::1")?.version).toBe(6);
    expect(parseIp("2001:0db8:0000:0000:0000:0000:0000:0001")?.value).toBe(
      parseIp("2001:db8::1")?.value,
    );
    expect(parseIp("::")?.value).toBe(0n);
    expect(parseIp("1::2::3")).toBeNull();
    expect(parseIp("1:2:3:4:5:6:7:8:9")).toBeNull();
  });

  it("treats IPv4-mapped IPv6 as IPv4", () => {
    expect(parseIp("::ffff:192.0.2.1")).toEqual(parseIp("192.0.2.1"));
  });
});

describe("normalizeIp", () => {
  it("returns canonical text", () => {
    expect(normalizeIp(" 192.0.2.1 ")).toBe("192.0.2.1");
    expect(normalizeIp("2001:0DB8:0:0:0:0:0:1")).toBe("2001:db8::1");
    expect(normalizeIp("2001:db8:0:1:0:0:0:1")).toBe("2001:db8:0:1::1");
    expect(normalizeIp("nope")).toBeNull();
  });
});

describe("parseIpRule", () => {
  it("accepts a single address", () => {
    const rule = parseIpRule("203.0.113.7");
    expect(rule).toMatchObject({ ok: true, value: "203.0.113.7", isRange: false });
  });

  it("normalizes CIDR blocks to their network address", () => {
    const rule = parseIpRule("203.0.113.77/24");
    expect(rule).toMatchObject({ ok: true, value: "203.0.113.0/24", isRange: true });
    if (!rule.ok) throw new Error("expected ok");
    expect(ipMatches(parseIp("203.0.113.255")!, rule.matcher)).toBe(true);
    expect(ipMatches(parseIp("203.0.114.0")!, rule.matcher)).toBe(false);
  });

  it("accepts dash ranges", () => {
    const rule = parseIpRule("192.0.2.10 - 192.0.2.50");
    expect(rule).toMatchObject({ ok: true, value: "192.0.2.10-192.0.2.50" });
    if (!rule.ok) throw new Error("expected ok");
    expect(ipMatches(parseIp("192.0.2.30")!, rule.matcher)).toBe(true);
    expect(ipMatches(parseIp("192.0.2.51")!, rule.matcher)).toBe(false);
  });

  it("matches IPv6 ranges and never across versions", () => {
    const rule = parseIpRule("2001:db8::/32");
    if (!rule.ok) throw new Error("expected ok");
    expect(ipMatches(parseIp("2001:db8:ffff::1")!, rule.matcher)).toBe(true);
    expect(ipMatches(parseIp("0.0.0.1")!, rule.matcher)).toBe(false);
  });

  it("rejects invalid input", () => {
    expect(parseIpRule("")).toMatchObject({ ok: false });
    expect(parseIpRule("10.0.0.0/33")).toMatchObject({ ok: false });
    expect(parseIpRule("10.0.0.9-10.0.0.1")).toMatchObject({ ok: false });
    expect(parseIpRule("10.0.0.1-2001:db8::1")).toMatchObject({ ok: false });
  });
});

describe("parseBulkIps", () => {
  it("splits lines, de-duplicates and reports invalid entries", () => {
    expect(parseBulkIps("1.1.1.1\n1.1.1.1, 10.0.0.0/8\nbad\n")).toEqual({
      values: ["1.1.1.1", "10.0.0.0/8"],
      invalid: ["bad"],
    });
  });
});
