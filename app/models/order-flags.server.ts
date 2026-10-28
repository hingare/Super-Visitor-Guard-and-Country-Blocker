import type { OrderSource, Prisma } from "@prisma/client";
import db from "../db.server";
import { PAGE_SIZE } from "./rules.server";

// The order log shown under "Filtered Orders".
export async function listOrderFlags({
  shopId,
  source,
  search,
  hideLowRisk,
  page,
}: {
  shopId: string;
  source: OrderSource | OrderSource[];
  search?: string;
  hideLowRisk?: boolean;
  page?: number;
}) {
  const term = search?.trim();
  const where: Prisma.OrderFlagWhereInput = {
    shopId,
    source: Array.isArray(source) ? { in: source } : source,
    ...(hideLowRisk ? { riskLevel: { notIn: ["LOW", "NONE"] } } : {}),
    ...(term
      ? {
          OR: [
            { orderName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const current = Math.max(1, page ?? 1);
  const [total, flags] = await Promise.all([
    db.orderFlag.count({ where }),
    db.orderFlag.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { flags, total, page: current, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
