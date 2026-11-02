import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { rulesToCsv } from "../lib/rule-backup";
import { csvResponse, dateStamp } from "../lib/download";

// A CSV backup of every rule the shop has.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const rules = await db.rule.findMany({
    where: { shopId: shop.id },
    orderBy: [{ type: "asc" }, { list: "asc" }, { createdAt: "asc" }],
    select: { type: true, list: true, matchType: true, value: true, comment: true, enabled: true },
  });
  const handle = session.shop.replace(/\.myshopify\.com$/, "");
  return csvResponse(rulesToCsv(rules), `rules-backup-${handle}-${dateStamp()}.csv`);
};
