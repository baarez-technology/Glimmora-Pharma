-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GxPSystem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "vendor" TEXT,
    "version" TEXT,
    "gxpRelevance" TEXT NOT NULL DEFAULT 'Major',
    "part11Status" TEXT NOT NULL DEFAULT 'N/A',
    "annex11Status" TEXT NOT NULL DEFAULT 'N/A',
    "gamp5Category" TEXT NOT NULL DEFAULT '4',
    "validationStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "siteId" TEXT,
    "intendedUse" TEXT,
    "gxpScope" TEXT,
    "plannedActions" TEXT,
    "owner" TEXT,
    "createdBy" TEXT NOT NULL,
    "patientSafetyRisk" TEXT,
    "productQualityImpact" TEXT,
    "regulatoryExposure" TEXT,
    "diImpact" TEXT,
    "criticalFunctions" TEXT,
    "riskFactors" TEXT,
    "lastValidated" DATETIME,
    "nextReview" DATETIME,
    "remediationPlan" TEXT,
    "remediationStatus" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "statusManuallySet" BOOLEAN NOT NULL DEFAULT false,
    "statusManualReason" TEXT,
    "statusManuallySetAt" DATETIME,
    "statusManuallySetByName" TEXT,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GxPSystem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GxPSystem" ("annex11Status", "createdAt", "createdBy", "gamp5Category", "gxpRelevance", "gxpScope", "id", "intendedUse", "name", "owner", "part11Status", "plannedActions", "riskLevel", "siteId", "tenantId", "type", "updatedAt", "validationStatus", "vendor", "version") SELECT "annex11Status", "createdAt", "createdBy", "gamp5Category", "gxpRelevance", "gxpScope", "id", "intendedUse", "name", "owner", "part11Status", "plannedActions", "riskLevel", "siteId", "tenantId", "type", "updatedAt", "validationStatus", "vendor", "version" FROM "GxPSystem";
DROP TABLE "GxPSystem";
ALTER TABLE "new_GxPSystem" RENAME TO "GxPSystem";
CREATE UNIQUE INDEX "GxPSystem_reference_key" ON "GxPSystem"("reference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
