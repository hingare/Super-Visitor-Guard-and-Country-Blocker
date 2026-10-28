-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PAY_AS_YOU_GO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CountryMode" AS ENUM ('BLACKLIST', 'WHITELIST');

-- CreateEnum
CREATE TYPE "Blocker" AS ENUM ('COUNTRY', 'IP', 'BOT_VPN', 'BLOCK_LIST', 'REFERRER', 'ISP_ASN', 'URL');

-- CreateEnum
CREATE TYPE "BlockHandling" AS ENUM ('CUSTOM_INFO', 'REDIRECT', 'TEMPLATE', 'HIDE_SECTION');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('COUNTRY', 'STATE', 'CITY', 'IP', 'IP_RANGE', 'ORGANIZATION', 'CRAWLER', 'REFERRER', 'ISP', 'ASN', 'URL', 'PAGE_WHITELIST', 'VISITOR', 'CUSTOMER_EMAIL', 'CUSTOMER_PHONE', 'CUSTOMER_NAME', 'CUSTOMER_ZIP', 'AUTO_CANCEL_EMAIL', 'AUTO_CANCEL_PHONE', 'AUTO_CANCEL_NAME', 'FRAUD_WHITELIST_EMAIL');

-- CreateEnum
CREATE TYPE "RuleList" AS ENUM ('BLACKLIST', 'WHITELIST');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'PARTIAL');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ALLOWED', 'BLOCKED', 'REDIRECTED');

-- CreateEnum
CREATE TYPE "OrderAction" AS ENUM ('CANCELLED', 'REFUNDED', 'DELETED', 'NOTIFIED');

-- CreateEnum
CREATE TYPE "AccessLinkKind" AS ENUM ('ADMIN_INVITE', 'AUTO_WHITELIST');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "ownerName" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'PAY_AS_YOU_GO',
    "publicKey" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "billingCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageViewsThisCycle" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "filtersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preloadMask" BOOLEAN NOT NULL DEFAULT false,
    "selectedPages" JSONB NOT NULL DEFAULT '[]',
    "countryMode" "CountryMode" NOT NULL DEFAULT 'BLACKLIST',
    "blockByStateCity" BOOLEAN NOT NULL DEFAULT false,
    "deleteOrdersFromBlockedIps" BOOLEAN NOT NULL DEFAULT false,
    "botBlockerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkoutValidationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkoutErrorMessage" TEXT NOT NULL DEFAULT 'An error occurred during the checkout process.',
    "preventZeroCheckout" BOOLEAN NOT NULL DEFAULT false,
    "refundOnCancel" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnCancel" BOOLEAN NOT NULL DEFAULT false,
    "deleteCodOrders" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" TEXT,
    "fraudProtectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cancelHighRisk" BOOLEAN NOT NULL DEFAULT true,
    "cancelMediumRisk" BOOLEAN NOT NULL DEFAULT false,
    "restockOnCancel" BOOLEAN NOT NULL DEFAULT true,
    "contentProtectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockerConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "blocker" "Blocker" NOT NULL,
    "handling" "BlockHandling" NOT NULL DEFAULT 'CUSTOM_INFO',
    "header" TEXT NOT NULL DEFAULT 'Access Denied',
    "message" TEXT NOT NULL DEFAULT 'Sorry, you do not currently have the necessary permissions to access this site, or this site may not be available in your region.',
    "redirectUrl" TEXT,
    "templateId" TEXT,
    "sectionSelector" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "list" "RuleList" NOT NULL DEFAULT 'BLACKLIST',
    "matchType" "MatchType" NOT NULL DEFAULT 'EXACT',
    "value" TEXT NOT NULL,
    "comment" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "alias" TEXT,
    "lastIp" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "visitorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "countryName" TEXT,
    "region" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "organization" TEXT,
    "asn" INTEGER,
    "isVpn" BOOLEAN NOT NULL DEFAULT false,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "isTor" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isLowRiskBot" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "pageType" TEXT,
    "url" TEXT,
    "referrer" TEXT,
    "verdict" "Verdict" NOT NULL,
    "blocker" "Blocker",
    "reason" TEXT,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFlag" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "riskLevel" TEXT,
    "reason" TEXT NOT NULL,
    "actionTaken" "OrderAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLink" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" "AccessLinkKind" NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoRedirect" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "countries" TEXT[],
    "targetUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL,
    "chargedUsd" DECIMAL(10,2) NOT NULL,
    "shopifyUsageRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_publicKey_key" ON "Shop"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_shopId_key" ON "Settings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockerConfig_shopId_blocker_key" ON "BlockerConfig"("shopId", "blocker");

-- CreateIndex
CREATE INDEX "Rule_shopId_type_list_idx" ON "Rule"("shopId", "type", "list");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_shopId_type_list_value_key" ON "Rule"("shopId", "type", "list", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_shopId_code_key" ON "Visitor"("shopId", "code");

-- CreateIndex
CREATE INDEX "Visit_shopId_createdAt_idx" ON "Visit"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Visit_shopId_verdict_createdAt_idx" ON "Visit"("shopId", "verdict", "createdAt");

-- CreateIndex
CREATE INDEX "Visit_shopId_ip_idx" ON "Visit"("shopId", "ip");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFlag_shopId_orderId_key" ON "OrderFlag"("shopId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessLink_token_key" ON "AccessLink"("token");

-- CreateIndex
CREATE INDEX "UsageRecord_shopId_periodStart_idx" ON "UsageRecord"("shopId", "periodStart");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerConfig" ADD CONSTRAINT "BlockerConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFlag" ADD CONSTRAINT "OrderFlag_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLink" ADD CONSTRAINT "AccessLink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoRedirect" ADD CONSTRAINT "GeoRedirect_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
