import maxmind from "maxmind";
import type { AnonymousIPResponse, AsnResponse, CityResponse, Reader, Response } from "maxmind";
import { HOSTING_ASNS, UNKNOWN_NETWORK, type NetworkInfo } from "../lib/network";
import { isTorExit } from "./tor.server";

// Looks up visitors in MaxMind databases, each optional:
//   GEOIP_CITY_DB  GeoLite2/GeoIP2 City: country, region, city. Without it
//                  the Country Blocker lets visitors through (see verdict.ts).
//   GEOIP_ASN_DB   GeoLite2 ASN: network number and organization name.
//   GEOIP_ANON_DB  GeoIP2 Anonymous IP (paid): VPN, proxy, hosting flags.
//                  Without it, hosting networks count as VPN/proxy.

export interface GeoLocation {
  country: string | null;
  countryName: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
}

const readers = new Map<string, Promise<Reader<Response> | null>>();

function getReader<T extends Response>(envName: string): Promise<Reader<T> | null> {
  // eslint-disable-next-line no-undef
  const path = process.env[envName];
  if (!path) return Promise.resolve(null);
  let reader = readers.get(envName);
  if (!reader) {
    reader = maxmind
      .open<T>(path, { cache: { max: 10000 }, watchForUpdates: true })
      .catch((error) => {
        console.error(`Could not open ${envName}`, error);
        readers.delete(envName);
        return null;
      }) as Promise<Reader<Response> | null>;
    readers.set(envName, reader);
  }
  return reader as Promise<Reader<T> | null>;
}

export async function lookupGeo(ip: string | null): Promise<GeoLocation | null> {
  if (!ip || !maxmind.validate(ip)) return null;
  const db = await getReader<CityResponse>("GEOIP_CITY_DB");
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

export async function lookupNetwork(ip: string | null): Promise<NetworkInfo> {
  if (!ip || !maxmind.validate(ip)) return UNKNOWN_NETWORK;
  const [asnDb, anonDb] = await Promise.all([
    getReader<AsnResponse>("GEOIP_ASN_DB"),
    getReader<AnonymousIPResponse>("GEOIP_ANON_DB"),
  ]);
  const asn = asnDb?.get(ip) ?? null;
  const asnNumber = asn?.autonomous_system_number ?? null;
  const isTor = isTorExit(ip);

  if (anonDb) {
    const anon = anonDb.get(ip);
    return {
      asn: asnNumber,
      organization: asn?.autonomous_system_organization ?? null,
      isVpn: Boolean(anon?.is_anonymous_vpn),
      isProxy: Boolean(anon?.is_public_proxy || anon?.is_residential_proxy || anon?.is_anonymous_proxy),
      isTor: isTor || Boolean(anon?.is_tor_exit_node),
      isHosting: Boolean(anon?.is_hosting_provider),
    };
  }

  const isHosting = asnNumber !== null && HOSTING_ASNS.has(asnNumber);
  return {
    asn: asnNumber,
    organization: asn?.autonomous_system_organization ?? null,
    isVpn: isHosting,
    isProxy: false,
    isTor,
    isHosting,
  };
}
