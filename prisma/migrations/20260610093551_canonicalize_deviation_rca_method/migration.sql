-- Phase 1.5 — RCA-method enum unification (data migration).
-- Deviation.rcaMethod drifted to no-space values; map them to the canonical
-- spaced form now used by every module. Additive + Postgres-portable.
-- (CAPA + FDA483Observation already store canonical values — untouched.)
UPDATE "Deviation" SET "rcaMethod" = '5 Why'            WHERE "rcaMethod" = '5Why';
UPDATE "Deviation" SET "rcaMethod" = 'Fault Tree'       WHERE "rcaMethod" = 'FaultTree';
UPDATE "Deviation" SET "rcaMethod" = 'Barrier Analysis' WHERE "rcaMethod" = 'BarrierAnalysis';
