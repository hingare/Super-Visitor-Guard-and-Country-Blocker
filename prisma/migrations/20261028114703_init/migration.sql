-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PAY_AS_YOU_GO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CountryMode" AS ENUM ('BLOCK_LISTED', 'ALLOW_ONLY_LISTED');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('COUNTRY', 'STATE', 'CITY', 'IP', 'IP_RANGE', 'ISP', 'ASN', 'REFERRER', 'URL', 'EMAIL', 'NAME', 'PHONE');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('BLOCK', 'ALLOW', 'REDIRECT');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ALLOWED', 'BLOCKED', 'REDIRECTED');

-- CreateEnum
CREATE TYPE "OrderAction" AS ENUM ('TAGGED', 'CANCELLED', 'NOTIFIED');

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
    "enabled" BOOLEAN NOT NULL DEFAULT true,
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
    "countryMode" "CountryMode" NOT NULL DEFAULT 'BLOCK_LISTED',
    "blockBots" BOOLEAN NOT NULL DEFAULT false,
    "allowGoodBots" BOOLEAN NOT NULL DEFAULT true,
    "blockVpn" BOOLEAN NOT NULL DEFAULT false,
    "blockProxy" BOOLEAN NOT NULL DEFAULT false,
    "blockDatacenter" BOOLEAN NOT NULL DEFAULT false,
    "contentProtection" JSONB NOT NULL DEFAULT '{}',
    "blockZeroTotal" BOOLEAN NOT NULL DEFAULT false,
    "checkoutMessage" TEXT NOT NULL DEFAULT 'We are unable to process your order. Please contact the store.',
    "orderAction" "OrderAction" NOT NULL DEFAULT 'TAGGED',
    "notifyEmail" TEXT,
    "failOpenMs" INTEGER NOT NULL DEFAULT 1500,
    "excludeAdmins" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "action" "RuleAction" NOT NULL DEFAULT 'BLOCK',
    "value" TEXT NOT NULL,
    "redirectUrl" TEXT,
    "note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockPage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Access denied',
    "message" TEXT NOT NULL DEFAULT 'Sorry, this store is not available in your region.',
    "bgColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#202223',
    "logoUrl" TEXT,
    "customCss" TEXT,
    "showVisitorIp" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "asn" INTEGER,
    "isVpn" BOOLEAN NOT NULL DEFAULT false,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "device" TEXT,
    "url" TEXT,
    "referrer" TEXT,
    "verdict" "Verdict" NOT NULL,
    "reason" TEXT,
    "ruleId" TEXT,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFlag" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "reason" TEXT NOT NULL,
    "actionTaken" "OrderAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFlag_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Rule_shopId_type_idx" ON "Rule"("shopId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_shopId_type_value_key" ON "Rule"("shopId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "BlockPage_shopId_key" ON "BlockPage"("shopId");

-- CreateIndex
CREATE INDEX "Visit_shopId_createdAt_idx" ON "Visit"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Visit_shopId_verdict_createdAt_idx" ON "Visit"("shopId", "verdict", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFlag_shopId_orderId_key" ON "OrderFlag"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "UsageRecord_shopId_periodStart_idx" ON "UsageRecord"("shopId", "periodStart");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockPage" ADD CONSTRAINT "BlockPage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFlag" ADD CONSTRAINT "OrderFlag_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
