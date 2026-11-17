import { randomBytes } from "node:crypto";
import type { AccessLinkKind } from "@prisma/client";
import db from "../db.server";

// Admin Access and Auto-Whitelist links. Whoever holds the token gets past
// the filters, so it comes from the system's random source and is long
// enough that it cannot be guessed.
export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createAccessLink(
  shopId: string,
  kind: AccessLinkKind,
  options: { label?: string; expiresAt?: Date | null; maxUses?: number | null } = {},
) {
  return db.accessLink.create({
    data: {
      shopId,
      kind,
      token: newAccessToken(),
      label: options.label ?? null,
      expiresAt: options.expiresAt ?? null,
      maxUses: options.maxUses ?? null,
    },
  });
}

// Counts one opening of the link, if it is still within its limits. The
// check and the count are one statement, so two visitors cannot both take
// the last use.
export async function claimLinkUse(
  link: { id: string; maxUses: number | null },
  now = new Date(),
): Promise<boolean> {
  const { count } = await db.accessLink.updateMany({
    where: {
      id: link.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(link.maxUses !== null ? { uses: { lt: link.maxUses } } : {}),
    },
    data: { uses: { increment: 1 } },
  });
  return count === 1;
}
