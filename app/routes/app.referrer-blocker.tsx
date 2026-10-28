import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { DEFAULT_REFERRER_REDIRECT } from "../lib/storefront";
import { PageHeader } from "../components/AppFrame";
import { Banner, ContactUsButton, REPORTS_NOTICE } from "../components/ui";
import { HandlingCard } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: "REFERRER", list: "BLACKLIST" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const [list, handling] = await Promise.all([
    loadList(new URL(request.url), shop.id, SPEC),
    getBlockerConfig(shop.id, "REFERRER"),
  ]);
  return { list, handling };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  if (form.get("intent") === "handling") return saveHandling(shop.id, "REFERRER", form);
  return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
};

export default function ReferrerBlocker() {
  const { list, handling } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Referrer Blocker"
        subtitle="Block visits that arrive from chosen referring sites."
      />

      <Banner tone="success">
        <p>{REPORTS_NOTICE}</p>
        <ContactUsButton />
      </Banner>

      <RuleListCard
        data={list}
        help={
          <>
            <h2>Referrer filters list</h2>
            <p>
              The referrer is the site a visitor came from. You can find it
              for each visit on the Shop Visitor Logs page.
            </p>
            <p>
              Exact Match blocks a site and its subdomains (facebook.com also
              covers m.facebook.com). Partial Match blocks any referrer
              address that contains your text.
            </p>
          </>
        }
        searchPlaceholder="Search referrer filters"
        addLabel="Add referrer filter"
        emptyTitle="No referrer filter found"
        valueHeading="Referrer"
        valuePlaceholder="spam-site.com"
        types={[{ value: "REFERRER", label: "Referrer" }]}
        lists={[{ value: "BLACKLIST", label: "Block" }]}
        matchTypes
      />

      <Banner tone="warning">
        <p>
          If you advertise on Google, redirecting visitors to another website
          can make Google Ads flag your store as redirecting traffic. Prefer a
          page on your own store, or a template.
        </p>
      </Banner>

      <HandlingCard
        blockerName="Referrer Blocker"
        config={handling}
        disabledOptions={["CUSTOM_INFO"]}
        defaultRedirect={DEFAULT_REFERRER_REDIRECT}
      />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
