import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { syncStorefrontConfig } from "../models/storefront-config.server";
import type { ActionResult } from "../models/blocker.server";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection } from "../components/ui";
import { useResultToast } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  return { enabled: shop.settings.contentProtectionEnabled };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const enabled = form.get("enabled") === "true";
  const settings = await db.settings.update({
    where: { shopId: shop.id },
    data: { contentProtectionEnabled: enabled },
  });
  try {
    await syncStorefrontConfig(admin, settings);
  } catch (error) {
    console.error("Could not sync storefront config", error);
    return { ok: false, error: "Saved, but the storefront could not be updated. Try again." };
  }
  return { ok: true, message: enabled ? "Content Protection enabled" : "Content Protection disabled" };
};

const PROTECTIONS = [
  "Right-click menu",
  "Copying and cutting text",
  "Selecting text (form fields still work)",
  "Dragging and saving images",
  "Save, print, select-all and view-source shortcuts",
  "Developer tools shortcuts (F12, Ctrl+Shift+I/J/C)",
];

export default function ContentProtection() {
  const { enabled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);
  const pending = fetcher.formData ? fetcher.formData.get("enabled") === "true" : enabled;
  const set = (next: boolean) => fetcher.submit({ enabled: String(next) }, { method: "POST" });

  return (
    <>
      <PageHeader
        title="Content Protection"
        subtitle="Disable right-click, keyboard shortcuts, dragging, text selection and image copying on your storefront."
      />

      <Card>
        <CardSection>
          <div className={styles.toggleRow} style={{ justifyContent: "space-between" }}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>
              Enable Content Protection ({pending ? "Enabled" : "Disabled"})
            </h2>
            <div className={styles.segmented} role="group" aria-label="Content Protection">
              <button
                type="button"
                className={pending ? styles.segmentActive : undefined}
                aria-pressed={pending}
                onClick={() => set(true)}
              >
                Enabled
              </button>
              <button
                type="button"
                className={pending ? undefined : styles.segmentActive}
                aria-pressed={!pending}
                onClick={() => set(false)}
              >
                Disabled
              </button>
            </div>
          </div>
        </CardSection>
        <CardSection title="What visitors can no longer do">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            {PROTECTIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardSection>
      </Card>

      <Banner>
        <p>
          Devices with Admin Access are not affected, so you can still copy
          from your own store. Content Protection makes copying harder, but
          no website can make it impossible.
        </p>
      </Banner>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
