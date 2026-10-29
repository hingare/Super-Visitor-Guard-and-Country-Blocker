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
import type { ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { syncCheckoutValidation } from "../models/checkout-validation.server";
import {
  CHECKOUT_RULE_TYPES,
  MAX_CHECKOUT_RULES,
  MAX_ERROR_MESSAGE,
  parseErrorMessage,
} from "../lib/checkout-validation";
import { isChecked } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, ContactUsButton, StatusToggle } from "../components/ui";
import { ReloadButton, useResultToast } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const SPEC: ListSpec = { type: [...CHECKOUT_RULE_TYPES], list: "BLACKLIST" };

const RULE_TYPES = [
  { value: "CUSTOMER_EMAIL", label: "Email" },
  { value: "CUSTOMER_PHONE", label: "Phone" },
  { value: "CUSTOMER_NAME", label: "Full name" },
  { value: "CUSTOMER_ZIP", label: "ZIP code" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  return {
    list: await loadList(new URL(request.url), shop.id, SPEC),
    enabled: shop.settings.checkoutValidationEnabled,
    message: shop.settings.checkoutErrorMessage,
    preventZero: shop.settings.preventZeroCheckout,
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  let result: ActionResult;
  switch (form.get("intent")) {
    case "enabled": {
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({
        where: { shopId: shop.id },
        data: { checkoutValidationEnabled: enabled },
      });
      result = { ok: true, message: enabled ? "Checkout validation enabled" : "Checkout validation disabled" };
      break;
    }
    case "preventZero": {
      const enabled = isChecked(form.get("enabled"));
      await db.settings.update({ where: { shopId: shop.id }, data: { preventZeroCheckout: enabled } });
      result = { ok: true, message: enabled ? "$0 checkouts are now blocked" : "$0 checkouts are allowed" };
      break;
    }
    case "message": {
      const parsed = parseErrorMessage(form.get("message"));
      if (!parsed.ok) return parsed;
      await db.settings.update({ where: { shopId: shop.id }, data: { checkoutErrorMessage: parsed.value } });
      result = { ok: true, message: "Error message saved" };
      break;
    }
    default: {
      const listResult = await handleListIntent(shop.id, form, [SPEC]);
      if (!listResult) return { ok: false, error: "Unknown action." };
      if (!listResult.ok) return listResult;
      result = listResult;
    }
  }

  // Checkout reads its rules from Shopify, so every change is pushed there.
  const synced = await syncCheckoutValidation(admin, shop.id);
  return synced.ok
    ? result
    : { ok: false, error: `Saved, but checkout could not be updated: ${synced.error}` };
};

export default function CustomerBlockLists() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);

  const pending = (intent: string, current: boolean) =>
    fetcher.formData?.get("intent") === intent ? isChecked(fetcher.formData.get("enabled")) : current;
  const enabled = pending("enabled", data.enabled);
  const preventZero = pending("preventZero", data.preventZero);
  const toggle = (intent: string) => (next: boolean) =>
    fetcher.submit(next ? { intent, enabled: "on" } : { intent }, { method: "POST" });

  return (
    <>
      <PageHeader
        title="Checkout Validation"
        subtitle="Stop buyers who match your conditions from completing checkout."
      />

      <Banner tone="warning">
        <p>
          A checkout stopped here still shows up in Shopify as an abandoned
          checkout, and bots can keep creating those. Contact us if fake
          checkouts or accounts are a problem for your store.
        </p>
        <ContactUsButton />
      </Banner>

      <Card>
        <CardSection>
          <StatusToggle
            name="enabled"
            enabled={enabled}
            onToggle={toggle("enabled")}
            label={`Checkout Validation ${enabled ? "Enabled" : "Disabled"}.`}
          />
          <div style={{ marginTop: 12 }}>
            <Banner tone="warning">
              <p>
                Validation runs in Shopify&apos;s standard checkout only.
                Express buttons such as PayPal or Google Pay and third-party
                order forms (for example COD forms) skip it.
              </p>
            </Banner>
          </div>
        </CardSection>

        <CardSection title="Error Message:">
          <fetcher.Form method="post" className={styles.formRow}>
            <input type="hidden" name="intent" value="message" />
            <input
              name="message"
              className={styles.input}
              key={data.message}
              defaultValue={data.message}
              maxLength={MAX_ERROR_MESSAGE}
              required
              aria-label="Error message"
            />
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
          </fetcher.Form>
          <p className={styles.helpText}>Buyers see this message when validation stops their checkout.</p>
        </CardSection>

        <CardSection>
          <StatusToggle
            name="preventZero"
            enabled={preventZero}
            onToggle={toggle("preventZero")}
            label={`Prevent $0 Checkout - ${preventZero ? "Enabled" : "Disabled"}.`}
          />
          <p className={styles.helpText}>
            Stops checkouts whose total is zero, a common sign of discount
            abuse or test bots.
          </p>
        </CardSection>
      </Card>

      <Banner>
        <p>
          Block buyers by email, phone number, full name or ZIP code. If any
          one of your conditions matches, the buyer cannot complete checkout.
          Use Partial Match to cover a whole email domain (for example
          @example.com) or part of a phone number. Up to {MAX_CHECKOUT_RULES}{" "}
          rules are checked at checkout.
        </p>
      </Banner>

      <RuleListCard
        data={data.list}
        title="Block by customer's identity (Email/Phone/Name/ZIP)"
        searchPlaceholder="Search rules..."
        addLabel="Add Blocking Rule"
        emptyTitle="No blocking rule found"
        valueHeading="Block Value"
        valuePlaceholder="name@example.com"
        types={RULE_TYPES}
        lists={[{ value: "BLACKLIST", label: "Block" }]}
        matchTypes
        extraActions={<ReloadButton />}
      />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
