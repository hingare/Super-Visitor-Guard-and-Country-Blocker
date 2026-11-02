import { useFetcher } from "react-router";

import { frameStyles as styles } from "./AppFrame";
import { Card, CardSection, StatusToggle } from "./ui";
import { useResultToast } from "./blockers";
import { ORDER_SETTINGS, ORDER_SETTING_NAMES, type OrderSettingValues } from "../lib/order-settings";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Posts intent "orderSetting" to the page's action (see saveOrderSetting).
export function OrderSettingsCard({
  values,
}: {
  values: OrderSettingValues & { notifyEmail: string | null };
}) {
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
        {values.notifyOnCancel && (
          <fetcher.Form method="post" className={styles.formRow} style={{ marginTop: 12 }}>
            <input type="hidden" name="intent" value="orderSetting" />
            <input type="hidden" name="name" value="notifyEmail" />
            <input
              key={values.notifyEmail ?? ""}
              name="email"
              type="email"
              className={styles.input}
              defaultValue={values.notifyEmail ?? ""}
              placeholder="Store owner's email"
              aria-label="Notification email"
              maxLength={200}
            />
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
          </fetcher.Form>
        )}
        <p className={styles.helpText}>
          These choices apply to every order the app cancels. Orders paid by
          card are refunded through the original payment method, and each
          cancelled order carries a staff note explaining why. Notices go to
          the email above, or to the store owner&apos;s email when it is empty.
        </p>
      </CardSection>
    </Card>
  );
}
