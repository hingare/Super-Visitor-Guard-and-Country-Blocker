import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  getDashboardCounts,
  getRecentVisits,
  getShopWithSettings,
} from "../models/shop.server";
import {
  REPORT_RANGES,
  parseReportRange,
  rangeStart,
  type ReportRange,
} from "../lib/report-range";
import { getEmbedStatus } from "../models/theme.server";
import { APP_NAME } from "../lib/app-info";
import { flagEmoji, timeAgo } from "../lib/format";
import { FeatureCard, frameStyles as styles } from "../components/AppFrame";
import {
  Banner,
  Card,
  ContactUsButton,
  REPORTS_NOTICE,
} from "../components/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const range = parseReportRange(new URL(request.url).searchParams.get("range"));

  const [counts, recentVisits, embed] = await Promise.all([
    getDashboardCounts(shop.id, rangeStart(range)),
    getRecentVisits(shop.id, 5),
    getEmbedStatus(admin),
  ]);

  return {
    ownerName: shop.ownerName,
    range,
    counts,
    recentVisits,
    embedStatus: embed.status,
  };
};

function StatCard({
  title,
  value,
  label,
}: {
  title: string;
  value: number;
  label: string;
}) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statTitle}>{title}</span>
      <span className={styles.statValue}>{value.toLocaleString()}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const reloading = revalidator.state === "loading" || navigation.state === "loading";

  return (
    <>
      <section className={`${styles.card} ${styles.cardSection}`}>
        <h1 className={styles.pageTitle} style={{ fontSize: 24 }}>
          Hi{data.ownerName ? `, ${data.ownerName}` : ""} 👋
        </h1>
        <p>Welcome to {APP_NAME}.</p>
      </section>

      {data.embedStatus !== "enabled" && (
        <Banner tone="warning">
          <p>
            <strong>The storefront embed is off.</strong> Blocking, visitor logs
            and content protection only run after you switch it on in your
            theme.
          </p>
          <Link className={styles.primaryButton} to="/app/extension">
            Activate now
          </Link>
        </Banner>
      )}

      <div className={styles.toolbar}>
        <label htmlFor="report-range">Report Range:</label>
        <select
          id="report-range"
          className={styles.select}
          value={data.range}
          onChange={(event) =>
            setSearchParams({ range: event.currentTarget.value as ReportRange })
          }
        >
          {Object.entries(REPORT_RANGES).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.outlineButton}
          onClick={() => revalidator.revalidate()}
          disabled={reloading}
        >
          <s-icon type="refresh" /> Reload
        </button>
      </div>

      <div className={styles.statGrid}>
        <StatCard
          title="Customer Block List"
          value={data.counts.blockList}
          label="Page views blocked"
        />
        <StatCard
          title="Fraud Protect"
          value={data.counts.fraudCancelled}
          label="Order cancelled"
        />
        <StatCard
          title="ASN Blocker"
          value={data.counts.ispAsn}
          label="Page views blocked"
        />
        <StatCard title="IP Blocker" value={data.counts.ip} label="Page views blocked" />
        <StatCard
          title="Country Blocker"
          value={data.counts.country}
          label="Page views blocked"
        />
        <StatCard
          title="Bot/VPN/Proxy Blocker"
          value={data.counts.botVpn}
          label="Page views blocked"
        />
      </div>

      <Banner>
        <p>{REPORTS_NOTICE}</p>
        <ContactUsButton />
      </Banner>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardHeaderTitle}>
            <s-icon type="clipboard-checklist" /> Recent visit records
          </h2>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => revalidator.revalidate()}
            >
              <s-icon type="refresh" /> Refresh
            </button>
            <Link className={styles.primaryButton} to="/app/visitor-logs">
              <s-icon type="arrow-right-circle" /> View all
            </Link>
          </div>
        </div>
        <div className={styles.cardSection}>
          {data.recentVisits.length === 0 ? (
            <p className={styles.emptyText}>
              No visits recorded yet. They appear here once the storefront embed
              is on.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Country/Region/City</th>
                  <th>Time</th>
                  <th>IP</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <div className={styles.location}>
                        <span>
                          {visit.city ?? "Unknown"}
                          {visit.region && (
                            <>
                              , <span className={styles.locationRegion}>{visit.region}</span>
                            </>
                          )}
                        </span>
                        <span>
                          {flagEmoji(visit.country)}{" "}
                          {visit.countryName ?? visit.country ?? ""}
                        </span>
                      </div>
                    </td>
                    <td>{timeAgo(visit.createdAt)}</td>
                    <td>{visit.ip}</td>
                    <td>
                      {visit.verdict === "ALLOWED" ? (
                        <span className={styles.pass}>
                          <s-icon type="check-circle-filled" tone="success" /> Access
                          Pass
                        </span>
                      ) : (
                        <span className={styles.blocked}>
                          <s-icon type="x-circle" tone="critical" />{" "}
                          {visit.verdict === "BLOCKED" ? "Blocked" : "Redirected"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <FeatureCard
        title="Admin Access"
        description="Whitelist your own device so you can always browse your store, whatever filters are on. You only need to do this once per device."
        actionLabel="Manage Admin Access"
        href="/app/settings"
        icon="person-lock"
      />
      <FeatureCard
        title="Block Lists"
        description="Keep unwanted customers from visiting your store."
        actionLabel="Setup Block lists"
        href="/app/block-lists"
        icon="shield-check-mark"
      />
      <FeatureCard
        title="Fraud Protect"
        description="Cancel, refund and restock orders that Shopify marks as risky, automatically."
        actionLabel="Protect Now"
        href="/app/fraud-protect"
        icon="shield-person"
      />
      <FeatureCard
        title="Auto-cancel filters"
        description="Cancel orders from buyers on your cancel list, then refund and restock them automatically."
        actionLabel="Go To Settings"
        href="/app/auto-cancel-filters"
        icon="order"
      />
      <FeatureCard
        title="Country Blocker"
        description="Choose blacklist or whitelist mode and the countries it applies to."
        actionLabel="Setup countries list"
        href="/app/country-blocker"
        icon="globe-lines"
      />
      <FeatureCard
        title="IP Blocker"
        description="Block individual visitors by their IP address."
        actionLabel="Go To Settings"
        href="/app/ip-blocker"
        icon="code"
      />
      <FeatureCard
        title="Geolocation Redirects"
        description="Send visitors to the right local store based on where they are."
        actionLabel="Redirect Now"
        href="/app/geolocation-redirects"
        icon="domain-redirect"
      />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
