import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getAnalytics } from "../models/analytics.server";
import { RETENTION_DAYS } from "../services/retention.server";
import {
  ANALYTICS_RANGES,
  parseAnalyticsRange,
  safeTimeZone,
  share,
  type AnalyticsRange,
} from "../lib/analytics";
import { BLOCKER_LABELS } from "../lib/weekly-report";
import { flagEmoji } from "../lib/format";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, EmptyState } from "../components/ui";
import { BarList, DailyChart } from "../components/charts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const range = parseAnalyticsRange(new URL(request.url).searchParams.get("range"));
  const timeZone = safeTimeZone(shop.timezone);
  const analytics = await getAnalytics(shop.id, ANALYTICS_RANGES[range].days, timeZone);
  return { range, timeZone, retentionDays: RETENTION_DAYS, ...analytics };
};

function Stat({ title, value, note }: { title: string; value: number; note?: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statTitle}>{title}</span>
      <span className={styles.statValue}>{value.toLocaleString("en-US")}</span>
      {note && <span className={styles.statLabel}>{note}</span>}
    </div>
  );
}

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const { totals } = data;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How many visitors reached your store, how many were blocked, and where they came from."
      />

      <div className={styles.toolbar}>
        <label htmlFor="analytics-range">Show:</label>
        <select
          id="analytics-range"
          className={styles.select}
          value={data.range}
          onChange={(event) => setSearchParams({ range: event.currentTarget.value as AnalyticsRange })}
          disabled={navigation.state === "loading"}
        >
          {Object.entries(ANALYTICS_RANGES).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className={styles.statLabel}>Days follow your store&apos;s time zone ({data.timeZone}).</span>
      </div>

      {totals.visits === 0 ? (
        <Card>
          <EmptyState
            title="No visits in this period"
            text="Numbers appear here once the storefront embed is on and shoppers visit your store."
          />
        </Card>
      ) : (
        <>
          <div className={styles.statGridWide}>
            <Stat title="Page views" value={totals.visits} />
            <Stat title="Unique visitors" value={totals.visitors} />
            <Stat title="Blocked" value={totals.blocked} note={`${share(totals.blocked, totals.visits)} of page views`} />
            <Stat title="Redirected" value={totals.redirected} note={`${share(totals.redirected, totals.visits)} of page views`} />
            <Stat title="Bot visits" value={totals.bots} note={`${share(totals.bots, totals.visits)} of page views`} />
          </div>

          <Card>
            <CardSection title="Page views per day">
              <DailyChart days={data.days} />
            </CardSection>
          </Card>

          <div className={styles.analyticsPair}>
            <Card>
              <CardSection title="Top countries">
                {data.countries.length === 0 ? (
                  <p className={styles.emptyText}>No location data yet. Add a GeoIP database to see countries.</p>
                ) : (
                  <>
                    <BarList
                      rows={data.countries.map((row) => ({
                        key: row.country,
                        label: `${flagEmoji(row.country)} ${row.name ?? row.country}`,
                        value: row.visits,
                        part: row.blocked,
                        note: row.blocked > 0 ? `(${row.blocked.toLocaleString("en-US")} blocked)` : undefined,
                      }))}
                    />
                    <p className={styles.statLabel} style={{ marginTop: 12 }}>
                      Red is the blocked share of each country&apos;s page views.
                    </p>
                  </>
                )}
              </CardSection>
            </Card>
            <Card>
              <CardSection title="Blocks by filter">
                {data.byBlocker.length === 0 ? (
                  <p className={styles.emptyText}>Nothing was blocked in this period.</p>
                ) : (
                  <BarList
                    rows={data.byBlocker.map((row) => ({
                      key: row.blocker,
                      label: BLOCKER_LABELS[row.blocker],
                      value: row.count,
                    }))}
                  />
                )}
              </CardSection>
            </Card>
          </div>

          <div className={styles.analyticsPair}>
            <Card>
              <CardSection title="Top block reasons">
                {data.reasons.length === 0 ? (
                  <p className={styles.emptyText}>Nothing was blocked in this period.</p>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Reason</th>
                        <th style={{ textAlign: "right" }}>Page views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reasons.map((row) => (
                        <tr key={row.reason}>
                          <td>{row.reason}</td>
                          <td style={{ textAlign: "right" }}>{row.count.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardSection>
            </Card>
            <Card>
              <CardSection title="Most blocked IP addresses">
                {data.blockedIps.length === 0 ? (
                  <p className={styles.emptyText}>Nothing was blocked in this period.</p>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>IP address</th>
                        <th style={{ textAlign: "right" }}>Blocked page views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.blockedIps.map((row) => (
                        <tr key={row.ip}>
                          <td>
                            <Link to={`/app/ip-lookup?ip=${encodeURIComponent(row.ip)}`}>{row.ip}</Link>
                          </td>
                          <td style={{ textAlign: "right" }}>{row.count.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardSection>
            </Card>
          </div>
        </>
      )}

      <Banner>
        <p>
          Visit records are kept for {data.retentionDays} days, so older periods cannot be shown.
          Page views beyond 60 a minute from one IP address are still filtered but not counted here.
          Want an email when blocking suddenly jumps? Turn on blocking alerts under{" "}
          <Link to="/app/backup-reports">Backup &amp; Reports</Link>.
        </p>
      </Banner>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
