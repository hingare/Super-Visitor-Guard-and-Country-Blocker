// Time limits: rules that expire, access links with an end date or a use
// limit, and the IP Blocker's automatic flood block.

import type { RuleType } from "@prisma/client";

const HOUR_MS = 60 * 60 * 1000;

export const EXPIRY_OPTIONS = [
  { value: "", label: "Never" },
  { value: "1h", label: "After 1 hour" },
  { value: "24h", label: "After 24 hours" },
  { value: "7d", label: "After 7 days" },
  { value: "30d", label: "After 30 days" },
] as const;

const EXPIRY_MS: Record<string, number> = {
  "1h": HOUR_MS,
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
};

// "" means never. Anything unknown is treated as never as well.
export function parseExpiry(value: unknown, now = new Date()): Date | null {
  const ms = EXPIRY_MS[String(value ?? "")];
  return ms ? new Date(now.getTime() + ms) : null;
}

// Rules checked on the storefront only. Checkout and order rules are copied
// into Shopify or read by webhooks, so they do not take an end date.
export const EXPIRING_RULE_TYPES: readonly RuleType[] = [
  "IP",
  "IP_RANGE",
  "VISITOR",
  "REFERRER",
  "URL",
  "ISP",
  "ASN",
  "CRAWLER",
  "ORGANIZATION",
];

export function canExpire(type: string): boolean {
  return (EXPIRING_RULE_TYPES as readonly string[]).includes(type);
}

export function isActive(expiresAt: Date | string | null | undefined, now = new Date()): boolean {
  return !expiresAt || new Date(expiresAt).getTime() > now.getTime();
}

// "in 3 hours", "in 2 days", or "expired".
export function expiryText(expiresAt: Date | string, now = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} days`;
}

// Access links.

export const LINK_EXPIRY_OPTIONS = [
  { value: "", label: "Never expires" },
  { value: "24h", label: "Expires after 24 hours" },
  { value: "7d", label: "Expires after 7 days" },
  { value: "30d", label: "Expires after 30 days" },
] as const;

export const LINK_USE_OPTIONS = [
  { value: "", label: "Unlimited uses" },
  { value: "1", label: "1 use" },
  { value: "5", label: "5 uses" },
  { value: "10", label: "10 uses" },
  { value: "50", label: "50 uses" },
] as const;

export function parseMaxUses(value: unknown): number | null {
  const number = Number(String(value ?? ""));
  return Number.isInteger(number) && number >= 1 && number <= 10_000 ? number : null;
}

export interface LinkLimits {
  uses: number;
  maxUses: number | null;
  expiresAt: Date | string | null;
}

// Whether opening the link still works.
export function linkUsable(link: LinkLimits, now = new Date()): boolean {
  return isActive(link.expiresAt, now) && (link.maxUses === null || link.uses < link.maxUses);
}

export function linkStatus(link: LinkLimits, now = new Date()): string {
  if (!isActive(link.expiresAt, now)) return "Expired";
  if (link.maxUses !== null && link.uses >= link.maxUses) return "Used up";
  const parts: string[] = [];
  if (link.maxUses !== null) parts.push(`${link.maxUses - link.uses} of ${link.maxUses} uses left`);
  if (link.expiresAt) parts.push(`expires ${expiryText(link.expiresAt, now)}`);
  return parts.length ? parts.join(", ") : "No limit";
}

// Auto-block.

export const AUTO_BLOCK_LIMITS = { min: 30, max: 1000 } as const;
export const AUTO_BLOCK_MINUTES = [
  { value: 15, label: "15 minutes" },
  { value: 60, label: "1 hour" },
  { value: 360, label: "6 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
] as const;

export function parseAutoBlock(limit: unknown, minutes: unknown): { limit: number; minutes: number } | null {
  const perMinute = Number(String(limit ?? "").trim());
  const duration = Number(String(minutes ?? ""));
  if (!Number.isInteger(perMinute) || perMinute < AUTO_BLOCK_LIMITS.min || perMinute > AUTO_BLOCK_LIMITS.max) return null;
  if (!AUTO_BLOCK_MINUTES.some((option) => option.value === duration)) return null;
  return { limit: perMinute, minutes: duration };
}

export const AUTO_BLOCK_COMMENT = "Auto-blocked";
