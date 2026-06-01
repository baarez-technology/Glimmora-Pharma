-- RUNG 2.8 — stage identity ids (server-side self-approval SoD guardrail) +
-- rejectedDate, and a generated per-site URS reference on RTMEntry.

-- AlterTable: ValidationStage
ALTER TABLE "ValidationStage" ADD COLUMN "rejectedDate" DATETIME;
ALTER TABLE "ValidationStage" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "ValidationStage" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "ValidationStage" ADD COLUMN "rejectedById" TEXT;

-- AlterTable: RTMEntry
ALTER TABLE "RTMEntry" ADD COLUMN "reference" TEXT;

-- CreateIndex (nullable unique — SQLite treats NULLs as distinct, so the
-- existing all-null rows do not collide).
CREATE UNIQUE INDEX "RTMEntry_reference_key" ON "RTMEntry"("reference");
