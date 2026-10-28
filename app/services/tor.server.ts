import { normalizeIp } from "../lib/ip";

// Tor exit addresses, refreshed hourly in the background. Until the first
// download finishes the list is empty, so nothing waits on the network.

const LIST_URL = "https://check.torproject.org/torbulkexitlist";
const REFRESH_MS = 60 * 60 * 1000;

let exits = new Set<string>();
let fetchedAt = 0;
let loading = false;

async function refresh() {
  loading = true;
  try {
    const response = await fetch(LIST_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = new Set<string>();
    for (const line of (await response.text()).split("\n")) {
      const ip = normalizeIp(line);
      if (ip) next.add(ip);
    }
    if (next.size > 0) exits = next;
  } catch (error) {
    console.error("Could not refresh Tor exit list", error);
  } finally {
    fetchedAt = Date.now();
    loading = false;
  }
}

export function isTorExit(ip: string): boolean {
  // eslint-disable-next-line no-undef
  if (process.env.TOR_EXIT_LIST !== "off" && !loading && Date.now() - fetchedAt > REFRESH_MS) {
    void refresh();
  }
  return exits.has(ip);
}
