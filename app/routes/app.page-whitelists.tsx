import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { addRules, deleteRules, listRules } from "../models/rules.server";
import type { ActionResult } from "../models/blocker.server";
import { parsePagePath } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, EmptyState } from "../components/ui";
import { Pagination, SearchBox, useResultToast } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  return listRules({
    shopId: shop.id,
    type: "PAGE_WHITELIST",
    search: url.searchParams.get("q") ?? undefined,
    page: Number(url.searchParams.get("page")) || 1,
  });
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "add": {
      const matchType = form.get("matchType") === "PARTIAL" ? "PARTIAL" : "EXACT";
      const raw = String(form.get("value") ?? "").trim();
      let value: string;
      if (matchType === "EXACT") {
        const parsed = parsePagePath(raw);
        if (!parsed.ok) return parsed;
        value = parsed.path;
      } else {
        if (raw === "" || raw.length > 500) {
          return { ok: false, error: "Enter the text the page URL should contain." };
        }
        value = raw.toLowerCase();
      }
      const comment = String(form.get("comment") ?? "").trim().slice(0, 200) || null;
      const added = await addRules(shop.id, "PAGE_WHITELIST", "WHITELIST", [
        { value, matchType, comment },
      ]);
      return added
        ? { ok: true, message: "Page white list rule added" }
        : { ok: false, error: "That rule already exists." };
    }
    case "delete": {
      await deleteRules(shop.id, { id: String(form.get("id")), type: "PAGE_WHITELIST" });
      return { ok: true, message: "Rule deleted" };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
};

export default function PageWhiteLists() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(fetcher, (message) => {
    if (message === "Page white list rule added") {
      formRef.current?.reset();
      setAdding(false);
    }
  });

  return (
    <>
      <PageHeader
        title="Page White Lists"
        subtitle="Keep chosen storefront pages open to everyone. Pages on this list are never filtered, whatever your other rules say."
      />

      <Banner>
        <p>
          <strong>Exact Match</strong> applies to one page only, such as
          /pages/contact. <strong>Partial Match</strong> applies to every page
          whose address contains your text, such as /blogs/ for all blog posts.
        </p>
      </Banner>

      <Card>
        <CardSection>
          <div className={styles.toolbar}>
            <SearchBox placeholder="Search page white list rules" />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setAdding((open) => !open)}
            >
              Add page white list rule
            </button>
          </div>

          {adding && (
            <fetcher.Form method="post" ref={formRef} className={styles.panel}>
              <input type="hidden" name="intent" value="add" />
              <div className={styles.formRow}>
                <div>
                  <label className={styles.fieldLabel} htmlFor="match-type">
                    Match type
                  </label>
                  <select id="match-type" name="matchType" className={styles.select}>
                    <option value="EXACT">Exact Match</option>
                    <option value="PARTIAL">Partial Match</option>
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="page-value">
                    Page path, URL or text
                  </label>
                  <input
                    id="page-value"
                    name="value"
                    className={styles.input}
                    placeholder="/pages/contact"
                    required
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="page-comment">
                    Note (optional)
                  </label>
                  <input id="page-comment" name="comment" className={styles.input} />
                </div>
                <button type="submit" className={styles.primaryButton}>
                  Add
                </button>
              </div>
            </fetcher.Form>
          )}
        </CardSection>

        {data.total === 0 ? (
          <EmptyState
            title="No page white list rule found"
            text="Try changing the filters or create a new one."
          />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Created At</th>
                  <th>Page</th>
                  <th>Match</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{new Date(rule.createdAt).toLocaleString()}</td>
                    <td>
                      {rule.value}
                      {rule.comment && <div className={styles.muted}>{rule.comment}</div>}
                    </td>
                    <td>{rule.matchType === "EXACT" ? "Exact Match" : "Partial Match"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Delete ${rule.value}`}
                        onClick={() =>
                          fetcher.submit({ intent: "delete", id: rule.id }, { method: "POST" })
                        }
                      >
                        <s-icon type="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
