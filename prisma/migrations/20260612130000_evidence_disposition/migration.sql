-- Per-evidence QA disposition (Batch) — additive, nullable. A rejected evidence
-- item gets status "REJECTED" (a status VALUE, not a new enum column) plus this
-- who/when/why metadata. Existing rows get NULLs and keep their status. REJECTED
-- is not in capa-readiness RESOLVED_EVIDENCE_STATUSES, so it auto-un-resolves
-- the category with ZERO readiness-logic change. (Provider: sqlite — DATETIME
-- per repo convention; reviewedById/rejectionReason are portable TEXT.)
ALTER TABLE "EvidenceItem" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "EvidenceItem" ADD COLUMN "rejectionReason" TEXT;
