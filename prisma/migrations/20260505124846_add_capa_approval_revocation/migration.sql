-- AlterTable
ALTER TABLE "CAPAApproval" ADD COLUMN "revokedAt" DATETIME;
ALTER TABLE "CAPAApproval" ADD COLUMN "revokedSignatureId" TEXT;

-- CreateIndex
CREATE INDEX "CAPAApproval_revokedAt_idx" ON "CAPAApproval"("revokedAt");
