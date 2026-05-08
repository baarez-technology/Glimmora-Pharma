-- AlterTable
ALTER TABLE "Document" ADD COLUMN "category" TEXT;
ALTER TABLE "Document" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Document" ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "Document" ADD COLUMN "fileExtension" TEXT;
ALTER TABLE "Document" ADD COLUMN "notes" TEXT;
ALTER TABLE "Document" ADD COLUMN "originalFileName" TEXT;
ALTER TABLE "Document" ADD COLUMN "retainUntil" DATETIME;
ALTER TABLE "Document" ADD COLUMN "sha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "siteId" TEXT;
ALTER TABLE "Document" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "Document" ADD COLUMN "sourceModule" TEXT;
ALTER TABLE "Document" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Document" ADD COLUMN "uploadedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Document_tenantId_sourceModule_sourceId_idx" ON "Document"("tenantId", "sourceModule", "sourceId");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedAt_idx" ON "Document"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
