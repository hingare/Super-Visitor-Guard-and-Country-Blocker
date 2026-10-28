import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../models/shop.server";

// Mandatory privacy webhooks for App Store apps.
// See https://shopify.dev/docs/apps/build/privacy-law-compliance
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // Visits are keyed by IP and not linked to customer records, so there is
      // no per-customer data to export or erase. Merchant-entered blacklist
      // rules belong to the merchant.
      console.log(`Received ${topic} for ${shop}; no customer data stored`);
      break;
    case "SHOP_REDACT":
      await deleteShopData(shop);
      break;
    default:
      console.warn(`Unhandled compliance topic ${topic} for ${shop}`);
  }

  return new Response();
};
