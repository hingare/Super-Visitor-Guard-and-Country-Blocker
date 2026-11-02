import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { visitsForExport } from "../models/visits.server";
import { pageTypeLabel, readVisitFilters } from "../lib/visit-filters";
import { toCsvRow } from "../lib/csv";
import { csvResponse, dateStamp } from "../lib/download";

// CSV of the visitor records that match the filters on Shop Visitor Logs.

const HEADER = [
  "Date (UTC)",
  "Visitor",
  "Alias",
  "IP",
  "Country code",
  "Country",
  "Region",
  "City",
  "ISP / Organization",
  "ASN",
  "VPN / Hosting",
  "Proxy",
  "Tor",
  "Bot",
  "Verified bot",
  "Page type",
  "URL",
  "Referrer",
  "User agent",
  "Result",
  "Blocker",
  "Reason",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const filters = readVisitFilters(new URL(request.url).searchParams);

  let body = toCsvRow(HEADER);
  for await (const batch of visitsForExport(shop.id, filters)) {
    for (const visit of batch) {
      body += toCsvRow([
        visit.createdAt,
        visit.visitor?.code,
        visit.visitor?.alias,
        visit.ip,
        visit.country,
        visit.countryName,
        visit.region,
        visit.city,
        visit.organization ?? visit.isp,
        visit.asn,
        visit.isVpn ? "yes" : "no",
        visit.isProxy ? "yes" : "no",
        visit.isTor ? "yes" : "no",
        visit.isBot ? "yes" : "no",
        visit.isLowRiskBot ? "yes" : "no",
        pageTypeLabel(visit.pageType),
        visit.url,
        visit.referrer,
        visit.userAgent,
        visit.verdict,
        visit.blocker,
        visit.reason,
      ]);
    }
  }

  const handle = session.shop.replace(/\.myshopify\.com$/, "");
  return csvResponse(body, `visitor-records-${handle}-${dateStamp()}.csv`);
};
