import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureShop } from "./models/shop.server";
import { syncStorefrontConfig } from "./models/storefront-config.server";
import {
  PAY_AS_YOU_GO_PLAN,
  PREMIUM_PLAN,
  PREMIUM_PRICE,
  PREMIUM_TRIAL_DAYS,
  USAGE_CAP,
  USAGE_TERMS,
} from "./lib/billing";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [PAY_AS_YOU_GO_PLAN]: {
      lineItems: [
        {
          interval: BillingInterval.Usage,
          amount: USAGE_CAP,
          currencyCode: "USD",
          terms: USAGE_TERMS,
        },
      ],
    },
    [PREMIUM_PLAN]: {
      trialDays: PREMIUM_TRIAL_DAYS,
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: PREMIUM_PRICE,
          currencyCode: "USD",
        },
      ],
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      const shop = await ensureShop(session.shop);
      if (shop.settings) {
        await syncStorefrontConfig(admin, shop.settings).catch((error) =>
          console.error("Could not sync storefront config", error),
        );
      }
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
