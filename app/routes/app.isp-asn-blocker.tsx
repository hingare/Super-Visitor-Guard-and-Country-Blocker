import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { PageHeader } from "../components/AppFrame";
import { Banner } from "../components/ui";
import { HandlingCard } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: ["ISP", "ASN"], list: "BLACKLIST" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const [list, handling] = await Promise.all([
    loadList(new URL(request.url), shop.id, SPEC),
    getBlockerConfig(shop.id, "ISP_ASN"),
  ]);
  return { list, handling };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  if (form.get("intent") === "handling") return saveHandling(shop.id, "ISP_ASN", form);
  return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
};

export default function IspAsnBlocker() {
  const { list, handling } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="ISP/ASN Blocker"
        subtitle="Block traffic from chosen internet providers (ISP) or networks (ASN)."
      />

      <Banner>
        <p>
          Find a visitor&apos;s provider and network number on the{" "}
          <Link to="/app/visitor-logs">Shop Visitor Logs</Link> page or with
          the <Link to="/app/ip-lookup">IP Address Lookup</Link> tool. An ISP
          rule matches the provider name (Partial Match accepts part of it);
          an ASN rule matches the network number, such as AS14061.
        </p>
      </Banner>

      <RuleListCard
        data={list}
        searchPlaceholder="Search ISP/ASN filters"
        addLabel="Add ISP/ASN filter"
        emptyTitle="No ISP/ASN filter found"
        valueHeading="ISP / ASN"
        valuePlaceholder="DigitalOcean or AS14061"
        types={[
          { value: "ISP", label: "ISP" },
          { value: "ASN", label: "ASN" },
        ]}
        lists={[{ value: "BLACKLIST", label: "Block" }]}
        matchTypes
        renderValue={(rule) => (rule.type === "ASN" ? `AS${rule.value}` : rule.value)}
      />

      <HandlingCard blockerName="ISP/ASN blocker" config={handling} />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
