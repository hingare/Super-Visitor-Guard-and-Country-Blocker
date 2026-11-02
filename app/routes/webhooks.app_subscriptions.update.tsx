import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { applySubscriptionUpdate } from "../models/billing.server";

interface SubscriptionPayload {
  app_subscription?: {
    admin_graphql_api_id?: string;
    name?: string;
    status?: string;
  };
}

// Keeps the plan gate in step when a subscription is approved, cancelled,
// frozen or expires outside the app.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const subscription = (payload as SubscriptionPayload).app_subscription;
  if (subscription?.admin_graphql_api_id && subscription.status) {
    await applySubscriptionUpdate(shop, {
      id: subscription.admin_graphql_api_id,
      name: subscription.name ?? "",
      status: subscription.status.toUpperCase(),
    });
  }
  return new Response();
};
