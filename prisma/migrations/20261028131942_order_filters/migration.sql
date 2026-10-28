-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('FRAUD_PROTECT', 'AUTO_CANCEL', 'BLOCK_LIST', 'IP_BLOCKER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderAction" ADD VALUE 'SKIPPED';
ALTER TYPE "OrderAction" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "OrderFlag" ADD COLUMN     "email" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'FRAUD_PROTECT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "OrderFlag_shopId_source_createdAt_idx" ON "OrderFlag"("shopId", "source", "createdAt");
