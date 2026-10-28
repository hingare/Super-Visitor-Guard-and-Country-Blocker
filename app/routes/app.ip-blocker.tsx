import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { addRules, deleteRules, listRules, updateRule } from "../models/rules.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { parseBulkIps, parseIpRule } from "../lib/ip";
import { isChecked } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, EmptyState, StatusToggle } from "../components/ui";
import { HandlingCard, Pagination, SearchBox, useResultToast } from "../components/blockers";

const MAX_BULK = 5000;

function readList(value: string | null) {
  return value === "whitelist" ? "WHITELIST" : "BLACKLIST";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  const list = readList(url.searchParams.get("list"));
  const [rules, handling] = await Promise.all([
    listRules({
      shopId: shop.id,
      type: ["IP", "IP_RANGE"],
      list,
      search: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page")) || 1,
    }),
    getBlockerConfig(shop.id, "IP"),
  ]);
  return {
    list,
    ...rules,
    deleteOrders: shop.settings.deleteOrdersFromBlockedIps,
    handling,
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const list = form.get("list") === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
  const comment = String(form.get("comment") ?? "").trim().slice(0, 200) || null;

  switch (form.get("intent")) {
    case "add": {
      const parsed = parseIpRule(String(form.get("value") ?? ""));
      if (!parsed.ok) return parsed;
      const added = await addRules(shop.id, parsed.isRange ? "IP_RANGE" : "IP", list, [
        { value: parsed.value, comment },
      ]);
      return added
        ? { ok: true, message: "IP filter added" }
        : { ok: false, error: "That IP filter already exists." };
    }
    case "bulk": {
      const { values, invalid } = parseBulkIps(String(form.get("values") ?? ""));
      if (values.length === 0) return { ok: false, error: "No valid IP address found." };
      if (values.length > MAX_BULK) {
        return { ok: false, error: `Upload up to ${MAX_BULK} addresses at a time.` };
      }
      const single = values.filter((value) => !parseIpRuleIsRange(value));
      const ranges = values.filter(parseIpRuleIsRange);
      const added =
        (await addRules(shop.id, "IP", list, single.map((value) => ({ value, comment })))) +
        (await addRules(shop.id, "IP_RANGE", list, ranges.map((value) => ({ value, comment }))));
      const skipped = invalid.length ? `, ${invalid.length} invalid skipped` : "";
      return { ok: true, message: `${added} IP filters added${skipped}` };
    }
    case "edit": {
      const parsed = parseIpRule(String(form.get("value") ?? ""));
      if (!parsed.ok) return parsed;
      const id = String(form.get("id"));
      const clash = await db.rule.findFirst({
        where: {
          shopId: shop.id,
          list,
          value: parsed.value,
          type: parsed.isRange ? "IP_RANGE" : "IP",
          NOT: { id },
        },
      });
      if (clash) return { ok: false, error: "That IP filter already exists." };
      await updateRule(shop.id, id, {
        type: parsed.isRange ? "IP_RANGE" : "IP",
        value: parsed.value,
        comment,
      });
      return { ok: true, message: "IP filter updated" };
    }
    case "delete": {
      await deleteRules(shop.id, { id: String(form.get("id")), type: { in: ["IP", "IP_RANGE"] } });
      return { ok: true, message: "IP filter deleted" };
    }
    case "deleteOrders": {
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({
        where: { shopId: shop.id },
        data: { deleteOrdersFromBlockedIps: enabled },
      });
      return { ok: true, message: enabled ? "Setting enabled" : "Setting disabled" };
    }
    case "handling":
      return saveHandling(shop.id, "IP", form);
    default:
      return { ok: false, error: "Unknown action." };
  }
};

function parseIpRuleIsRange(value: string) {
  const parsed = parseIpRule(value);
  return parsed.ok && parsed.isRange;
}

type CreateMode = "single" | "range" | "bulk" | null;

function CreateIpFilter({ list }: { list: string }) {
  const fetcher = useFetcher<typeof action>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(fetcher, () => {
    formRef.current?.reset();
    setMode(null);
  });

  const choose = (next: CreateMode) => {
    setMode(next);
    setMenuOpen(false);
  };

  return (
    <>
      <div className={styles.menu}>
        <button
          type="button"
          className={styles.primaryButton}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Create IP Filter <s-icon type="chevron-down" />
        </button>
        {menuOpen && (
          <ul className={styles.menuList}>
            <li>
              <button type="button" className={styles.pickerItem} onClick={() => choose("single")}>
                Add Single IP Address
              </button>
            </li>
            <li>
              <button type="button" className={styles.pickerItem} onClick={() => choose("range")}>
                Add Single IP Range
              </button>
            </li>
            <li>
              <button type="button" className={styles.pickerItem} onClick={() => choose("bulk")}>
                Bulk Upload
              </button>
            </li>
          </ul>
        )}
      </div>

      {mode && (
        <fetcher.Form method="post" ref={formRef} className={styles.panel} style={{ flexBasis: "100%" }}>
          <input type="hidden" name="intent" value={mode === "bulk" ? "bulk" : "add"} />
          <input type="hidden" name="list" value={list} />
          {mode === "bulk" ? (
            <>
              <label className={styles.fieldLabel} htmlFor="bulk-values">
                IP addresses or ranges, one per line
              </label>
              <textarea
                id="bulk-values"
                name="values"
                className={styles.textarea}
                placeholder={"203.0.113.7\n198.51.100.0/24\n192.0.2.10-192.0.2.50"}
                required
              />
              <label className={styles.fieldLabel} htmlFor="bulk-file">
                Or load a .txt or .csv file
              </label>
              <input
                id="bulk-file"
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  const area = formRef.current?.elements.namedItem("values");
                  if (file && area instanceof HTMLTextAreaElement) area.value = await file.text();
                }}
              />
            </>
          ) : (
            <>
              <label className={styles.fieldLabel} htmlFor="ip-value">
                {mode === "range" ? "IP range" : "IP address"}
              </label>
              <input
                id="ip-value"
                name="value"
                className={styles.input}
                placeholder={
                  mode === "range" ? "203.0.113.0/24 or 203.0.113.10-203.0.113.50" : "203.0.113.7"
                }
                required
              />
            </>
          )}
          <label className={styles.fieldLabel} htmlFor="ip-comment">
            Note (optional)
          </label>
          <input id="ip-comment" name="comment" className={styles.input} maxLength={200} />
          <div className={styles.toolbar} style={{ marginTop: 12 }}>
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
            <button type="button" className={styles.outlineButton} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </fetcher.Form>
      )}
    </>
  );
}

function IpRow({
  rule,
  list,
}: {
  rule: { id: string; value: string; comment: string | null; createdAt: string | Date; hits: number };
  list: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = useState(false);
  useResultToast(fetcher, () => setEditing(false));

  if (editing) {
    return (
      <tr>
        <td colSpan={3}>
          <fetcher.Form method="post" className={styles.formRow}>
            <input type="hidden" name="intent" value="edit" />
            <input type="hidden" name="id" value={rule.id} />
            <input type="hidden" name="list" value={list} />
            <input
              name="value"
              className={styles.input}
              defaultValue={rule.value}
              aria-label="IP address or range"
              required
            />
            <input
              name="comment"
              className={styles.input}
              defaultValue={rule.comment ?? ""}
              aria-label="Note"
              placeholder="Note"
            />
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
            <button type="button" className={styles.outlineButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </fetcher.Form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{new Date(rule.createdAt).toLocaleString()}</td>
      <td>
        {rule.value}
        {rule.comment && <div className={styles.muted}>{rule.comment}</div>}
      </td>
      <td>
        <div className={styles.toolbar} style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Edit ${rule.value}`}
            onClick={() => setEditing(true)}
          >
            <s-icon type="edit" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Delete ${rule.value}`}
            onClick={() => fetcher.submit({ intent: "delete", id: rule.id }, { method: "POST" })}
          >
            <s-icon type="delete" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function IpBlocker() {
  const data = useLoaderData<typeof loader>();
  const settingsFetcher = useFetcher<typeof action>();
  useResultToast(settingsFetcher);
  const isWhitelist = data.list === "WHITELIST";

  return (
    <>
      <PageHeader
        title="IP Blocker"
        subtitle="Block individual visitors by IP address or IP range."
      />

      <Banner>
        <p>
          The IP Blocker comes first: its blacklist and whitelist are checked
          before every other blocker. An IP on the whitelist can visit even if
          its country is blocked.
        </p>
      </Banner>

      <Card>
        <nav className={styles.tabs} aria-label="IP lists">
          <Link
            to="?list=blacklist"
            className={isWhitelist ? styles.tab : `${styles.tab} ${styles.tabActive}`}
          >
            Blacklist
          </Link>
          <Link
            to="?list=whitelist"
            className={isWhitelist ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          >
            Whitelist
          </Link>
        </nav>
        <CardSection>
          <div className={styles.twoColumn}>
            <div className={styles.columnHelp}>
              <h2>{isWhitelist ? "IP Allow list" : "IP Block list"}</h2>
              {isWhitelist ? (
                <p>Addresses on this list are never blocked by any filter.</p>
              ) : (
                <>
                  <p>
                    Find a visitor&apos;s IP address on the Shop Visitor Logs
                    page, then add it here to block it.
                  </p>
                  <p>
                    Getting fake cash-on-delivery orders from bots? Block the
                    IP addresses they come from.
                  </p>
                </>
              )}
            </div>
            <div>
              <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
                <SearchBox placeholder="Search ip address" />
                <CreateIpFilter key={data.list} list={data.list} />
              </div>
              {data.total === 0 ? (
                <EmptyState
                  title="No IP filter found"
                  text="Try changing the filters or create a new one."
                />
              ) : (
                <>
                  <table className={styles.table} style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>Created At</th>
                        <th>IP Address</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.rules.map((rule) => (
                        <IpRow key={rule.id} rule={rule} list={data.list} />
                      ))}
                    </tbody>
                  </table>
                  <Pagination total={data.total} page={data.page} pageCount={data.pageCount} />
                </>
              )}
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection title="IP Blocker Settings">
          <StatusToggle
            name="deleteOrders"
            enabled={data.deleteOrders}
            onToggle={(next) =>
              settingsFetcher.submit(
                next ? { intent: "deleteOrders", enabled: "on" } : { intent: "deleteOrders" },
                { method: "POST" },
              )
            }
            label={`Delete the related order (NOT applicable to orders paid with a credit card). (${
              data.deleteOrders ? "Enabled" : "Disabled"
            })`}
          />
          <div style={{ marginTop: 12 }}>
            <Banner tone="warning">
              <p>
                Recommended for cash-on-delivery stores: new orders placed
                from a blocked IP are cancelled and deleted. Orders paid by
                card are never deleted.
              </p>
            </Banner>
          </div>
        </CardSection>
      </Card>

      <HandlingCard blockerName="IP blocker" config={data.handling} />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
