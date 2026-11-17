import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { CHANGE_LOG_DAYS, describeForm } from "../lib/change-log";
import { PAGE_SIZE } from "./rules.server";

type Result = { ok: boolean; message?: string } | Response | null | undefined;

function isOkResult(result: Result): result is { ok: true; message?: string } {
  return Boolean(result && !(result instanceof Response) && typeof result === "object" && result.ok);
}

// Wraps an admin page's action so each change that succeeds is written to
// the Change History. Logging never makes the action fail.
export function withChangeLog<T extends Result>(
  page: string,
  action: (args: ActionFunctionArgs) => Promise<T>,
) {
  return async (args: ActionFunctionArgs): Promise<T> => {
    const copy = args.request.clone();
    const result = await action(args);
    if (!isOkResult(result)) return result;
    try {
      const { session, sessionToken } = await authenticate.admin(args.request);
      const shop = await db.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });
      if (!shop) return result;
      const form = await copy.formData().catch(() => null);
      await recordChange(shop.id, {
        page,
        summary: result.message || "Saved",
        details: form ? describeForm(form) : null,
        staffId: sessionToken?.sub ? String(sessionToken.sub) : null,
      });
    } catch (error) {
      console.error(`Could not record a change on ${page}`, error);
    }
    return result;
  };
}

export async function recordChange(
  shopId: string,
  entry: { page: string; summary: string; details?: string | null; staffId?: string | null },
) {
  await db.changeLog.create({
    data: {
      shopId,
      page: entry.page.slice(0, 100),
      summary: entry.summary.slice(0, 200),
      details: entry.details ?? null,
      staffId: entry.staffId ?? null,
    },
  });
  // Now and then, drop entries past the keeping period.
  if (Math.random() < 0.02) {
    await db.changeLog.deleteMany({
      where: { shopId, createdAt: { lt: new Date(Date.now() - CHANGE_LOG_DAYS * 86_400_000) } },
    });
  }
}

export async function listChanges(options: { shopId: string; page?: number; search?: string; area?: string }) {
  const search = options.search?.trim();
  const where = {
    shopId: options.shopId,
    ...(options.area ? { page: options.area } : {}),
    ...(search
      ? {
          OR: [
            { summary: { contains: search, mode: "insensitive" as const } },
            { details: { contains: search, mode: "insensitive" as const } },
            { page: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, areas] = await Promise.all([
    db.changeLog.count({ where }),
    db.changeLog.findMany({
      where: { shopId: options.shopId },
      distinct: ["page"],
      select: { page: true },
      orderBy: { page: "asc" },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const changes = await db.changeLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { changes, total, page: current, pageCount, areas: areas.map((row) => row.page) };
}
