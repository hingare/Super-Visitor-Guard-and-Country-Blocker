import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { addRules } from "../models/rules.server";
import type { ActionResult } from "../models/blocker.server";
import { lookupGeo, lookupNetwork } from "../services/geoip.server";
import { ipMatches, normalizeIp, parseIp, parseIpRule } from "../lib/ip";
import { flagEmoji, timeAgo } from "../lib/format";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection } from "../components/ui";
import { useResultToast } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const query = (new URL(request.url).searchParams.get("ip") ?? "").trim();
  if (!query) return { query, result: null, error: null };

  const ip = normalizeIp(query);
  if (!ip) return { query, result: null, error: "Enter a valid IPv4 or IPv6 address." };

  const parsed = parseIp(ip)!;
  const [geo, network, ipRules, visits, visitCount] = await Promise.all([
    lookupGeo(ip),
    lookupNetwork(ip),
    db.rule.findMany({
      where: { shopId: shop.id, type: { in: ["IP", "IP_RANGE"] } },
      select: { list: true, value: true },
    }),
    db.visit.findMany({
      where: { shopId: shop.id, ip },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, createdAt: true, url: true, verdict: true, reason: true },
    }),
    db.visit.count({ where: { shopId: shop.id, ip } }),
  ]);

  const matching = ipRules.filter((rule) => {
    const matcher = parseIpRule(rule.value);
    return matcher.ok && ipMatches(parsed, matcher.matcher);
  });

  return {
    query,
    error: null,
    result: {
      ip,
      version: parsed.version,
      geo,
      network,
      whitelistedBy: matching.filter((rule) => rule.list === "WHITELIST").map((rule) => rule.value),
      blacklistedBy: matching.filter((rule) => rule.list === "BLACKLIST").map((rule) => rule.value),
      visits,
      visitCount,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const ip = normalizeIp(String(form.get("ip") ?? ""));
  if (!ip) return { ok: false, error: "Enter a valid IP address." };
  const list = form.get("list") === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
  const added = await addRules(shop.id, "IP", list, [{ value: ip, comment: "Added from IP Address Lookup" }]);
  if (!added) return { ok: false, error: "That IP is already on the list." };
  return { ok: true, message: list === "WHITELIST" ? "Added to IP whitelist" : "Added to IP blacklist" };
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailItem}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export default function IpLookup() {
  const { query, result, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);

  return (
    <>
      <PageHeader
        title="IP Address Lookup"
        subtitle="Look up location, provider and risk details for any IP address."
      />

      <Card>
        <CardSection title="Retrieve IP Address information">
          <Form method="get" className={styles.toolbar}>
            <input
              name="ip"
              className={styles.input}
              type="search"
              placeholder="Search IP Address"
              aria-label="IP address"
              defaultValue={query}
              key={query}
            />
            <button type="submit" className={styles.primaryButton}>
              Search
            </button>
          </Form>
          {error && (
            <p className={styles.helpText} style={{ color: "var(--vg-red)" }}>
              {error}
            </p>
          )}
        </CardSection>

        {result && (
          <>
            <CardSection title={result.ip}>
              <div className={styles.detailGrid}>
                <Detail
                  label="Country"
                  value={
                    result.geo?.country
                      ? `${flagEmoji(result.geo.country)} ${result.geo.countryName ?? result.geo.country}`
                      : "Unknown"
                  }
                />
                <Detail
                  label="State/Province"
                  value={result.geo?.regionName ?? result.geo?.regionCode ?? "Unknown"}
                />
                <Detail label="City" value={result.geo?.city ?? "Unknown"} />
                <Detail label="IP version" value={`IPv${result.version}`} />
                <Detail label="ISP / Organization" value={result.network.organization ?? "Unknown"} />
                <Detail label="ASN" value={result.network.asn ? `AS${result.network.asn}` : "Unknown"} />
                <Detail label="VPN" value={yesNo(result.network.isVpn)} />
                <Detail label="Proxy" value={yesNo(result.network.isProxy)} />
                <Detail label="Tor" value={yesNo(result.network.isTor)} />
                <Detail label="Hosting network" value={yesNo(result.network.isHosting)} />
                <Detail label="Visits to your store" value={String(result.visitCount)} />
              </div>
              {!result.geo && (
                <p className={styles.helpText}>
                  Location data is not available: the GeoIP database is not
                  set up on the server.
                </p>
              )}
            </CardSection>

            <CardSection title="IP Blocker">
              {result.whitelistedBy.length > 0 && (
                <Banner tone="success">
                  <p>On your IP whitelist ({result.whitelistedBy.join(", ")}).</p>
                </Banner>
              )}
              {result.blacklistedBy.length > 0 && (
                <Banner tone="warning">
                  <p>On your IP blacklist ({result.blacklistedBy.join(", ")}).</p>
                </Banner>
              )}
              <div className={styles.toolbar} style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() =>
                    fetcher.submit({ ip: result.ip, list: "BLACKLIST" }, { method: "POST" })
                  }
                >
                  Block this IP
                </button>
                <button
                  type="button"
                  className={styles.outlineButton}
                  onClick={() =>
                    fetcher.submit({ ip: result.ip, list: "WHITELIST" }, { method: "POST" })
                  }
                >
                  Whitelist this IP
                </button>
              </div>
            </CardSection>

            {result.visits.length > 0 && (
              <CardSection title="Latest visits from this IP">
                <table className={styles.table}>
                  <tbody>
                    {result.visits.map((visit) => (
                      <tr key={visit.id}>
                        <td>{timeAgo(visit.createdAt)}</td>
                        <td style={{ wordBreak: "break-all" }}>{visit.url ?? "-"}</td>
                        <td>
                          {visit.verdict === "ALLOWED" ? (
                            <span className={styles.pass}>Access Pass</span>
                          ) : (
                            <span className={styles.blocked} title={visit.reason ?? undefined}>
                              Blocked
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardSection>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
