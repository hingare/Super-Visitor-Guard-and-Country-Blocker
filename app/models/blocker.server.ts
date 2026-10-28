import type { Blocker } from "@prisma/client";
import db from "../db.server";
import { parseHandlingForm } from "../lib/block-handling";

export async function getBlockerConfig(shopId: string, blocker: Blocker) {
  return db.blockerConfig.upsert({
    where: { shopId_blocker: { shopId, blocker } },
    create: { shopId, blocker },
    update: {},
  });
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveHandling(
  shopId: string,
  blocker: Blocker,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseHandlingForm(form);
  if (!parsed.ok) return parsed;
  if (blocker === "REFERRER" && parsed.value.handling === "CUSTOM_INFO") {
    return { ok: false, error: "The referrer blocker cannot show information on the page." };
  }
  await db.blockerConfig.upsert({
    where: { shopId_blocker: { shopId, blocker } },
    create: { shopId, blocker, ...parsed.value },
    update: parsed.value,
  });
  return { ok: true, message: "Settings saved" };
}
