-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FDA483Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "inspectionDate" DATETIME NOT NULL,
    "responseDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "responseDraft" TEXT,
    "agiDraft" TEXT,
    "submittedAt" DATETIME,
    "submittedBy" TEXT,
    "signatureMeaning" TEXT,
    "closedAt" DATETIME,
    "responseSignatureId" TEXT,
    "inspectionEndDate" DATETIME,
    "leadInvestigator" TEXT,
    "internalOwnerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FDA483Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_responseSignatureId_fkey" FOREIGN KEY ("responseSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_internalOwnerId_fkey" FOREIGN KEY ("internalOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FDA483Event" ("agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "referenceNumber", "responseDeadline", "responseDraft", "responseSignatureId", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt") SELECT "agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "referenceNumber", "responseDeadline", "responseDraft", "responseSignatureId", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt" FROM "FDA483Event";
DROP TABLE "FDA483Event";
ALTER TABLE "new_FDA483Event" RENAME TO "FDA483Event";
CREATE UNIQUE INDEX "FDA483Event_responseSignatureId_key" ON "FDA483Event"("responseSignatureId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
