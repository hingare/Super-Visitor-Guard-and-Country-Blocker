// IPv4/IPv6 parsing and matching for the IP Blocker. IP rules hold either a
// single address ("203.0.113.7"), a CIDR block ("203.0.113.0/24") or an
// inclusive range ("203.0.113.10-203.0.113.50").

export interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

function parseIpv4(input: string): bigint | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(input: string): bigint | null {
  let text = input.toLowerCase();
  // Embedded IPv4 tail, e.g. ::ffff:192.0.2.1
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".") && lastColon !== -1) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (v4 === null) return null;
    tail = [Number(v4 >> 16n), Number(v4 & 0xffffn)];
    // Stand-in groups, replaced by the IPv4 tail once the rest is expanded.
    text = `${text.slice(0, lastColon)}:0:0`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (tail.length) {
    groups.splice(6, 2, tail[0].toString(16), tail[1].toString(16));
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

export function parseIp(input: string): ParsedIp | null {
  const text = input.trim();
  if (text.includes(":")) {
    const value = parseIpv6(text);
    if (value === null) return null;
    // Treat IPv4-mapped IPv6 (::ffff:a.b.c.d) as plain IPv4.
    if (value >> 32n === 0xffffn) return { version: 4, value: value & 0xffffffffn };
    return { version: 6, value };
  }
  const value = parseIpv4(text);
  return value === null ? null : { version: 4, value };
}

function formatIp(ip: ParsedIp): string {
  if (ip.version === 4) {
    return [24n, 16n, 8n, 0n].map((shift) => Number((ip.value >> shift) & 0xffn)).join(".");
  }
  const groups: string[] = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(((ip.value >> shift) & 0xffffn).toString(16));
  }
  // Collapse the longest run of zero groups, as in RFC 5952.
  let best = { start: -1, length: 0 };
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === "0") j += 1;
    if (j - i > best.length && j - i > 1) best = { start: i, length: j - i };
    i = j;
  }
  if (best.start === -1) return groups.join(":");
  const left = groups.slice(0, best.start).join(":");
  const right = groups.slice(best.start + best.length).join(":");
  return `${left}::${right}`;
}

export interface IpMatcher {
  version: 4 | 6;
  start: bigint;
  end: bigint;
}

export type IpRuleResult =
  | { ok: true; value: string; matcher: IpMatcher; isRange: boolean }
  | { ok: false; error: string };

// Validates an IP rule value and returns it in canonical form.
export function parseIpRule(input: string): IpRuleResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an IP address." };

  if (text.includes("/")) {
    const [address, bitsText] = text.split("/");
    const ip = parseIp(address);
    const width = ip?.version === 6 ? 128 : 32;
    const bits = Number(bitsText);
    if (!ip || !/^\d{1,3}$/.test(bitsText) || bits > width) {
      return { ok: false, error: "Enter a valid CIDR range, such as 203.0.113.0/24." };
    }
    const hostBits = BigInt(width - bits);
    const start = (ip.value >> hostBits) << hostBits;
    const end = start + (1n << hostBits) - 1n;
    return {
      ok: true,
      value: `${formatIp({ version: ip.version, value: start })}/${bits}`,
      matcher: { version: ip.version, start, end },
      isRange: bits < width,
    };
  }

  if (text.includes("-")) {
    const [fromText, toText] = text.split("-").map((part) => part.trim());
    const from = parseIp(fromText ?? "");
    const to = parseIp(toText ?? "");
    if (!from || !to || from.version !== to.version) {
      return { ok: false, error: "Enter a range as two addresses, such as 203.0.113.10-203.0.113.50." };
    }
    if (from.value > to.value) {
      return { ok: false, error: "The first address must come before the second." };
    }
    return {
      ok: true,
      value: `${formatIp(from)}-${formatIp(to)}`,
      matcher: { version: from.version, start: from.value, end: to.value },
      isRange: from.value !== to.value,
    };
  }

  const ip = parseIp(text);
  if (!ip) return { ok: false, error: "Enter a valid IPv4 or IPv6 address." };
  return {
    ok: true,
    value: formatIp(ip),
    matcher: { version: ip.version, start: ip.value, end: ip.value },
    isRange: false,
  };
}

export function normalizeIp(input: string): string | null {
  const ip = parseIp(input);
  return ip ? formatIp(ip) : null;
}

export function ipMatches(ip: ParsedIp, matcher: IpMatcher): boolean {
  return ip.version === matcher.version && ip.value >= matcher.start && ip.value <= matcher.end;
}

// Splits a bulk upload (one value per line, or separated by commas or
// spaces) into valid rule values and the lines that failed.
export function parseBulkIps(input: string): { values: string[]; invalid: string[] } {
  const values = new Set<string>();
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    if (raw === "") continue;
    const parsed = parseIpRule(raw);
    if (parsed.ok) values.add(parsed.value);
    else invalid.push(raw);
  }
  return { values: [...values], invalid };
}
