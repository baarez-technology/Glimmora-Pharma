-- CreateTable
CREATE TABLE "ChangeControl" (
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
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CAPAChangeControlLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "changeControlId" TEXT NOT NULL,
    "initiatedFrom" TEXT NOT NULL,
    "linkRationale" TEXT,
    "linkedById" TEXT NOT NULL,
    "linkedByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPAChangeControlLink_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAChangeControlLink_changeControlId_fkey" FOREIGN KEY ("changeControlId") REFERENCES "ChangeControl" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeControl_reference_key" ON "ChangeControl"("reference");

-- CreateIndex
CREATE INDEX "ChangeControl_tenantId_status_idx" ON "ChangeControl"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ChangeControl_tenantId_createdAt_idx" ON "ChangeControl"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeControl_deletedAt_idx" ON "ChangeControl"("deletedAt");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_capaId_idx" ON "CAPAChangeControlLink"("capaId");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_changeControlId_idx" ON "CAPAChangeControlLink"("changeControlId");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_tenantId_idx" ON "CAPAChangeControlLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPAChangeControlLink_capaId_changeControlId_key" ON "CAPAChangeControlLink"("capaId", "changeControlId");
