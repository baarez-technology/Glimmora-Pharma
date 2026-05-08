-- CreateTable
CREATE TABLE "CAPAEffectivenessCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetMetric" TEXT NOT NULL,
    "measurementMethod" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "monitoringPeriod" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lockedSignatureId" TEXT,
    CONSTRAINT "CAPAEffectivenessCriterion_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_tenantId_capaId_idx" ON "CAPAEffectivenessCriterion"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_capaId_idx" ON "CAPAEffectivenessCriterion"("capaId");
