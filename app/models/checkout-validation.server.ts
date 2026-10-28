import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { CHECKOUT_RULE_TYPES, MAX_CHECKOUT_RULES, buildCheckoutConfig } from "../lib/checkout-validation";
import { APP_NAME } from "../lib/app-info";

// Keeps the shop's checkout validation (backed by the checkout-validation
// function) in step with the Customer Block Lists page.

export const FUNCTION_HANDLE = "checkout-validation";
const METAFIELD = { namespace: "$app:visitor_guard", key: "checkout" } as const;

type SyncResult = { ok: true } | { ok: false; error: string };

async function findValidationId(admin: AdminApiContext): Promise<string | null> {
  const response = await admin.graphql(`#graphql
    query AppValidations {
      validations(first: 50) {
        nodes {
          id
          shopifyFunction {
            handle
          }
        }
      }
    }`);
  const { data } = await response.json();
  const nodes: { id: string; shopifyFunction: { handle: string } }[] = data?.validations?.nodes ?? [];
  return nodes.find((node) => node.shopifyFunction.handle === FUNCTION_HANDLE)?.id ?? null;
}

export async function syncCheckoutValidation(
  admin: AdminApiContext,
  shopId: string,
): Promise<SyncResult> {
  const [settings, rules] = await Promise.all([
    db.settings.findUniqueOrThrow({ where: { shopId } }),
    db.rule.findMany({
      where: { shopId, type: { in: [...CHECKOUT_RULE_TYPES] } },
      orderBy: { createdAt: "desc" },
      take: MAX_CHECKOUT_RULES,
      select: { type: true, value: true, matchType: true },
    }),
  ]);

  const validation = {
    title: `${APP_NAME} checkout validation`,
    enable: settings.checkoutValidationEnabled,
    // A failing function must never stop every checkout in the store.
    blockOnFailure: false,
    metafields: [
      {
        ...METAFIELD,
        type: "json",
        value: JSON.stringify(buildCheckoutConfig(settings, rules)),
      },
    ],
  };

  try {
    const id = await findValidationId(admin);
    const response = id
      ? await admin.graphql(
          `#graphql
          mutation UpdateCheckoutValidation($id: ID!, $validation: ValidationUpdateInput!) {
            validationUpdate(id: $id, validation: $validation) {
              userErrors {
                field
                message
              }
            }
          }`,
          { variables: { id, validation } },
        )
      : await admin.graphql(
          `#graphql
          mutation CreateCheckoutValidation($validation: ValidationCreateInput!) {
            validationCreate(validation: $validation) {
              userErrors {
                field
                message
              }
            }
          }`,
          { variables: { validation: { ...validation, functionHandle: FUNCTION_HANDLE } } },
        );
    const { data } = await response.json();
    const errors: { message: string }[] =
      (id ? data?.validationUpdate?.userErrors : data?.validationCreate?.userErrors) ?? [];
    if (errors.length > 0) {
      console.error("Checkout validation sync failed", errors);
      return { ok: false, error: errors[0].message };
    }
    return { ok: true };
  } catch (error) {
    console.error("Checkout validation sync failed", error);
    return { ok: false, error: "Shopify could not be reached. Try again." };
  }
}
