-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lastReportAt" TIMESTAMP(3),
ADD COLUMN     "reportEmail" TEXT,
ADD COLUMN     "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT false;

