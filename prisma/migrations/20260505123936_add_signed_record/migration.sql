-- CreateTable
CREATE TABLE "SignedRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signatureMeaning" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentSummary" TEXT NOT NULL,
    "passwordVerifiedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CAPAApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "signatureId" TEXT,
    CONSTRAINT "CAPAApproval_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAApproval_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CAPAApproval" ("approvedAt", "approverId", "approverName", "approverRole", "capaId", "comment", "id", "signatureId", "tenantId") SELECT "approvedAt", "approverId", "approverName", "approverRole", "capaId", "comment", "id", "signatureId", "tenantId" FROM "CAPAApproval";
DROP TABLE "CAPAApproval";
ALTER TABLE "new_CAPAApproval" RENAME TO "CAPAApproval";
CREATE UNIQUE INDEX "CAPAApproval_signatureId_key" ON "CAPAApproval"("signatureId");
CREATE INDEX "CAPAApproval_tenantId_capaId_idx" ON "CAPAApproval"("tenantId", "capaId");
CREATE INDEX "CAPAApproval_capaId_idx" ON "CAPAApproval"("capaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SignedRecord_recordType_recordId_idx" ON "SignedRecord"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "SignedRecord_tenantId_signerId_idx" ON "SignedRecord"("tenantId", "signerId");

-- CreateIndex
CREATE INDEX "SignedRecord_createdAt_idx" ON "SignedRecord"("createdAt");
