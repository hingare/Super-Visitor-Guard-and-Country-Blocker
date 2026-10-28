import { useEffect } from "react";
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
import {
  getShopWithSettings,
  getVisitStats,
  startOfTodayUtc,
} from "../models/shop.server";
import { isChecked } from "../lib/settings";
import {
  parseEmbedStatus,
  themeEditorEmbedUrl,
  type EmbedStatus,
} from "../lib/theme-embed";

const MAIN_THEME_SETTINGS_QUERY = `#graphql
  query MainThemeSettings {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"], first: 1) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);

  let embedStatus: EmbedStatus = "unknown";
  let themeName: string | null = null;
  try {
    const response = await admin.graphql(MAIN_THEME_SETTINGS_QUERY);
    const json = await response.json();
    const theme = json.data?.themes?.nodes?.[0];
    themeName = theme?.name ?? null;
    const body = theme?.files?.nodes?.[0]?.body as
      | { content?: string }
      | undefined;
    embedStatus = parseEmbedStatus(body?.content);
  } catch (error) {
    console.error("Could not read theme settings", error);
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [today, week, ruleCount] = await Promise.all([
    getVisitStats(shop.id, startOfTodayUtc()),
    getVisitStats(shop.id, weekAgo),
    db.rule.count({ where: { shopId: shop.id, enabled: true } }),
  ]);

  return {
    enabled: shop.enabled,
    plan: shop.plan,
    embedStatus,
    themeName,
    embedUrl: themeEditorEmbedUrl(
      session.shop,
      // eslint-disable-next-line no-undef
      process.env.SHOPIFY_API_KEY || "",
    ),
    today,
    week,
    ruleCount,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const enabled = isChecked(form.get("enabled"));

  await db.shop.update({
    where: { shopDomain: session.shop },
    data: { enabled },
  });

  return { enabled };
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value.toLocaleString()}</s-heading>
      </s-stack>
    </s-box>
  );
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const enabled = fetcher.data?.enabled ?? data.enabled;

  useEffect(() => {
    if (fetcher.data) {
      shopify.toast.show(
        fetcher.data.enabled ? "Protection turned on" : "Protection turned off",
      );
    }
  }, [fetcher.data, shopify]);

  const toggle = () =>
    fetcher.submit(enabled ? {} : { enabled: "on" }, { method: "POST" });

  return (
    <s-page heading="Dashboard">
      {data.embedStatus !== "enabled" && (
        <s-banner
          tone={data.embedStatus === "disabled" ? "warning" : "info"}
          heading="Turn on the app embed in your theme"
        >
          <s-paragraph>
            Blocking only works on your storefront after the app embed is
            switched on
            {data.themeName ? ` in your live theme (${data.themeName})` : ""}.
            {data.embedStatus === "unknown" &&
              " We could not check its status right now."}
          </s-paragraph>
          <s-button slot="secondary-actions" href={data.embedUrl} target="_blank">
            Open theme editor
          </s-button>
        </s-banner>
      )}

      <s-section heading="Protection status">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={enabled ? "success" : "critical"}>
            {enabled ? "Active" : "Paused"}
          </s-badge>
          <s-text>
            {enabled
              ? "Your blocking rules are applied to every visit."
              : "No visitor is blocked while protection is paused."}
          </s-text>
          <s-button
            onClick={toggle}
            variant={enabled ? "secondary" : "primary"}
            {...(fetcher.state !== "idle" ? { loading: true } : {})}
          >
            {enabled ? "Pause protection" : "Turn on protection"}
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Today">
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <StatCard label="Visits" value={data.today.total} />
          <StatCard label="Allowed" value={data.today.allowed} />
          <StatCard label="Blocked" value={data.today.blocked} />
          <StatCard label="Redirected" value={data.today.redirected} />
        </s-grid>
      </s-section>

      <s-section heading="Last 7 days">
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <StatCard label="Visits" value={data.week.total} />
          <StatCard label="Allowed" value={data.week.allowed} />
          <StatCard label="Blocked" value={data.week.blocked} />
          <StatCard label="Redirected" value={data.week.redirected} />
        </s-grid>
      </s-section>

      <s-section slot="aside" heading="Setup guide">
        <s-unordered-list>
          <s-list-item>
            {data.embedStatus === "enabled" ? "Done: " : ""}Turn on the app
            embed in your theme
          </s-list-item>
          <s-list-item>
            {data.ruleCount > 0 ? "Done: " : ""}Add your first blocking rule in{" "}
            <s-link href="/app/country-blocker">Country Blocker</s-link> or{" "}
            <s-link href="/app/ip-blocker">IP Blocker</s-link>
          </s-list-item>
          <s-list-item>
            Customize the <s-link href="/app/blocked-page">blocked page</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Plan">
        <s-paragraph>
          {data.plan === "PREMIUM" ? "Premium" : "Pay as you go"}.{" "}
          <s-link href="/app/plans">Manage plan</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
