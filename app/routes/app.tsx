import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { BILLING_DISABLED, BILLING_TEST, syncBilling } from "../models/billing.server";
import { planLabel } from "../lib/billing";
import { AppFrame } from "../components/AppFrame";

const SHOP_IDENTITY_QUERY = `#graphql
  query ShopIdentity {
    shop {
      name
      shopOwnerName
      myshopifyDomain
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing, redirect } = await authenticate.admin(request);

  // Every page needs a plan; the Plans page is where one is chosen.
  const shop = await getShopWithSettings(session.shop);
  let plan = BILLING_DISABLED ? shop.plan : null;
  if (!BILLING_DISABLED) {
    const { appSubscriptions } = await billing.check({ isTest: BILLING_TEST });
    plan = await syncBilling(shop, appSubscriptions);
    if (!plan && new URL(request.url).pathname !== "/app/plans") {
      throw redirect("/app/plans");
    }
  }

  let ownerName = "";
  let shopHandle = session.shop.replace(/\.myshopify\.com$/, "");
  try {
    const response = await admin.graphql(SHOP_IDENTITY_QUERY);
    const json = await response.json();
    ownerName = json.data?.shop?.shopOwnerName ?? json.data?.shop?.name ?? "";
    const domain = json.data?.shop?.myshopifyDomain;
    if (domain) shopHandle = domain.replace(/\.myshopify\.com$/, "");
  } catch (error) {
    console.error("Could not load shop identity", error);
  }

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    ownerName,
    shopHandle,
    planName: plan ? planLabel(plan) : null,
  };
};

export default function App() {
  const { apiKey, ownerName, shopHandle, planName } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <AppFrame ownerName={ownerName} shopHandle={shopHandle} planName={planName}>
        <Outlet />
      </AppFrame>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
