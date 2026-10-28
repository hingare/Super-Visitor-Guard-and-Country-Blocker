import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { APP_NAME } from "../lib/app-info";
import {
  MAX_SELECTED_PAGES,
  accessLinkUrl,
  isChecked,
  parsePagePath,
  readSelectedPages,
} from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import {
  Banner,
  Card,
  CardSection,
  EmptyState,
  StatusToggle,
} from "../components/ui";

const OWNER_LINK_LABEL = "owner";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  // The owner's own Admin Access link is a separate, unlisted token: the
  // shop's public key is visible on the storefront and must not grant access.
  const ownerLink =
    (await db.accessLink.findFirst({
      where: { shopId: shop.id, kind: "ADMIN_INVITE", label: OWNER_LINK_LABEL },
    })) ??
    (await db.accessLink.create({
      data: { shopId: shop.id, kind: "ADMIN_INVITE", label: OWNER_LINK_LABEL },
    }));
  const links = await db.accessLink.findMany({
    where: { shopId: shop.id, NOT: { id: ownerLink.id } },
    orderBy: { createdAt: "desc" },
  });

  const withUrl = (kind: "ADMIN_INVITE" | "AUTO_WHITELIST") =>
    links
      .filter((link) => link.kind === kind)
      .map((link) => ({
        id: link.id,
        uses: link.uses,
        createdAt: link.createdAt,
        url: accessLinkUrl(session.shop, kind, link.token),
      }));

  return {
    filtersEnabled: shop.settings.filtersEnabled,
    preloadMask: shop.settings.preloadMask,
    selectedPages: readSelectedPages(shop.settings.selectedPages),
    adminAccessUrl: accessLinkUrl(session.shop, "ADMIN_INVITE", ownerLink.token),
    inviteLinks: withUrl("ADMIN_INVITE"),
    whitelistLinks: withUrl("AUTO_WHITELIST"),
  };
};

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  switch (intent) {
    case "filters": {
      const filtersEnabled = isChecked(form.get("enabled"));
      await db.settings.update({
        where: { shopId: shop.id },
        data: { filtersEnabled },
      });
      return {
        ok: true,
        message: filtersEnabled ? "All filters enabled" : "All filters disabled",
      };
    }
    case "preloadMask": {
      const preloadMask = isChecked(form.get("enabled"));
      await db.settings.update({
        where: { shopId: shop.id },
        data: { preloadMask },
      });
      return {
        ok: true,
        message: preloadMask ? "Preload Mask enabled" : "Preload Mask disabled",
      };
    }
    case "addPage": {
      const parsed = parsePagePath(String(form.get("path") ?? ""));
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const pages = readSelectedPages(shop.settings.selectedPages);
      if (pages.includes(parsed.path)) {
        return { ok: false, error: "That page is already selected." };
      }
      if (pages.length >= MAX_SELECTED_PAGES) {
        return { ok: false, error: `You can select up to ${MAX_SELECTED_PAGES} pages.` };
      }
      await db.settings.update({
        where: { shopId: shop.id },
        data: { selectedPages: [...pages, parsed.path] },
      });
      return { ok: true, message: "Page added" };
    }
    case "removePage": {
      const path = String(form.get("path") ?? "");
      const pages = readSelectedPages(shop.settings.selectedPages);
      await db.settings.update({
        where: { shopId: shop.id },
        data: { selectedPages: pages.filter((page) => page !== path) },
      });
      return { ok: true, message: "Page removed" };
    }
    case "createLink": {
      const kind = form.get("kind") === "ADMIN_INVITE" ? "ADMIN_INVITE" : "AUTO_WHITELIST";
      await db.accessLink.create({ data: { shopId: shop.id, kind } });
      return { ok: true, message: "Link created" };
    }
    case "deleteLink": {
      await db.accessLink.deleteMany({
        where: {
          id: String(form.get("id")),
          shopId: shop.id,
          NOT: { label: OWNER_LINK_LABEL },
        },
      });
      return { ok: true, message: "Link deleted" };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
};

function LinkTable({
  links,
  onDelete,
}: {
  links: { id: string; url: string; uses: number }[];
  onDelete: (id: string) => void;
}) {
  const shopify = useAppBridge();
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Link</th>
          <th>Used</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {links.map((link) => (
          <tr key={link.id}>
            <td style={{ wordBreak: "break-all" }}>{link.url}</td>
            <td>{link.uses}</td>
            <td>
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={styles.outlineButton}
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link.url);
                    shopify.toast.show("Link copied");
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className={styles.outlineButton}
                  aria-label="Delete link"
                  onClick={() => onDelete(link.id)}
                >
                  <s-icon type="delete" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GeneralSettings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const addPageForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.message === "Page added") addPageForm.current?.reset();
    } else {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const submit = (values: Record<string, string>) =>
    fetcher.submit(values, { method: "POST" });
  const toggle = (intent: string) => (next: boolean) =>
    submit(next ? { intent, enabled: "on" } : { intent });

  return (
    <>
      <PageHeader title="Settings" />

      <Card>
        <CardSection title="Enable/Disable All Filters">
          <StatusToggle
            name="filtersEnabled"
            enabled={data.filtersEnabled}
            onToggle={toggle("filters")}
            label={`All ${APP_NAME} filters are currently ${
              data.filtersEnabled ? "Enabled" : "Disabled"
            }. Use the switch to change this.`}
          />
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Admin Access Mode">
          <p>
            Admin Access whitelists the device you open the link on, so your
            own visits are never filtered. Do this once on each device you
            use.
          </p>
          <a
            className={styles.outlineButton}
            href={data.adminAccessUrl}
            target="_blank"
            rel="noreferrer"
          >
            Enable Admin Access on this device
          </a>
        </CardSection>
        <CardSection>
          <Banner>
            <p>
              Create an invitation link to give colleagues or partners the
              same access. Anyone who opens it bypasses your visitor filters
              on that device.
            </p>
          </Banner>
          <div style={{ marginTop: 16 }}>
            {data.inviteLinks.length > 0 && (
              <LinkTable
                links={data.inviteLinks}
                onDelete={(id) => submit({ intent: "deleteLink", id })}
              />
            )}
            <button
              type="button"
              className={styles.outlineButton}
              style={{ marginTop: 12 }}
              onClick={() => submit({ intent: "createLink", kind: "ADMIN_INVITE" })}
            >
              Create Invitation Link
            </button>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Preload Mask">
          <p>
            Choose whether visitors see your store while {APP_NAME} decides
            whether to block them. The check usually takes 0.5 to 2 seconds,
            longer on slow connections.
          </p>
        </CardSection>
        <CardSection>
          <p>
            With the mask on, nobody sees content before the check finishes,
            which gives the strongest protection but briefly hides the page
            from regular visitors too.
          </p>
          <StatusToggle
            name="preloadMask"
            enabled={data.preloadMask}
            onToggle={toggle("preloadMask")}
            label={
              data.preloadMask
                ? "Preload Mask enabled. Content stays hidden until the check finishes."
                : "Preload Mask disabled. Visitors can briefly see your content before any blocking."
            }
          />
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Selective Page Filtering">
          <p>
            Apply your filters only to chosen pages of your store, or leave
            this empty to filter every page.
          </p>
        </CardSection>
        <CardSection>
          {data.selectedPages.length === 0 ? (
            <Banner>
              <p>
                <strong>No page selected</strong>
              </p>
              <p>Filters currently apply to all pages of your store.</p>
            </Banner>
          ) : (
            <table className={styles.table}>
              <tbody>
                {data.selectedPages.map((page) => (
                  <tr key={page}>
                    <td>{page}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={styles.outlineButton}
                        aria-label={`Remove ${page}`}
                        onClick={() => submit({ intent: "removePage", path: page })}
                      >
                        <s-icon type="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <fetcher.Form
            method="post"
            ref={addPageForm}
            className={styles.toolbar}
            style={{ marginTop: 16 }}
          >
            <input type="hidden" name="intent" value="addPage" />
            <s-text-field
              name="path"
              label="Page path or URL"
              labelAccessibilityVisibility="exclusive"
              placeholder="/products/my-product"
            />
            <button type="submit" className={styles.primaryButton}>
              Add Page
            </button>
          </fetcher.Form>
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Auto-Whitelist Link">
          <p>
            Customers don&apos;t need to know their IP address to get
            whitelisted. Share a link with them: opening it adds their IP to
            your IP whitelist and takes them to your home page.
          </p>
        </CardSection>
        <CardSection>
          {data.whitelistLinks.length === 0 ? (
            <EmptyState
              title="No Auto-Whitelist link found."
              text="Click Create Link to make your first auto-whitelist link."
            />
          ) : (
            <LinkTable
              links={data.whitelistLinks}
              onDelete={(id) => submit({ intent: "deleteLink", id })}
            />
          )}
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => submit({ intent: "createLink", kind: "AUTO_WHITELIST" })}
            >
              Create Link
            </button>
          </div>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
