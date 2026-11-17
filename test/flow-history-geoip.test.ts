import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describeForm } from "../app/lib/change-log";
import {
  FLOW_TRIGGERS,
  legacyOrderId,
  orderCancelledPayload,
  triggerFromCallback,
  visitorBlockedPayload,
} from "../app/lib/flow";
import { extractTarFile } from "../app/lib/tar";
import { downloadUrl, editionFor, updateDatabase } from "../app/services/geoip-update.server";

function tarEntry(name: string, body: Buffer, type = "0") {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write("0000644\0", 100);
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write(type, 156);
  header.write("ustar\0", 257);
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}

const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

describe("change history", () => {
  it("describes a form post briefly", () => {
    const form = new FormData();
    form.set("intent", "addRule");
    form.set("type", "IP");
    form.set("list", "BLACKLIST");
    form.set("value", "203.0.113.5");
    form.set("comment", "");
    expect(describeForm(form)).toBe("type: IP · list: BLACKLIST · value: 203.0.113.5");
  });

  it("shortens long and multi-line values and skips files", () => {
    const form = new FormData();
    form.set("values", Array.from({ length: 8 }, (_, i) => `10.0.0.${i}`).join("\n"));
    form.set("file", new File(["x"], "backup.csv"));
    form.append("countries", "RU");
    form.append("countries", "CN");
    expect(describeForm(form)).toBe(
      "values: 10.0.0.0, 10.0.0.1, 10.0.0.2, 10.0.0.3, 10.0.0.4 … (8 lines) · countries: RU, CN",
    );
    expect(describeForm(new FormData())).toBeNull();
    const long = new FormData();
    long.set("message", "x".repeat(300));
    expect(describeForm(long)!.length).toBeLessThanOrEqual(90);
  });
});

describe("Flow triggers", () => {
  it("recognises its triggers in lifecycle callbacks", () => {
    expect(triggerFromCallback("Order cancelled by Super Visitor Guard")).toBe(FLOW_TRIGGERS.orderCancelled);
    expect(triggerFromCallback("visitor-blocked")).toBe(FLOW_TRIGGERS.visitorBlocked);
    expect(triggerFromCallback("Something else")).toBeNull();
    expect(triggerFromCallback(42)).toBeNull();
  });

  it("builds payloads with the TOML field keys", () => {
    expect(legacyOrderId("gid://shopify/Order/5551234")).toBe(5551234);
    expect(
      orderCancelledPayload({
        orderId: "gid://shopify/Order/5551234",
        source: "AUTO_CANCEL",
        action: "CANCELLED",
        reason: "Buyer email matches",
      }),
    ).toEqual({ order_id: 5551234, Filter: "Auto-cancel filters", Result: "cancelled", Reason: "Buyer email matches" });
    expect(
      visitorBlockedPayload({ ip: "203.0.113.5", country: null, blocker: "IP", reason: "IP: 203.0.113.5", visitorCode: "CT-123456789" }),
    ).toEqual({
      "IP address": "203.0.113.5",
      "Country code": "",
      Blocker: "IP",
      Reason: "IP: 203.0.113.5",
      "Visitor ID": "CT-123456789",
    });
  });

  it("matches the field keys declared in the extensions", () => {
    const keys = (file: string) =>
      [...readFileSync(file, "utf8").matchAll(/^\s*key = "([^"]+)"/gm)].map((match) => match[1]);
    expect(keys("extensions/flow-order-cancelled/shopify.extension.toml")).toEqual(["Filter", "Result", "Reason"]);
    expect(keys("extensions/flow-visitor-blocked/shopify.extension.toml")).toEqual(
      Object.keys(visitorBlockedPayload({ ip: "", country: "", blocker: "", reason: "", visitorCode: "" })),
    );
  });
});

describe("GeoIP updates", () => {
  it("reads a file out of a tar archive", () => {
    const archive = tar(
      tarEntry("GeoLite2-City_20261114/", Buffer.alloc(0), "5"),
      tarEntry("GeoLite2-City_20261114/LICENSE.txt", Buffer.from("license")),
      tarEntry("GeoLite2-City_20261114/GeoLite2-City.mmdb", Buffer.from("database bytes")),
    );
    expect(extractTarFile(archive, (name) => name.endsWith(".mmdb"))?.toString()).toBe("database bytes");
    expect(extractTarFile(archive, (name) => name.endsWith(".zip"))).toBeNull();
  });

  it("works out the MaxMind edition", () => {
    expect(editionFor("/data/GeoLite2-City.mmdb", undefined, "GeoLite2-City")).toBe("GeoLite2-City");
    expect(editionFor("/data/city.mmdb", undefined, "GeoLite2-City")).toBe("GeoLite2-City");
    expect(editionFor("/data/city.mmdb", "GeoIP2-City", "GeoLite2-City")).toBe("GeoIP2-City");
    expect(editionFor("/data/city.mmdb", "../../etc", "GeoLite2-ASN")).toBe("GeoLite2-ASN");
    expect(downloadUrl("GeoLite2-ASN")).toBe(
      "https://download.maxmind.com/geoip/databases/GeoLite2-ASN/download?suffix=tar.gz",
    );
  });

  it("skips the download when the file is current and refuses a broken one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "geoip-"));
    const path = join(dir, "GeoLite2-City.mmdb");
    writeFileSync(path, "old");
    const now = statSync(path).mtime;
    const calls: string[] = [];
    const older = new Date(now.getTime() - 86_400_000).toUTCString();
    const current = (async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Basic YTpi");
      return new Response(null, { status: 200, headers: { "last-modified": older } });
    }) as typeof fetch;
    expect(await updateDatabase(path, "GeoLite2-City", "YTpi", current)).toBe("current");
    expect(calls).toEqual(["HEAD"]);

    const newer = new Date(now.getTime() + 86_400_000).toUTCString();
    const broken = (async (_url: string, init?: RequestInit) =>
      init?.method === "HEAD"
        ? new Response(null, { status: 200, headers: { "last-modified": newer } })
        : new Response(gzipSync(tar(tarEntry("x/GeoLite2-City.mmdb", Buffer.from("not a database")))))) as typeof fetch;
    await expect(updateDatabase(path, "GeoLite2-City", "YTpi", broken)).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe("old");

    const good = (async (_url: string, init?: RequestInit) =>
      init?.method === "HEAD"
        ? new Response(null, { status: 200, headers: { "last-modified": newer } })
        : new Response(gzipSync(tar(tarEntry("x/GeoLite2-City.mmdb", Buffer.from("new build")))))) as typeof fetch;
    expect(await updateDatabase(path, "GeoLite2-City", "YTpi", good, () => true)).toBe("updated");
    expect(readFileSync(path, "utf8")).toBe("new build");
    expect(statSync(path).mtime.toUTCString()).toBe(newer);
    expect(await updateDatabase(path, "GeoLite2-City", "YTpi", good, () => true)).toBe("current");

    const denied = (async () => new Response(null, { status: 401 })) as typeof fetch;
    await expect(updateDatabase(path, "GeoLite2-City", "YTpi", denied)).rejects.toThrow(/401/);
  });
});
