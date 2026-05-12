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
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPA_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPA_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CAPA" ("alignmentNotes", "alignmentOverrideAt", "alignmentOverrideBy", "alignmentOverrideById", "alignmentOverrideReason", "alignmentReviewedAt", "alignmentReviewedBy", "alignmentReviewedById", "alignmentStatus", "ccBlockOverrideAt", "ccBlockOverrideById", "ccBlockOverrideByName", "ccBlockOverrideReason", "closedAt", "closedBy", "correctiveActions", "createdAt", "createdBy", "description", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaMethod", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt") SELECT "alignmentNotes", "alignmentOverrideAt", "alignmentOverrideBy", "alignmentOverrideById", "alignmentOverrideReason", "alignmentReviewedAt", "alignmentReviewedBy", "alignmentReviewedById", "alignmentStatus", "ccBlockOverrideAt", "ccBlockOverrideById", "ccBlockOverrideByName", "ccBlockOverrideReason", "closedAt", "closedBy", "correctiveActions", "createdAt", "createdBy", "description", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaMethod", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt" FROM "CAPA";
DROP TABLE "CAPA";
ALTER TABLE "new_CAPA" RENAME TO "CAPA";
CREATE UNIQUE INDEX "CAPA_reference_key" ON "CAPA"("reference");
CREATE UNIQUE INDEX "CAPA_findingId_key" ON "CAPA"("findingId");
CREATE UNIQUE INDEX "CAPA_closureSignatureId_key" ON "CAPA"("closureSignatureId");
CREATE TABLE "new_ChangeControl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "impactAssessment" TEXT,
    "affectedSystems" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "owner" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "targetImplementationDate" DATETIME,
    "actualImplementationDate" DATETIME,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "closedByName" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "latestSignedTransitionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeControl_latestSignedTransitionId_fkey" FOREIGN KEY ("latestSignedTransitionId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChangeControl" ("actualImplementationDate", "affectedSystems", "changeType", "closedAt", "closedById", "closedByName", "createdAt", "createdBy", "createdByName", "deletedAt", "deletedById", "deletedByName", "deletionReason", "description", "id", "impactAssessment", "owner", "ownerName", "rationale", "reference", "risk", "status", "targetImplementationDate", "tenantId", "title", "updatedAt") SELECT "actualImplementationDate", "affectedSystems", "changeType", "closedAt", "closedById", "closedByName", "createdAt", "createdBy", "createdByName", "deletedAt", "deletedById", "deletedByName", "deletionReason", "description", "id", "impactAssessment", "owner", "ownerName", "rationale", "reference", "risk", "status", "targetImplementationDate", "tenantId", "title", "updatedAt" FROM "ChangeControl";
DROP TABLE "ChangeControl";
ALTER TABLE "new_ChangeControl" RENAME TO "ChangeControl";
CREATE UNIQUE INDEX "ChangeControl_reference_key" ON "ChangeControl"("reference");
CREATE INDEX "ChangeControl_tenantId_status_idx" ON "ChangeControl"("tenantId", "status");
CREATE INDEX "ChangeControl_tenantId_createdAt_idx" ON "ChangeControl"("tenantId", "createdAt");
CREATE INDEX "ChangeControl_deletedAt_idx" ON "ChangeControl"("deletedAt");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deviation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deviation" ("area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "createdAt", "createdBy", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "productQualityImpact", "rcaMethod", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt") SELECT "area", "batchesAffected", "category", "closedBy", "closedDate", "closureNotes", "createdAt", "createdBy", "description", "detectedBy", "detectedDate", "dueDate", "id", "immediateAction", "linkedCAPAId", "owner", "patientSafetyImpact", "productQualityImpact", "rcaMethod", "regulatoryImpact", "rootCause", "severity", "siteId", "status", "tenantId", "title", "type", "updatedAt" FROM "Deviation";
DROP TABLE "Deviation";
ALTER TABLE "new_Deviation" RENAME TO "Deviation";
CREATE UNIQUE INDEX "Deviation_closureSignatureId_key" ON "Deviation"("closureSignatureId");
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "linkedModule" TEXT,
    "linkedRecordId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceModule" TEXT,
    "sourceId" TEXT,
    "siteId" TEXT,
    "category" TEXT,
    "sha256" TEXT,
    "storageKey" TEXT,
    "originalFileName" TEXT,
    "fileExtension" TEXT,
    "retainUntil" DATETIME,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "notes" TEXT,
    "uploadedAt" DATETIME,
    "approvalSignatureId" TEXT,
    CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_approvalSignatureId_fkey" FOREIGN KEY ("approvalSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("approvedAt", "approvedBy", "category", "createdAt", "deletedAt", "deletedBy", "deletionReason", "description", "fileExtension", "fileName", "fileSize", "fileType", "id", "linkedModule", "linkedRecordId", "notes", "originalFileName", "retainUntil", "sha256", "siteId", "sourceId", "sourceModule", "status", "storageKey", "tenantId", "updatedAt", "uploadedAt", "uploadedBy", "version") SELECT "approvedAt", "approvedBy", "category", "createdAt", "deletedAt", "deletedBy", "deletionReason", "description", "fileExtension", "fileName", "fileSize", "fileType", "id", "linkedModule", "linkedRecordId", "notes", "originalFileName", "retainUntil", "sha256", "siteId", "sourceId", "sourceModule", "status", "storageKey", "tenantId", "updatedAt", "uploadedAt", "uploadedBy", "version" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_approvalSignatureId_key" ON "Document"("approvalSignatureId");
CREATE INDEX "Document_tenantId_sourceModule_sourceId_idx" ON "Document"("tenantId", "sourceModule", "sourceId");
CREATE INDEX "Document_tenantId_uploadedAt_idx" ON "Document"("tenantId", "uploadedAt");
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
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
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FDA483Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_responseSignatureId_fkey" FOREIGN KEY ("responseSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FDA483Event" ("agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "referenceNumber", "responseDeadline", "responseDraft", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt") SELECT "agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "referenceNumber", "responseDeadline", "responseDraft", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt" FROM "FDA483Event";
DROP TABLE "FDA483Event";
ALTER TABLE "new_FDA483Event" RENAME TO "FDA483Event";
CREATE UNIQUE INDEX "FDA483Event_responseSignatureId_key" ON "FDA483Event"("responseSignatureId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
