import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import {
  FAIL_OPEN_MAX_MS,
  FAIL_OPEN_MIN_MS,
  parseGeneralSettings,
} from "../lib/settings";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { settings } = await getShopWithSettings(session.shop);

  return {
    failOpenMs: settings.failOpenMs,
    excludeAdmins: settings.excludeAdmins,
    orderAction: settings.orderAction,
    notifyEmail: settings.notifyEmail ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const result = parseGeneralSettings(await request.formData());
  if (!result.ok) {
    return { ok: false as const, errors: result.errors };
  }

  const shop = await getShopWithSettings(session.shop);
  await db.settings.update({
    where: { shopId: shop.id },
    data: result.data,
  });

  return { ok: true as const, errors: {} };
};

export default function SettingsPage() {
  const settings = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const saving = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.ok) shopify.toast.show("Settings saved");
  }, [actionData, shopify]);

  return (
    <s-page heading="Settings">
      <Form method="post" data-save-bar>
        <s-section heading="Storefront">
          <s-stack direction="block" gap="base">
            <s-number-field
              name="failOpenMs"
              label="Verdict timeout (milliseconds)"
              details="If the check takes longer than this, the visitor is let in so real customers are never stuck on a blank page."
              defaultValue={String(settings.failOpenMs)}
              min={FAIL_OPEN_MIN_MS}
              max={FAIL_OPEN_MAX_MS}
              step={100}
              error={errors.failOpenMs}
            />
            <s-checkbox
              name="excludeAdmins"
              label="Never block me while I preview the store from Shopify admin"
              defaultChecked={settings.excludeAdmins}
            />
          </s-stack>
        </s-section>

        <s-section heading="Flagged orders">
          <s-stack direction="block" gap="base">
            <s-select
              name="orderAction"
              label="When an order matches a block rule"
              error={errors.orderAction}
            >
              <s-option
                value="TAGGED"
                defaultSelected={settings.orderAction === "TAGGED"}
              >
                Add a tag to the order
              </s-option>
              <s-option
                value="CANCELLED"
                defaultSelected={settings.orderAction === "CANCELLED"}
              >
                Cancel the order
              </s-option>
              <s-option
                value="NOTIFIED"
                defaultSelected={settings.orderAction === "NOTIFIED"}
              >
                Only send me an email
              </s-option>
            </s-select>
            <s-email-field
              name="notifyEmail"
              label="Notification email"
              details="Leave empty to skip email notifications."
              defaultValue={settings.notifyEmail}
              error={errors.notifyEmail}
            />
          </s-stack>
        </s-section>

        <s-stack direction="inline" justifyContent="end">
          <s-button
            type="submit"
            variant="primary"
            {...(saving ? { loading: true } : {})}
          >
            Save
          </s-button>
        </s-stack>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
