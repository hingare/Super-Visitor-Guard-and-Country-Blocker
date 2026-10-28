import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { pickOrderSettings } from "../lib/order-settings";
import { saveOrderSetting } from "../models/order-settings.server";
import { APP_NAME } from "../lib/app-info";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner } from "../components/ui";
import { HandlingCard } from "../components/blockers";
import { OrderSettingsCard } from "../components/order-settings";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: "VISITOR", list: "BLACKLIST" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const [list, handling] = await Promise.all([
    loadList(new URL(request.url), shop.id, SPEC),
    getBlockerConfig(shop.id, "BLOCK_LIST"),
  ]);
  const visitors = await db.visitor.findMany({
    where: { shopId: shop.id, code: { in: list.rules.map((rule) => rule.value) } },
    select: { code: true, alias: true, lastIp: true },
  });
  return {
    list,
    handling,
    visitors: Object.fromEntries(visitors.map((visitor) => [visitor.code, visitor])),
    orderSettings: pickOrderSettings(shop.settings),
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "orderSetting":
      return saveOrderSetting(shop.id, form);
    case "handling":
      return saveHandling(shop.id, "BLOCK_LIST", form);
    default:
      return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
  }
};

export default function BlockLists() {
  const data = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Block Lists(Legacy)"
        subtitle="Keep identified visitors and customers out of your store."
      />

      <Banner tone="warning">
        <p>
          Visitors on this list cannot open your store. To stop anonymous
          buyers you cannot identify yet, use{" "}
          <Link to="/app/customer-block-lists">Checkout validation</Link>{" "}
          instead.
        </p>
      </Banner>

      <RuleListCard
        data={data.list}
        help={
          <>
            <h2>Manage Block filters</h2>
            <p>
              Identified visitors are recognised by the visitor id {APP_NAME}{" "}
              gives each browser (CT-...). Find it on the Shop Visitor Logs
              page.
            </p>
            <p>
              For an unidentified, anonymous customer the first order can be
              cancelled automatically, after which they are blocked.
            </p>
          </>
        }
        searchPlaceholder="Search block filters"
        addLabel="Add Record"
        emptyTitle="No block filter found"
        valueHeading="Visitor"
        valuePlaceholder="CT-123456789"
        types={[{ value: "VISITOR", label: `${APP_NAME} Tag` }]}
        lists={[{ value: "BLACKLIST", label: "Block" }]}
        renderValue={(rule) => {
          const visitor = data.visitors[rule.value];
          return (
            <span className={styles.toolbar}>
              <s-icon
                type={visitor ? "check-circle-filled" : "question-circle"}
                tone={visitor ? "success" : "neutral"}
              />
              <span>
                {visitor?.alias ? `${visitor.alias} (${rule.value})` : rule.value}
                {visitor?.lastIp && <div className={styles.muted}>{visitor.lastIp}</div>}
              </span>
            </span>
          );
        }}
      />

      <HandlingCard blockerName="block list" config={data.handling} />

      <OrderSettingsCard values={data.orderSettings} />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
