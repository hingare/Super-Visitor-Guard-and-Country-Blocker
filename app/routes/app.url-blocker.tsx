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
import { PageHeader } from "../components/AppFrame";
import { Banner } from "../components/ui";
import { HandlingCard } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: "URL", list: "BLACKLIST" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const [list, handling] = await Promise.all([
    loadList(new URL(request.url), shop.id, SPEC),
    getBlockerConfig(shop.id, "URL"),
  ]);
  return { list, handling };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  if (form.get("intent") === "handling") return saveHandling(shop.id, "URL", form);
  return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
};

export default function UrlBlocker() {
  const { list, handling } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="URL Blocker"
        subtitle="Block visits whose page address matches a value exactly or contains text you choose."
      />

      <Banner>
        <p>
          Useful for traffic you can recognise by its link, such as a
          utm_source or utm_campaign parameter from an unwanted ad network.
          Exact Match compares the page path, such as /pages/wholesale.
          Partial Match blocks any page address, including its query string,
          that contains your text, such as utm_source=spam.
        </p>
      </Banner>

      <RuleListCard
        data={list}
        searchPlaceholder="Search URL blocker rules"
        addLabel="Add URL blocker rule"
        emptyTitle="No URL blocker rule found"
        valueHeading="URL"
        valuePlaceholder="utm_source=spam"
        types={[{ value: "URL", label: "URL" }]}
        lists={[{ value: "BLACKLIST", label: "Block" }]}
        matchTypes
      />

      <HandlingCard blockerName="URL blocker" config={handling} />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
