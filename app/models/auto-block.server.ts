import { Prisma } from "@prisma/client";
import db from "../db.server";
import { invalidateVerdictConfig } from "./rules.server";
import { AUTO_BLOCK_COMMENT } from "../lib/limits";

// Puts a flooding IP on the shop's IP blacklist until `minutes` from now.
// An address the merchant blocked or allowed by hand is left as it is.
// Returns whether the blacklist changed.
export async function autoBlockIp(
  shopId: string,
  ip: string,
  options: { limit: number; minutes: number },
  now = new Date(),
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + options.minutes * 60_000);
  const comment = `${AUTO_BLOCK_COMMENT}: more than ${options.limit} page views in a minute`;
  const key = { shopId_type_list_value: { shopId, type: "IP" as const, list: "BLACKLIST" as const, value: ip } };
  const existing = await db.rule.findUnique({ where: key });
  if (existing && existing.expiresAt === null) return false;

  try {
    if (existing) {
      await db.rule.update({
        where: { id: existing.id },
        data: { enabled: true, comment, expiresAt: existing.expiresAt && existing.expiresAt > expiresAt ? existing.expiresAt : expiresAt },
      });
    } else {
      await db.rule.create({
        data: { shopId, type: "IP", list: "BLACKLIST", value: ip, comment, expiresAt },
      });
    }
  } catch (error) {
    // Another request created it a moment ago.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
  invalidateVerdictConfig(shopId);
  return true;
}
