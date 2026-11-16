import { randomBytes } from "node:crypto";
import type { AccessLinkKind } from "@prisma/client";
import db from "../db.server";

// Admin Access and Auto-Whitelist links. Whoever holds the token gets past
// the filters, so it comes from the system's random source and is long
// enough that it cannot be guessed.
export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createAccessLink(shopId: string, kind: AccessLinkKind, label?: string) {
  return db.accessLink.create({
    data: { shopId, kind, token: newAccessToken(), label: label ?? null },
  });
}
