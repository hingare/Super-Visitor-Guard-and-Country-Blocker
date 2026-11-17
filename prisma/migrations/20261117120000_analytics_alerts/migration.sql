-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "alertEmail" TEXT,
ADD COLUMN     "lastSpikeAlertAt" TIMESTAMP(3),
ADD COLUMN     "spikeAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spikeAlertThreshold" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "timezone" TEXT;

