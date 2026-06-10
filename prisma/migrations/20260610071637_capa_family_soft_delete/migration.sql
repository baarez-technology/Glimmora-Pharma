-- AlterTable
ALTER TABLE "CAPA" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CAPA" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "CAPA" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "CAPA" ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "CAPAActionItem" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CAPAActionItem" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "CAPAActionItem" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "CAPAActionItem" ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "CAPAEffectivenessCriterion" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CAPAEffectivenessCriterion" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "CAPAEffectivenessCriterion" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "CAPAEffectivenessCriterion" ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "Deviation" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Deviation" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Deviation" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "Deviation" ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Finding" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Finding" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "Finding" ADD COLUMN "deletionReason" TEXT;

-- CreateIndex
CREATE INDEX "CAPA_deletedAt_idx" ON "CAPA"("deletedAt");

-- CreateIndex
CREATE INDEX "CAPAActionItem_deletedAt_idx" ON "CAPAActionItem"("deletedAt");

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_deletedAt_idx" ON "CAPAEffectivenessCriterion"("deletedAt");

-- CreateIndex
CREATE INDEX "Deviation_deletedAt_idx" ON "Deviation"("deletedAt");

-- CreateIndex
CREATE INDEX "Finding_deletedAt_idx" ON "Finding"("deletedAt");
