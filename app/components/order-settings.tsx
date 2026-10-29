import { useFetcher } from "react-router";

import { frameStyles as styles } from "./AppFrame";
import { Card, CardSection, StatusToggle } from "./ui";
import { useResultToast } from "./blockers";
import { ORDER_SETTINGS, ORDER_SETTING_NAMES, type OrderSettingValues } from "../lib/order-settings";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Posts intent "orderSetting" to the page's action (see saveOrderSetting).
export function OrderSettingsCard({ values }: { values: OrderSettingValues }) {
  const fetcher = useFetcher<Result>();
  useResultToast(fetcher);

  return (
    <Card>
      <CardSection title="Auto Cancel Order Settings">
        <div style={{ display: "grid", gap: 12 }}>
          {ORDER_SETTING_NAMES.map((name) => (
            <StatusToggle
              key={name}
              name={name}
              enabled={values[name]}
              onToggle={(next) =>
                fetcher.submit(
                  next ? { intent: "orderSetting", name, enabled: "on" } : { intent: "orderSetting", name },
                  { method: "POST" },
                )
              }
              label={`${ORDER_SETTINGS[name]} (${values[name] ? "Enabled" : "Disabled"})`}
            />
          ))}
        </div>
        <p className={styles.helpText}>
          These choices apply to every order the app cancels. Orders paid by
          card are refunded through the original payment method. Email
          notices for cancelled orders arrive in a later update; until then
          each cancelled order carries a staff note explaining why.
        </p>
      </CardSection>
    </Card>
  );
}
