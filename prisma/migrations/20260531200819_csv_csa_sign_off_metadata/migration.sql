-- AlterTable
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffAnnex11Compliant" BOOLEAN;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffAt" DATETIME;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffById" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffByName" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffContentHash" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffPart11Compliant" BOOLEAN;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffReason" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffRtmCoverage" REAL;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffSignatureId" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffStagesApproved" INTEGER;
ALTER TABLE "GxPSystem" ADD COLUMN "signedOffStagesTotal" INTEGER;
