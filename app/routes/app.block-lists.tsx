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
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { isChecked } from "../lib/settings";
import { APP_NAME } from "../lib/app-info";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, StatusToggle } from "../components/ui";
import { HandlingCard, useResultToast } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: "VISITOR", list: "BLACKLIST" };

const ORDER_SETTINGS = {
  refundOnCancel: "Refund to customer when order cancelled.",
  notifyOnCancel: "Notify me when an order cancelled.",
  deleteCodOrders: "Delete order immediately (Only for COD orders).",
} as const;

type OrderSetting = keyof typeof ORDER_SETTINGS;

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
    orderSettings: {
      refundOnCancel: shop.settings.refundOnCancel,
      notifyOnCancel: shop.settings.notifyOnCancel,
      deleteCodOrders: shop.settings.deleteCodOrders,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "orderSetting": {
      const name = String(form.get("name"));
      if (!(name in ORDER_SETTINGS)) return { ok: false, error: "Unknown setting." };
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({
        where: { shopId: shop.id },
        data: { [name as OrderSetting]: enabled },
      });
      return { ok: true, message: enabled ? "Setting enabled" : "Setting disabled" };
    }
    case "handling":
      return saveHandling(shop.id, "BLOCK_LIST", form);
    default:
      return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
  }
};

export default function BlockLists() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);

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

      <Card>
        <CardSection title="Auto Cancel Order Settings">
          <div style={{ display: "grid", gap: 12 }}>
            {(Object.keys(ORDER_SETTINGS) as OrderSetting[]).map((name) => (
              <StatusToggle
                key={name}
                name={name}
                enabled={data.orderSettings[name]}
                onToggle={(next) =>
                  fetcher.submit(
                    next
                      ? { intent: "orderSetting", name, enabled: "on" }
                      : { intent: "orderSetting", name },
                    { method: "POST" },
                  )
                }
                label={`${ORDER_SETTINGS[name]} (${data.orderSettings[name] ? "Enabled" : "Disabled"})`}
              />
            ))}
          </div>
          <p className={styles.helpText}>
            {APP_NAME} starts cancelling orders when Order Filters arrive in a
            later update; these choices are saved for it.
          </p>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
