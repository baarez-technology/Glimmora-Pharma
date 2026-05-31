-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deviation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "detectedDate" DATETIME NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "rcaMethod" TEXT,
    "patientSafetyImpact" TEXT,
    "productQualityImpact" TEXT,
    "regulatoryImpact" TEXT,
    "batchesAffected" TEXT,
    "linkedCAPAId" TEXT,
    "closedBy" TEXT,
    "closedDate" DATETIME,
    "closureNotes" TEXT,
    "closureSignatureId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT,
    "previousCAPAId" TEXT,
    "rcaData" TEXT,
    "investigationCompletedAt" DATETIME,
    "investigationCompletedById" TEXT,
    "capaDecisionMade" BOOLEAN NOT NULL DEFAULT false,
    "capaDecisionRequired" BOOLEAN,
    "capaDecisionReason" TEXT,
    "capaDecisionAt" DATETIME,
    "capaDecisionById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deviation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_investigationCompletedById_fkey" FOREIGN KEY ("investigationCompletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_capaDecisionById_fkey" FOREIGN KEY ("capaDecisionById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_previousCAPAId_fkey" FOREIGN KEY ("previousCAPAId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deviation" ("area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "closureSignatureId", "createdAt", "createdBy", "createdById", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "previousCAPAId", "productQualityImpact", "rcaMethod", "reference", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt") SELECT "area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "closureSignatureId", "createdAt", "createdBy", "createdById", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "previousCAPAId", "productQualityImpact", "rcaMethod", "reference", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt" FROM "Deviation";
DROP TABLE "Deviation";
ALTER TABLE "new_Deviation" RENAME TO "Deviation";
CREATE UNIQUE INDEX "Deviation_reference_key" ON "Deviation"("reference");
CREATE UNIQUE INDEX "Deviation_closureSignatureId_key" ON "Deviation"("closureSignatureId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
