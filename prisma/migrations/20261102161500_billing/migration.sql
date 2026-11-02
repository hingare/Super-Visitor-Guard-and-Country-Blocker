-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "billingActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingCycleEnd" TIMESTAMP(3),
ADD COLUMN     "chargedThisCycle" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "usageLineItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_shopId_periodStart_views_key" ON "UsageRecord"("shopId", "periodStart", "views");

