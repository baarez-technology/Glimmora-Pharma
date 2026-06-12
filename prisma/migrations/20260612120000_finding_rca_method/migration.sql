-- Gap RCA (Batch B) — method-driven root-cause for findings, mirroring CAPA.
-- Additive, nullable columns; existing rows get NULL (their rootCause text still
-- displays — no backfill). `rcaDetail` holds the structured analysis as JSON
-- text; `rootCause` remains the readable mirror. Postgres- & SQLite-portable.
ALTER TABLE "Finding" ADD COLUMN "rcaMethod" TEXT;
ALTER TABLE "Finding" ADD COLUMN "rcaDetail" TEXT;
