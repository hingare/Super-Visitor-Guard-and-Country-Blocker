import { promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Reader } from "maxmind";

import { extractTarFile } from "../lib/tar";

// Keeps the MaxMind databases (see geoip.server.ts) up to date. With
// MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY set, each configured database
// file is downloaded again when MaxMind publishes a newer build (GeoLite2 is
// updated twice a week). The new file replaces the old one in one step and
// the running app picks it up without a restart.

const CHECK_EVERY_MS = 12 * 3_600_000;
const FIRST_CHECK_MS = 60_000;

export const GEOIP_DATABASES = [
  { env: "GEOIP_CITY_DB", editionEnv: "GEOIP_CITY_EDITION", defaultEdition: "GeoLite2-City" },
  { env: "GEOIP_ASN_DB", editionEnv: "GEOIP_ASN_EDITION", defaultEdition: "GeoLite2-ASN" },
  { env: "GEOIP_ANON_DB", editionEnv: "GEOIP_ANON_EDITION", defaultEdition: "GeoIP2-Anonymous-IP" },
] as const;

const EDITION = /^(GeoLite2|GeoIP2)-[A-Za-z0-9-]+$/;

// The MaxMind edition for a database file: the *_EDITION variable, else the
// file's own name (GeoLite2-City.mmdb), else the usual free edition.
export function editionFor(path: string, configured: string | undefined, fallback: string): string {
  if (configured && EDITION.test(configured)) return configured;
  const fromName = basename(path).replace(/\.mmdb$/i, "");
  return EDITION.test(fromName) ? fromName : fallback;
}

export function downloadUrl(edition: string): string {
  return `https://download.maxmind.com/geoip/databases/${edition}/download?suffix=tar.gz`;
}

export type UpdateResult = "updated" | "current" | "failed";

export interface GeoIpStatus {
  edition: string;
  path: string;
  builtAt: Date | null;
  lastCheck: Date | null;
  lastResult: UpdateResult | null;
}

const status = new Map<string, GeoIpStatus>();

export function geoIpStatus(): GeoIpStatus[] {
  return [...status.values()];
}

async function fileTime(path: string): Promise<Date | null> {
  try {
    return (await fs.stat(path)).mtime;
  } catch {
    return null;
  }
}

export async function updateDatabase(
  path: string,
  edition: string,
  auth: string,
  fetcher: typeof fetch = fetch,
  // Throws for anything that is not a readable database.
  validate: (database: Buffer) => unknown = (database) => new Reader(database),
): Promise<UpdateResult> {
  const headers = { Authorization: `Basic ${auth}` };
  const current = await fileTime(path);
  const head = await fetcher(downloadUrl(edition), { method: "HEAD", headers });
  if (!head.ok) throw new Error(`MaxMind answered ${head.status} for ${edition}`);
  const published = Date.parse(head.headers.get("last-modified") ?? "");
  if (current && Number.isFinite(published) && published <= current.getTime()) return "current";

  const response = await fetcher(downloadUrl(edition), { headers });
  if (!response.ok) throw new Error(`MaxMind answered ${response.status} for ${edition}`);
  const archive = gunzipSync(Buffer.from(await response.arrayBuffer()));
  const database = extractTarFile(archive, (name) => name.endsWith(".mmdb"));
  if (!database) throw new Error(`No database file in the ${edition} download`);
  // Refuse anything that is not a readable database before replacing the file.
  validate(database);

  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await fs.writeFile(temporary, database);
  if (Number.isFinite(published)) {
    const when = new Date(published);
    await fs.utimes(temporary, when, when);
  }
  await fs.rename(temporary, path);
  return "updated";
}

export async function updateAllDatabases(now = new Date()) {
  // eslint-disable-next-line no-undef
  const env = process.env;
  if (!env.MAXMIND_ACCOUNT_ID || !env.MAXMIND_LICENSE_KEY) return;
  const auth = Buffer.from(`${env.MAXMIND_ACCOUNT_ID}:${env.MAXMIND_LICENSE_KEY}`).toString("base64");
  for (const database of GEOIP_DATABASES) {
    const path = env[database.env];
    if (!path) continue;
    const edition = editionFor(path, env[database.editionEnv], database.defaultEdition);
    let result: UpdateResult;
    try {
      result = await updateDatabase(path, edition, auth);
      if (result === "updated") console.log(`GeoIP database ${edition} updated`);
    } catch (error) {
      result = "failed";
      console.error(`Could not update the GeoIP database ${edition}`, error);
    }
    status.set(database.env, { edition, path, builtAt: await fileTime(path), lastCheck: now, lastResult: result });
  }
}

// What the IP lookup page shows about the databases.
export async function describeGeoIpDatabases() {
  // eslint-disable-next-line no-undef
  const env = process.env;
  const autoUpdate = Boolean(env.MAXMIND_ACCOUNT_ID && env.MAXMIND_LICENSE_KEY);
  const rows = [];
  for (const database of GEOIP_DATABASES) {
    const path = env[database.env];
    if (!path) continue;
    const edition = editionFor(path, env[database.editionEnv], database.defaultEdition);
    const known = status.get(database.env);
    rows.push({
      edition,
      builtAt: await fileTime(path),
      lastCheck: known?.lastCheck ?? null,
      lastResult: known?.lastResult ?? null,
    });
  }
  return { autoUpdate, databases: rows };
}

let started = false;

export function startGeoIpUpdateJob() {
  // eslint-disable-next-line no-undef
  if (started || !process.env.MAXMIND_LICENSE_KEY) return;
  started = true;
  const run = () => void updateAllDatabases().catch((error) => console.error("GeoIP update failed", error));
  setTimeout(run, FIRST_CHECK_MS).unref();
  setInterval(run, CHECK_EVERY_MS).unref();
}
