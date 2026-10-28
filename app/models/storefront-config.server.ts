import type { Settings } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// The theme app embed reads this app-owned metafield in Liquid
// (app.metafields.visitor_guard.config) to decide, before any script runs,
// whether to hide the page until the verdict arrives and whether to turn on
// Content Protection.

export const STOREFRONT_METAFIELD = { namespace: "visitor_guard", key: "config" } as const;

type StorefrontSettings = Pick<Settings, "filtersEnabled" | "preloadMask" | "contentProtectionEnabled">;

export function storefrontConfig(settings: StorefrontSettings) {
  return {
    filtersEnabled: settings.filtersEnabled,
    preloadMask: settings.filtersEnabled && settings.preloadMask,
    contentProtection: settings.contentProtectionEnabled,
  };
}

export async function syncStorefrontConfig(
  admin: AdminApiContext,
  settings: StorefrontSettings,
) {
  const installation = await admin.graphql(`#graphql
    query AppInstallationId {
      currentAppInstallation {
        id
      }
    }`);
  const { data } = await installation.json();
  const ownerId = data?.currentAppInstallation?.id;
  if (!ownerId) return;

  const response = await admin.graphql(
    `#graphql
    mutation SetStorefrontConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            ...STOREFRONT_METAFIELD,
            type: "json",
            value: JSON.stringify(storefrontConfig(settings)),
          },
        ],
      },
    },
  );
  const result = await response.json();
  const errors = result.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    console.error("Could not save storefront config", errors);
  }
}
