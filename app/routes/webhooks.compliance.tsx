import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../models/shop.server";
import { redactCustomer, reportCustomerData } from "../models/compliance.server";
import type { CompliancePayload } from "../lib/compliance";

// Mandatory privacy webhooks for App Store apps.
// See https://shopify.dev/docs/apps/build/privacy-law-compliance
//
// The order log holds the order name and buyer email of orders the app acted
// on; that is the customer data handled here. Visits are keyed by IP address
// and visitor id and are not linked to customer records, and blacklist rules
// are entered by the merchant.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      const found = await reportCustomerData(shop, payload as CompliancePayload);
      console.log(`${topic} for ${shop}: ${found} order log entries held`);
      break;
    }
    case "CUSTOMERS_REDACT": {
      const removed = await redactCustomer(shop, payload as CompliancePayload);
      console.log(`${topic} for ${shop}: ${removed} order log entries erased`);
      break;
    }
    case "SHOP_REDACT":
      await deleteShopData(shop);
      break;
    default:
      console.warn(`Unhandled compliance topic ${topic} for ${shop}`);
  }

  return new Response();
};
