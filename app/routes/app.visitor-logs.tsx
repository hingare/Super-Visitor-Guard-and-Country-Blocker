import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { addRules, deleteRules } from "../models/rules.server";
import type { ActionResult } from "../models/blocker.server";
import { blockedVisitorCodes, listVisits } from "../models/visits.server";
import { pageTypeLabel, readVisitFilters } from "../lib/visit-filters";
import { flagEmoji, timeAgo } from "../lib/format";
import { isVisitorCode } from "../lib/storefront";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, ContactUsButton, EmptyState } from "../components/ui";
import { Pagination, useResultToast } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const filters = readVisitFilters(new URL(request.url).searchParams);
  const result = await listVisits(shop.id, filters);
  const blocked = await blockedVisitorCodes(
    shop.id,
    result.visits.flatMap((visit) => (visit.visitor ? [visit.visitor.code] : [])),
  );
  return {
    ...result,
    filters,
    blockedCodes: [...blocked],
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const code = String(form.get("code") ?? "");

  switch (form.get("intent")) {
    case "alias": {
      const alias = String(form.get("alias") ?? "").trim().slice(0, 60) || null;
      await db.visitor.updateMany({ where: { shopId: shop.id, code }, data: { alias } });
      return { ok: true, message: alias ? "Alias saved" : "Alias removed" };
    }
    case "block": {
      if (!isVisitorCode(code)) return { ok: false, error: "Unknown visitor." };
      await addRules(shop.id, "VISITOR", "BLACKLIST", [{ value: code, comment: "Blocked from visitor logs" }]);
      return { ok: true, message: `${code} blocked` };
    }
    case "unblock": {
      await deleteRules(shop.id, { type: "VISITOR", list: "BLACKLIST", value: code });
      return { ok: true, message: `${code} unblocked` };
    }
    case "clean": {
      const { count } = await db.visit.deleteMany({ where: { shopId: shop.id } });
      return { ok: true, message: `${count} records deleted` };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
};

type Visit = Awaited<ReturnType<typeof loader>>["visits"][number];

function VisitorCell({ visit, isBlocked }: { visit: Visit; isBlocked: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = useState(false);
  useResultToast(fetcher, () => setEditing(false));
  const visitor = visit.visitor;
  const name = visitor?.alias || visitor?.code || "Unknown visitor";
  const details = [
    visitor ? `Id: ${visitor.code}` : null,
    visit.organization ? `Network: ${visit.organization}${visit.asn ? ` (AS${visit.asn})` : ""}` : null,
    visit.isVpn ? "VPN or hosting network" : null,
    visit.isProxy ? "Proxy" : null,
    visit.isTor ? "Tor" : null,
    visit.isBot ? (visit.isLowRiskBot ? "Verified crawler" : "Bot") : null,
    visit.reason ? `Decision: ${visit.reason}` : null,
    visit.userAgent,
  ]
    .filter(Boolean)
    .join("\n");

  if (editing && visitor) {
    return (
      <fetcher.Form method="post" className={styles.toolbar}>
        <input type="hidden" name="intent" value="alias" />
        <input type="hidden" name="code" value={visitor.code} />
        <input
          name="alias"
          className={styles.input}
          defaultValue={visitor.alias ?? ""}
          placeholder="Alias"
          aria-label="Alias"
          maxLength={60}
          style={{ minWidth: 120 }}
        />
        <button type="submit" className={styles.primaryButton}>
          Save
        </button>
        <button type="button" className={styles.outlineButton} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </fetcher.Form>
    );
  }

  return (
    <div className={styles.toolbar}>
      <span className={styles.visitorAvatar} aria-hidden="true">
        {visit.isBot ? <s-icon type="code" size="small" /> : <s-icon type="person" size="small" />}
      </span>
      <span>
        {name}
        {visitor?.alias && <div className={styles.muted}>{visitor.code}</div>}
      </span>
      <span title={details} className={styles.statusIcon} aria-label={details}>
        <s-icon type="info" tone="info" size="small" />
      </span>
      {visitor && (
        <details className={styles.menu}>
          <summary className={styles.iconButton} aria-label="Visitor actions">
            <s-icon type="menu-horizontal" />
          </summary>
          <ul className={styles.menuList}>
            <li>
              <button type="button" className={styles.pickerItem} onClick={() => setEditing(true)}>
                Set alias
              </button>
            </li>
            <li>
              <button
                type="button"
                className={styles.pickerItem}
                onClick={() =>
                  fetcher.submit(
                    { intent: isBlocked ? "unblock" : "block", code: visitor.code },
                    { method: "POST" },
                  )
                }
              >
                {isBlocked ? "Unblock Visitor" : "Block Visitor"}
              </button>
            </li>
            <li>
              <Link className={styles.pickerItem} to={`/app/ip-lookup?ip=${encodeURIComponent(visit.ip)}`}>
                Retrieve IP information
              </Link>
            </li>
          </ul>
        </details>
      )}
    </div>
  );
}

function Checkbox({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  const [params, setParams] = useSearchParams();
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          // "lowrisk" is inverted: the box hides them, the parameter shows them.
          const on = name === "lowrisk" ? !event.target.checked : event.target.checked;
          if (on) next.set(name, "1");
          else next.delete(name);
          next.delete("page");
          setParams(next);
        }}
      />
      {label}
    </label>
  );
}

function SearchControls() {
  const [params, setParams] = useSearchParams();
  const [by, setBy] = useState(params.get("by") === "country" ? "country" : "ip");
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      className={styles.toolbar}
      style={{ flex: 1 }}
      onSubmit={(event) => {
        event.preventDefault();
        const next = new URLSearchParams(params);
        next.set("by", by);
        if (q.trim()) next.set("q", q.trim());
        else next.delete("q");
        next.delete("page");
        setParams(next);
      }}
    >
      <select
        className={styles.select}
        value={by}
        aria-label="Search by"
        onChange={(event) => setBy(event.target.value)}
      >
        <option value="ip">IP</option>
        <option value="country">Country</option>
      </select>
      <input
        className={styles.input}
        type="search"
        placeholder="Search visitor records"
        aria-label="Search visitor records"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
    </form>
  );
}

export default function VisitorLogs() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const [showInfo, setShowInfo] = useState(true);
  useResultToast(fetcher);
  const blocked = new Set(data.blockedCodes);

  return (
    <>
      <PageHeader
        title="Visitor Records"
        subtitle="See who visits your store, where they come from, and act on suspicious visitors."
      />

      {showInfo && (
        <Banner>
          <p>
            Every storefront page view is recorded here once the app embed is
            on. Use the menu next to a visitor to give them an alias, block
            them, or look up their IP address.
          </p>
          <div className={styles.toolbar}>
            <ContactUsButton />
            <button type="button" className={styles.outlineButton} onClick={() => setShowInfo(false)}>
              Dismiss
            </button>
          </div>
        </Banner>
      )}

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardHeaderTitle}>
            <s-icon type="person" /> Store Visitors
          </h2>
        </div>
        <div className={styles.cardSection}>
          <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
            <SearchControls />
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => revalidator.revalidate()}
            >
              <s-icon type="refresh" /> Reload
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => {
                if (window.confirm("Delete all visitor records? This cannot be undone.")) {
                  fetcher.submit({ intent: "clean" }, { method: "POST" });
                }
              }}
            >
              Clean Records
            </button>
          </div>
          <div className={styles.toolbar} style={{ flexWrap: "wrap", gap: 20, marginTop: 12 }}>
            <Checkbox name="blocked" label="Blocked/Redirected Records Only" checked={data.filters.blockedOnly} />
            <Checkbox name="lowrisk" label="Hide Low-risk Bots" checked={data.filters.hideLowRiskBots} />
            <Checkbox name="bots" label="Show Bot Visits Only" checked={data.filters.botsOnly} />
          </div>
        </div>

        {data.total === 0 ? (
          <EmptyState title="No visitor record found" text="Try changing the filters, or wait for new visits." />
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Date</th>
                    <th>Page</th>
                    <th>Location</th>
                    <th>IP</th>
                    <th>Referrer</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.visits.map((visit) => (
                    <tr key={visit.id}>
                      <td>
                        <VisitorCell
                          visit={visit}
                          isBlocked={visit.visitor ? blocked.has(visit.visitor.code) : false}
                        />
                      </td>
                      <td title={new Date(visit.createdAt).toLocaleString()}>{timeAgo(visit.createdAt)}</td>
                      <td>
                        <span className={styles.toolbar}>
                          {pageTypeLabel(visit.pageType)}
                          {visit.url && (
                            <a href={visit.url} target="_blank" rel="noreferrer" aria-label="Open page">
                              <s-icon type="external" size="small" />
                            </a>
                          )}
                        </span>
                      </td>
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
                            {flagEmoji(visit.country)} {visit.countryName ?? visit.country ?? ""}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Link to={`/app/ip-lookup?ip=${encodeURIComponent(visit.ip)}`}>{visit.ip}</Link>
                      </td>
                      <td>
                        {visit.referrer ? (
                          <a href={visit.referrer} target="_blank" rel="noreferrer" title={visit.referrer}>
                            <s-icon type="link" size="small" />
                          </a>
                        ) : (
                          <span className={styles.muted}>-</span>
                        )}
                      </td>
                      <td>
                        {visit.verdict === "ALLOWED" ? (
                          <span className={styles.pass}>
                            <s-icon type="check-circle-filled" tone="success" /> Access Pass
                          </span>
                        ) : (
                          <span className={styles.blocked} title={visit.reason ?? undefined}>
                            <s-icon type="x-circle" tone="critical" />{" "}
                            {visit.verdict === "BLOCKED" ? "Blocked" : "Redirected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} page={data.page} pageCount={data.pageCount} />
          </>
        )}
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
