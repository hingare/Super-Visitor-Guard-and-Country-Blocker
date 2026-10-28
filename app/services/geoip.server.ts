import maxmind from "maxmind";
import type { CityResponse, Reader } from "maxmind";

// Looks up a visitor's location in a MaxMind GeoIP2/GeoLite2 City database.
// Set GEOIP_CITY_DB to the .mmdb file path. Without it every lookup returns
// null and the Country Blocker lets visitors through (see verdict.ts).

export interface GeoLocation {
  country: string | null;
  countryName: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
}

let reader: Promise<Reader<CityResponse> | null> | null = null;

function getReader() {
  // eslint-disable-next-line no-undef
  const path = process.env.GEOIP_CITY_DB;
  if (!path) return Promise.resolve(null);
  reader ??= maxmind
    .open<CityResponse>(path, { cache: { max: 10000 }, watchForUpdates: true })
    .catch((error) => {
      console.error("Could not open GeoIP database", error);
      reader = null;
      return null;
    });
  return reader;
}

export async function lookupGeo(ip: string | null): Promise<GeoLocation | null> {
  if (!ip || !maxmind.validate(ip)) return null;
  const db = await getReader();
  const record = db?.get(ip);
  if (!record) return null;
  const subdivision = record.subdivisions?.[0];
  return {
    country: record.country?.iso_code ?? record.registered_country?.iso_code ?? null,
    countryName: record.country?.names.en ?? null,
    regionCode: subdivision?.iso_code ?? null,
    regionName: subdivision?.names.en ?? null,
    city: record.city?.names.en ?? null,
  };
}
