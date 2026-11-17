-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowTriggerUsage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowTriggerUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeLog_shopId_createdAt_idx" ON "ChangeLog"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlowTriggerUsage_shopId_trigger_key" ON "FlowTriggerUsage"("shopId", "trigger");

-- AddForeignKey
ALTER TABLE "ChangeLog" ADD CONSTRAINT "ChangeLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowTriggerUsage" ADD CONSTRAINT "FlowTriggerUsage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

