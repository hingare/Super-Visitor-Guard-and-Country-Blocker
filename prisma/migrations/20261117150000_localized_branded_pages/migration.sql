-- AlterTable
ALTER TABLE "GeoRedirect" ADD COLUMN     "askFirst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keepPath" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "blockPageBranding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockPageColor" TEXT,
ADD COLUMN     "blockPageLogoUrl" TEXT,
ADD COLUMN     "cancelDisposableEmails" BOOLEAN NOT NULL DEFAULT false;

