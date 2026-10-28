import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processNewOrder } from "../models/order-filters.server";
import type { OrderPayload } from "../lib/order-filters";

// Auto-cancel filters, Block Lists and the IP Blocker's delete option act on
// new orders here. Shopify expects an answer within 5 seconds and cancelling
// (then deleting) can take longer, so the work continues after the reply.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  if (admin) {
    processNewOrder(shop, admin, payload as OrderPayload).catch((error) =>
      console.error(`orders/create failed for ${shop}`, error),
    );
  }
  return new Response();
};
