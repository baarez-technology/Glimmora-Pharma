-- ⚠️ UNVERIFIED — Training & Awareness lifecycle columns, authored without DB
-- access (local dev is SQLite; this lineage targets Neon Postgres). MUST be
-- verified against Postgres before deploy: assign a training record, start it,
-- have the TRAINEE complete it (acknowledgedAt must be set), have QA complete a
-- different one on a trainee's behalf (acknowledgedAt must stay NULL), reassign
-- one, raise a retraining record (supersedesId must point at the original), and
-- confirm the derived overdue state flips on a past dueDate. Do NOT deploy until
-- this passes.
--
-- ⚠️ UNAPPLIED. Never run against any database. Needs a holder of Postgres (Neon)
-- credentials to `prisma migrate deploy`. Stacks on an already-unapplied lineage.
--
-- Module 9 documentation review: the manual was asked to describe a training
-- lifecycle (assigned / reassigned / started / completed / acknowledged /
-- overdue / retraining / reopened / archived) that the model could not express —
-- TrainingRecord held only who, what, status and completedAt.
--
-- Every column is NULLABLE (or defaulted) and additive: existing rows remain
-- valid without a backfill. "overdue" is deliberately NOT a status value — it is
-- derived from dueDate, so it cannot go stale when a due date is extended.

ALTER TABLE "TrainingRecord" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "TrainingRecord" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "assignedByName" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "TrainingRecord" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "TrainingRecord" ADD COLUMN "trainer" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "sopReference" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "sopVersion" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TrainingRecord" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "TrainingRecord" ADD COLUMN "deletionReason" TEXT;

-- updatedAt is NOT NULL in the model. Existing rows have no meaningful update
-- time, so they are seeded from createdAt rather than from now() — dating a
-- historical record to the migration would be a false timestamp on a GxP record.
ALTER TABLE "TrainingRecord" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "TrainingRecord" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "TrainingRecord" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Retraining chain. ON DELETE SET NULL matches the model: deleting a superseded
-- record must not cascade away the retraining that replaced it.
ALTER TABLE "TrainingRecord"
  ADD CONSTRAINT "TrainingRecord_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "TrainingRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TrainingRecord_tenantId_userId_idx" ON "TrainingRecord"("tenantId", "userId");
CREATE INDEX "TrainingRecord_tenantId_status_idx" ON "TrainingRecord"("tenantId", "status");
