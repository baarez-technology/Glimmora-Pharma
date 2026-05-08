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
    "effectivenessCheck" BOOLEAN NOT NULL DEFAULT false,
    "effectivenessDate" DATETIME,
    "diGate" BOOLEAN NOT NULL DEFAULT false,
    "diGateStatus" TEXT,
    "diGateNotes" TEXT,
    "diGateReviewedBy" TEXT,
    "diGateReviewDate" DATETIME,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPA_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPA_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CAPA" ("closedAt", "closedBy", "correctiveActions", "createdAt", "createdBy", "description", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaMethod", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt") SELECT "closedAt", "closedBy", "correctiveActions", "createdAt", "createdBy", "description", "diGate", "diGateNotes", "diGateReviewDate", "diGateReviewedBy", "diGateStatus", "dueDate", "effectivenessCheck", "effectivenessDate", "findingId", "id", "owner", "rca", "rcaMethod", "reference", "risk", "siteId", "source", "status", "tenantId", "updatedAt" FROM "CAPA";
DROP TABLE "CAPA";
ALTER TABLE "new_CAPA" RENAME TO "CAPA";
CREATE UNIQUE INDEX "CAPA_reference_key" ON "CAPA"("reference");
CREATE UNIQUE INDEX "CAPA_findingId_key" ON "CAPA"("findingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
