-- AlterTable
ALTER TABLE "AccessLink" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "maxUses" INTEGER;

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "autoBlockEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoBlockLimit" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "autoBlockMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateIndex
CREATE INDEX "Rule_expiresAt_idx" ON "Rule"("expiresAt");

