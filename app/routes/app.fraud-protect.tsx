import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import type { ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { saveOrderSetting } from "../models/order-settings.server";
import { listOrderFlags } from "../models/order-flags.server";
import { pickOrderSettings } from "../lib/order-settings";
import { isChecked } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, StatusToggle } from "../components/ui";
import { ReloadButton, SearchBox, useResultToast } from "../components/blockers";
import { OrderLogTable } from "../components/order-log";
import { OrderSettingsCard } from "../components/order-settings";
import { RuleListCard } from "../components/rule-list";

const WHITELIST: ListSpec = { type: "FRAUD_WHITELIST_EMAIL", list: "WHITELIST", prefix: "w" };

const RISK_SETTINGS = {
  cancelHighRisk: "Automatically cancel High Risk Orders",
  cancelMediumRisk: "Automatically cancel Medium Risk Orders",
  restockOnCancel: "Automatically restore inventory quantity after order cancelled.",
} as const;

type RiskSetting = keyof typeof RISK_SETTINGS;
const RISK_SETTING_NAMES = Object.keys(RISK_SETTINGS) as RiskSetting[];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  const showLowRisk = url.searchParams.get("lowrisk") === "1";
  const [whitelist, orders] = await Promise.all([
    loadList(url, shop.id, WHITELIST),
    listOrderFlags({
      shopId: shop.id,
      source: "FRAUD_PROTECT",
      search: url.searchParams.get("oq") ?? undefined,
      hideLowRisk: !showLowRisk,
      page: Number(url.searchParams.get("opage")) || 1,
    }),
  ]);
  return {
    enabled: shop.settings.fraudProtectEnabled,
    risk: Object.fromEntries(RISK_SETTING_NAMES.map((name) => [name, shop.settings[name]])) as Record<
      RiskSetting,
      boolean
    >,
    orderSettings: pickOrderSettings(shop.settings),
    whitelist,
    orders,
    showLowRisk,
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "enabled": {
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({ where: { shopId: shop.id }, data: { fraudProtectEnabled: enabled } });
      return { ok: true, message: enabled ? "Fraud Protect enabled" : "Fraud Protect disabled" };
    }
    case "risk": {
      const name = String(form.get("name"));
      if (!(name in RISK_SETTINGS)) return { ok: false, error: "Unknown setting." };
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({ where: { shopId: shop.id }, data: { [name as RiskSetting]: enabled } });
      return { ok: true, message: enabled ? "Setting activated" : "Setting disabled" };
    }
    case "orderSetting":
      return saveOrderSetting(shop.id, form);
    default:
      return (await handleListIntent(shop.id, form, [WHITELIST])) ?? { ok: false, error: "Unknown action." };
  }
};

function LowRiskCheckbox({ checked }: { checked: boolean }) {
  const [params, setParams] = useSearchParams();
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={!checked}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          if (event.target.checked) next.delete("lowrisk");
          else next.set("lowrisk", "1");
          next.delete("opage");
          setParams(next);
        }}
      />
      Hide low risk orders
    </label>
  );
}

export default function FraudProtect() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);

  const pendingValue = (intent: string, name: string | null, current: boolean) => {
    const form = fetcher.formData;
    if (form?.get("intent") !== intent || (name && form.get("name") !== name)) return current;
    return isChecked(form.get("enabled"));
  };
  const enabled = pendingValue("enabled", null, data.enabled);
  const submit = (fields: Record<string, string>, next: boolean) =>
    fetcher.submit(next ? { ...fields, enabled: "on" } : fields, { method: "POST" });

  return (
    <>
      <PageHeader title="Fraud Protect" subtitle="Automatically deal with risk orders" />

      <Card>
        <CardSection>
          <StatusToggle
            name="enabled"
            enabled={enabled}
            onToggle={(next) => submit({ intent: "enabled" }, next)}
            label={`Enable Fraud Protect (${enabled ? "Enabled" : "Disabled"})`}
          />
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Settings">
          <Banner>
            <p>
              Orders Shopify rates as high or medium risk can be cancelled
              for you as soon as the rating arrives, with their inventory put
              back. Choose which risk levels to act on.
            </p>
          </Banner>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {RISK_SETTING_NAMES.map((name) => {
              const on = pendingValue("risk", name, data.risk[name]);
              return (
                <div key={name} className={styles.toggleRow} style={{ justifyContent: "space-between" }}>
                  <span>
                    {RISK_SETTINGS[name]} ({on ? "Enabled" : "Disabled"})
                  </span>
                  <div className={styles.segmented} role="group" aria-label={RISK_SETTINGS[name]}>
                    <button
                      type="button"
                      className={on ? styles.segmentActive : undefined}
                      aria-pressed={on}
                      onClick={() => submit({ intent: "risk", name }, true)}
                    >
                      Activate
                    </button>
                    <button
                      type="button"
                      className={on ? undefined : styles.segmentActive}
                      aria-pressed={!on}
                      onClick={() => submit({ intent: "risk", name }, false)}
                    >
                      Disable
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardSection>
      </Card>

      <OrderSettingsCard values={data.orderSettings} />

      <RuleListCard
        data={data.whitelist}
        prefix="w"
        title="Whitelist"
        help={
          <>
            <h2>Trusted buyers</h2>
            <p>
              Orders from these email addresses are never cancelled by Fraud
              Protect, whatever their risk level.
            </p>
          </>
        }
        searchPlaceholder="Search whitelist"
        addLabel="Add Whitelist Record"
        emptyTitle="No whitelist record found"
        valueHeading="Email"
        valuePlaceholder="name@example.com"
        types={[{ value: "FRAUD_WHITELIST_EMAIL", label: "Email" }]}
        lists={[{ value: "WHITELIST", label: "Allow" }]}
        matchTypes
      />

      <Card>
        <CardSection title="Filtered Orders">
          <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
            <SearchBox placeholder="Search orders" prefix="o" />
            <LowRiskCheckbox checked={data.showLowRisk} />
            <ReloadButton />
          </div>
          <OrderLogTable
            data={data.orders}
            showRisk
            emptyText="Orders appear here once Shopify rates their risk while Fraud Protect is on."
          />
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
