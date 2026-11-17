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
import type { ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { saveOrderSetting } from "../models/order-settings.server";
import { listOrderFlags } from "../models/order-flags.server";
import { pickOrderSettings } from "../lib/order-settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, StatusToggle } from "../components/ui";
import { ReloadButton, SearchBox, useResultToast } from "../components/blockers";
import { isChecked } from "../lib/settings";
import { DISPOSABLE_EMAIL_DOMAINS } from "../lib/disposable-emails";
import { OrderLogTable } from "../components/order-log";
import { OrderSettingsCard } from "../components/order-settings";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = {
  type: ["AUTO_CANCEL_NAME", "AUTO_CANCEL_EMAIL", "AUTO_CANCEL_PHONE"],
  list: "BLACKLIST",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  const [list, orders] = await Promise.all([
    loadList(url, shop.id, SPEC),
    listOrderFlags({
      shopId: shop.id,
      source: ["AUTO_CANCEL", "BLOCK_LIST", "IP_BLOCKER"],
      search: url.searchParams.get("oq") ?? undefined,
      page: Number(url.searchParams.get("opage")) || 1,
    }),
  ]);
  return {
    list,
    orders,
    orderSettings: pickOrderSettings(shop.settings),
    disposable: {
      enabled: shop.settings.cancelDisposableEmails,
      count: DISPOSABLE_EMAIL_DOMAINS.size,
      domains: [...DISPOSABLE_EMAIL_DOMAINS].sort(),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  if (form.get("intent") === "orderSetting") return saveOrderSetting(shop.id, form);
  if (form.get("intent") === "disposable") {
    const enabled = isChecked(form.get("enabled"));
    await db.settings.update({ where: { shopId: shop.id }, data: { cancelDisposableEmails: enabled } });
    return {
      ok: true,
      message: enabled ? "Throwaway email orders will be cancelled" : "Throwaway email filter off",
    };
  }
  return (await handleListIntent(shop.id, form, [SPEC])) ?? { ok: false, error: "Unknown action." };
};

function DisposableEmailCard({
  enabled,
  count,
  domains,
}: {
  enabled: boolean;
  count: number;
  domains: string[];
}) {
  const fetcher = useFetcher<ActionResult>();
  useResultToast(fetcher);
  const pending = fetcher.formData ? isChecked(fetcher.formData.get("enabled")) : enabled;

  return (
    <Card>
      <CardSection title="Throwaway email addresses">
        <StatusToggle
          name="cancelDisposableEmails"
          enabled={pending}
          disabled={fetcher.state !== "idle"}
          onToggle={(next) =>
            fetcher.submit(
              next ? { intent: "disposable", enabled: "on" } : { intent: "disposable" },
              { method: "POST" },
            )
          }
          label={`Cancel orders from throwaway email services (${pending ? "Enabled" : "Disabled"})`}
        />
        <p className={styles.helpText}>
          Orders whose buyer email is at one of {count} known throwaway email
          services, such as mailinator.com or yopmail.com, are cancelled like
          any other auto-cancel filter match. Ordinary providers such as Gmail
          or Outlook are never on this list.
        </p>
        <details>
          <summary className={styles.helpText}>Show the {count} domains</summary>
          <p className={styles.muted} style={{ columnWidth: "14em", fontSize: 13, lineHeight: 1.7 }}>
            {domains.map((domain) => (
              <span key={domain} style={{ display: "block" }}>
                {domain}
              </span>
            ))}
          </p>
        </details>
      </CardSection>
    </Card>
  );
}

export default function AutoCancelFilters() {
  const data = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Auto-cancel filters"
        subtitle="Cancel orders from buyers on your cancel list automatically."
      />

      <Banner>
        <p>
          New orders from buyers you do not want to sell to are cancelled as
          soon as they arrive, refunded and restocked according to the
          settings below. These filters do not stop anyone from visiting your
          store; to stop buyers at checkout use{" "}
          <Link to="/app/customer-block-lists">Customer Block Lists</Link>.
        </p>
      </Banner>

      <RuleListCard
        data={data.list}
        help={
          <>
            <h2>Manage auto-cancel filters</h2>
            <p>
              Match buyers by full name, email or phone number. The details on
              the order, its billing and shipping addresses and the customer
              account are all checked.
            </p>
            <p>Partial Match covers, for example, every address at one email domain.</p>
          </>
        }
        searchPlaceholder="Search auto-cancel filters"
        addLabel="Add Filter"
        emptyTitle="No cancel list record found"
        valueHeading="Value"
        valuePlaceholder="Full name, email or phone"
        types={[
          { value: "AUTO_CANCEL_NAME", label: "Full name" },
          { value: "AUTO_CANCEL_EMAIL", label: "Email" },
          { value: "AUTO_CANCEL_PHONE", label: "Phone" },
        ]}
        lists={[{ value: "BLACKLIST", label: "Cancel" }]}
        matchTypes
        extraActions={<ReloadButton />}
      />

      <DisposableEmailCard {...data.disposable} />

      <OrderSettingsCard values={data.orderSettings} />

      <Card>
        <CardSection title="Cancelled Orders">
          <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
            <SearchBox placeholder="Search orders" prefix="o" />
            <ReloadButton />
          </div>
          <OrderLogTable
            data={data.orders}
            emptyText="Orders cancelled by auto-cancel filters, Block Lists or the IP Blocker appear here."
          />
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
