import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { listChanges } from "../models/change-log.server";
import { CHANGE_LOG_DAYS } from "../lib/change-log";
import { timeAgo } from "../lib/format";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Card, CardSection, EmptyState } from "../components/ui";
import { Pagination, ReloadButton, SearchBox } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  const history = await listChanges({
    shopId: shop.id,
    page: Number(url.searchParams.get("page")) || 1,
    search: url.searchParams.get("q") ?? undefined,
    area: url.searchParams.get("area") || undefined,
  });
  return { ...history, keepDays: CHANGE_LOG_DAYS };
};

function AreaFilter({ areas }: { areas: string[] }) {
  const [params, setParams] = useSearchParams();
  return (
    <select
      className={styles.select}
      aria-label="Page"
      value={params.get("area") ?? ""}
      onChange={(event) => {
        const next = new URLSearchParams(params);
        if (event.target.value) next.set("area", event.target.value);
        else next.delete("area");
        next.delete("page");
        setParams(next, { preventScrollReset: true });
      }}
    >
      <option value="">All pages</option>
      {areas.map((area) => (
        <option key={area} value={area}>
          {area}
        </option>
      ))}
    </select>
  );
}

export default function ChangeHistory() {
  const data = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Change History"
        subtitle="Every change made to rules and settings in the app, newest first."
      />

      <Card>
        <CardSection>
          <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
            <SearchBox placeholder="Search changes, such as an IP address or country" />
            <AreaFilter areas={data.areas} />
            <ReloadButton />
          </div>
        </CardSection>
        {data.changes.length === 0 ? (
          <EmptyState
            title="No changes recorded yet"
            text="Changes you make to rules and settings from now on are listed here."
          />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Page</th>
                  <th>Change</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.changes.map((change) => (
                  <tr key={change.id}>
                    <td title={new Date(change.createdAt).toLocaleString()} style={{ whiteSpace: "nowrap" }}>
                      {timeAgo(change.createdAt)}
                    </td>
                    <td>{change.page}</td>
                    <td style={{ wordBreak: "break-word" }}>
                      <strong>{change.summary}</strong>
                      {change.details && (
                        <div className={styles.muted} style={{ fontSize: 13 }}>
                          {change.details}
                        </div>
                      )}
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: "nowrap" }}>
                      {change.staffId ? `Staff #${change.staffId}` : "App"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination total={data.total} page={data.page} pageCount={data.pageCount} />
          </>
        )}
        <CardSection>
          <p className={styles.helpText} style={{ margin: 0 }}>
            Changes are kept for {data.keepDays} days. &quot;Staff #&quot; is the
            Shopify staff account number of the person who made the change.
          </p>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
