import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processRiskChange, type RiskPayload } from "../models/order-filters.server";

// Fraud Protect: cancels orders once Shopify rates them high (or medium) risk.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  if (admin) {
    processRiskChange(shop, admin, payload as RiskPayload).catch((error) =>
      console.error(`orders/risk_assessment_changed failed for ${shop}`, error),
    );
  }
  return new Response();
};
