-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CAPA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "findingId" TEXT,
    "source" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rca" TEXT,
    "rcaMethod" TEXT,
    "correctiveActions" TEXT,
    "alignmentStatus" TEXT,
    "alignmentReviewedBy" TEXT,
    "alignmentReviewedById" TEXT,
    "alignmentReviewedAt" DATETIME,
    "alignmentNotes" TEXT,
    "alignmentOverrideBy" TEXT,
    "alignmentOverrideById" TEXT,
    "alignmentOverrideAt" DATETIME,
    "alignmentOverrideReason" TEXT,
    "rcaApproved" BOOLEAN,
    "rcaReviewedBy" TEXT,
    "rcaReviewedById" TEXT,
    "rcaReviewedAt" DATETIME,
    "rcaReviewNotes" TEXT,
    "rcaOverrideBy" TEXT,
    "rcaOverrideById" TEXT,
    "rcaOverrideAt" DATETIME,
    "rcaOverrideReason" TEXT,
    "verifiedBy" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "verificationNotes" TEXT,
    "verificationSignatureId" TEXT,
    "effectivenessCheck" BOOLEAN NOT NULL DEFAULT false,
    "effectivenessDate" DATETIME,
    "diGate" BOOLEAN NOT NULL DEFAULT false,
    "diGateStatus" TEXT,
    "diGateNotes" TEXT,
    "diGateReviewedBy" TEXT,
    "diGateReviewDate" DATETIME,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "ccBlockOverrideReason" TEXT,
    "ccBlockOverrideById" TEXT,
    "ccBlockOverrideByName" TEXT,
    "ccBlockOverrideAt" DATETIME,
    "closureSignatureId" TEXT,
    "deviationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPA_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPA_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_verificationSignatureId_fkey" FOREIGN KEY ("verificationSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CAPA" ("alignmentNotes", "alignmentOverrideAt", "alignmentOverrideBy", "alignmentOverrideById", "alignmentOverrideReason", "alignmentReviewedAt", "alignmentReviewedBy", "alignmentReviewedById", "alignmentStatus", "ccBlockOverrideAt", "ccBlockOverrideById", "ccBlockOverrideByName", "ccBlockOverrideReason", "closedAt", "closedBy", "closureSignatureId", "correctiveActions", "createdAt", "createdBy", "description", "deviationId", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaApproved", "rcaMethod", "rcaOverrideAt", "rcaOverrideBy", "rcaOverrideById", "rcaOverrideReason", "rcaReviewNotes", "rcaReviewedAt", "rcaReviewedBy", "rcaReviewedById", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt") SELECT "alignmentNotes", "alignmentOverrideAt", "alignmentOverrideBy", "alignmentOverrideById", "alignmentOverrideReason", "alignmentReviewedAt", "alignmentReviewedBy", "alignmentReviewedById", "alignmentStatus", "ccBlockOverrideAt", "ccBlockOverrideById", "ccBlockOverrideByName", "ccBlockOverrideReason", "closedAt", "closedBy", "closureSignatureId", "correctiveActions", "createdAt", "createdBy", "description", "deviationId", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaApproved", "rcaMethod", "rcaOverrideAt", "rcaOverrideBy", "rcaOverrideById", "rcaOverrideReason", "rcaReviewNotes", "rcaReviewedAt", "rcaReviewedBy", "rcaReviewedById", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt" FROM "CAPA";
DROP TABLE "CAPA";
ALTER TABLE "new_CAPA" RENAME TO "CAPA";
CREATE UNIQUE INDEX "CAPA_reference_key" ON "CAPA"("reference");
CREATE UNIQUE INDEX "CAPA_findingId_key" ON "CAPA"("findingId");
CREATE UNIQUE INDEX "CAPA_verificationSignatureId_key" ON "CAPA"("verificationSignatureId");
CREATE UNIQUE INDEX "CAPA_closureSignatureId_key" ON "CAPA"("closureSignatureId");
CREATE UNIQUE INDEX "CAPA_deviationId_key" ON "CAPA"("deviationId");
CREATE TABLE "new_Deviation" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deviation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deviation" ("area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "closureSignatureId", "createdAt", "createdBy", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "productQualityImpact", "rcaMethod", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt") SELECT "area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "closureSignatureId", "createdAt", "createdBy", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "productQualityImpact", "rcaMethod", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt" FROM "Deviation";
DROP TABLE "Deviation";
ALTER TABLE "new_Deviation" RENAME TO "Deviation";
CREATE UNIQUE INDEX "Deviation_closureSignatureId_key" ON "Deviation"("closureSignatureId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
