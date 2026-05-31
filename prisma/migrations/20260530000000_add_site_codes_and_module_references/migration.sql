-- AlterTable
ALTER TABLE "Site" ADD COLUMN "code" TEXT;

-- AlterTable
ALTER TABLE "Deviation" ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "FDA483Observation" ADD COLUMN "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Site_tenantId_code_key" ON "Site"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Deviation_reference_key" ON "Deviation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_reference_key" ON "Finding"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "FDA483Observation_reference_key" ON "FDA483Observation"("reference");
