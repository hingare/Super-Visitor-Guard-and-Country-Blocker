import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
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
  const { admin, session } = await authenticate.admin(request);

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
  };
};

export default function App() {
  const { apiKey, ownerName, shopHandle } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <AppFrame ownerName={ownerName} shopHandle={shopHandle}>
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
