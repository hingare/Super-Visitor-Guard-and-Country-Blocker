import { promises as dns } from "node:dns";
import type { TrustedBot } from "../lib/bots";
import { hostMatchesDomains } from "../lib/bots";
import { normalizeIp } from "../lib/ip";

// Forward-confirmed reverse DNS for crawlers that claim to be a trusted bot.
// Results are cached per IP for a day; lookups time out quickly so a slow
// resolver never holds up a storefront page.

const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 1500;
const cache = new Map<string, { expires: number; verified: boolean }>();

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]);
}

async function reverseConfirms(ip: string, domains: string[]): Promise<boolean> {
  const hosts = (await withTimeout(dns.reverse(ip))) ?? [];
  for (const host of hosts) {
    if (!hostMatchesDomains(host, domains)) continue;
    const forward = ip.includes(":") ? dns.resolve6(host) : dns.resolve4(host);
    const addresses = (await withTimeout(forward)) ?? [];
    if (addresses.some((address) => normalizeIp(address) === ip)) return true;
  }
  return false;
}

export async function verifyBot(bot: TrustedBot, ip: string, asn: number | null): Promise<boolean> {
  if (asn !== null && bot.asns.includes(asn)) return true;
  if (bot.domains.length === 0) return false;

  const key = `${bot.name}|${ip}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.verified;

  const verified = await reverseConfirms(ip, bot.domains);
  if (cache.size > 50_000) cache.clear();
  cache.set(key, { expires: Date.now() + CACHE_MS, verified });
  return verified;
}
