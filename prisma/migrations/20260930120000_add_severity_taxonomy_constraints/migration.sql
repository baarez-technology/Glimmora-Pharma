-- Severity and risk taxonomy constraints.
--
-- WHY
--   Every severity column in this schema is a bare String, so the database cannot say
--   what values are legal (64 models, 0 enums). That is not academic: the SoD
--   override ceiling and the Critical-CAPA gate both normalised a severity and compared
--   it for EQUALITY against a known label, so any value outside the taxonomy compared
--   unequal and the control was skipped. For the Critical-CAPA gate that meant a
--   MANDATORY control silently disappeared - a deviation could close with no linked
--   CAPA because its severity happened to be spelled "High".
--
--   The application now fails closed on an unrecognised severity. This migration makes
--   that condition unreachable rather than merely handled: the value cannot be stored
--   in the first place.
--
-- TAXONOMIES ARE DELIBERATELY NOT UNIFIED
--   Deviation.severity is FDA vocabulary (Critical / Major / Minor) because a deviation
--   is a regulatory observation and FDA's own CGMP deficiency vocabulary is
--   Critical/Major/Minor - see src/lib/severity.ts, which states the two scales are
--   NOT interchangeable.
--   FDA483Observation.severity is GENERIC (Critical / High / Medium / Low) by an
--   earlier deliberate decision ("Cat 1 unification") recorded in src/types/fda483.ts.
--   Both are correct for the kind of record they describe; this migration encodes each
--   column's ACTUAL taxonomy rather than flattening them.
--
--   GxPSystem.riskLevel is deliberately NOT constrained here. It is an ICH-Q9 risk
--   assessment level (HIGH / MEDIUM / LOW, upper case), read by direct string
--   comparison in src/lib/kpi/records.ts isCsvHighRisk - not a member of either
--   severity taxonomy, and not something normalizeSeverityForDisplay ever sees.
--
-- BACKFILL
--   Case normalisation only, and only where it is unambiguous. The application reads
--   severities case-INSENSITIVELY (normalizeSeverityForDisplay lowercases before
--   lookup) but a CHECK constraint is case-SENSITIVE, so without this a value the app
--   considers perfectly valid could be rejected on insert. This system has a recorded
--   history of case drift - Finding.status was found holding lowercase "closed" - so
--   the normalisation is real work, not defensive decoration.
--
--   It deliberately does NOT map one taxonomy onto another. If a Deviation ever holds
--   "High", choosing Major over Minor is a judgement about a regulated record, and
--   making it silently in a migration is exactly the kind of change nobody can
--   evidence later. The guard below aborts instead and names the rows.
--
-- AUDITED BEFORE WRITING
--   Every column below was read against its own taxonomy and is clean:
--     Deviation.severity            7/7      CAPA.risk                16/16
--     Finding.severity            12/12      Risk.severity              1/1
--     FDA483Observation.severity  15/15      ChangeControl.risk          0 (empty)
--   Production was confirmed to hold the same data as the local development database.

-- ── 1. Backfill: normalise casing to the canonical label ─────────────────────

UPDATE "Deviation"
SET "severity" = CASE
    WHEN lower(btrim("severity")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("severity")) = 'major' THEN 'Major'
    WHEN lower(btrim("severity")) = 'minor' THEN 'Minor'
    ELSE "severity"
END
WHERE "severity" NOT IN ('Critical', 'Major', 'Minor');

UPDATE "CAPA"
SET "risk" = CASE
    WHEN lower(btrim("risk")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("risk")) = 'high' THEN 'High'
    WHEN lower(btrim("risk")) = 'medium' THEN 'Medium'
    WHEN lower(btrim("risk")) = 'low' THEN 'Low'
    ELSE "risk"
END
WHERE "risk" NOT IN ('Critical', 'High', 'Medium', 'Low');

UPDATE "Finding"
SET "severity" = CASE
    WHEN lower(btrim("severity")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("severity")) = 'high' THEN 'High'
    WHEN lower(btrim("severity")) = 'medium' THEN 'Medium'
    WHEN lower(btrim("severity")) = 'low' THEN 'Low'
    ELSE "severity"
END
WHERE "severity" NOT IN ('Critical', 'High', 'Medium', 'Low');

UPDATE "Risk"
SET "severity" = CASE
    WHEN lower(btrim("severity")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("severity")) = 'high' THEN 'High'
    WHEN lower(btrim("severity")) = 'medium' THEN 'Medium'
    WHEN lower(btrim("severity")) = 'low' THEN 'Low'
    ELSE "severity"
END
WHERE "severity" NOT IN ('Critical', 'High', 'Medium', 'Low');

UPDATE "FDA483Observation"
SET "severity" = CASE
    WHEN lower(btrim("severity")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("severity")) = 'high' THEN 'High'
    WHEN lower(btrim("severity")) = 'medium' THEN 'Medium'
    WHEN lower(btrim("severity")) = 'low' THEN 'Low'
    ELSE "severity"
END
WHERE "severity" NOT IN ('Critical', 'High', 'Medium', 'Low');

UPDATE "ChangeControl"
SET "risk" = CASE
    WHEN lower(btrim("risk")) = 'critical' THEN 'Critical'
    WHEN lower(btrim("risk")) = 'high' THEN 'High'
    WHEN lower(btrim("risk")) = 'medium' THEN 'Medium'
    WHEN lower(btrim("risk")) = 'low' THEN 'Low'
    ELSE "risk"
END
WHERE "risk" NOT IN ('Critical', 'High', 'Medium', 'Low');

DO $$
DECLARE
    offenders TEXT;
BEGIN
    SELECT string_agg(DISTINCT v, ', ') INTO offenders
    FROM (SELECT DISTINCT "severity" AS v FROM "Deviation") s
    WHERE v NOT IN ('Critical', 'Major', 'Minor');
    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION
            'Deviation.severity holds values outside the FDA taxonomy (Critical/Major/Minor): % . '
            'Decide each mapping by hand and re-run; this migration will not choose for you.', offenders;
    END IF;

    SELECT string_agg(DISTINCT v, ', ') INTO offenders FROM (
        SELECT DISTINCT "risk" AS v FROM "CAPA"
        UNION SELECT DISTINCT "risk" FROM "ChangeControl"
    ) s WHERE v NOT IN ('Critical', 'High', 'Medium', 'Low');
    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION
            'CAPA.risk / ChangeControl.risk hold values outside the generic taxonomy (Critical/High/Medium/Low): %', offenders;
    END IF;

    SELECT string_agg(DISTINCT v, ', ') INTO offenders FROM (
        SELECT DISTINCT "severity" AS v FROM "Finding"
        UNION SELECT DISTINCT "severity" AS v FROM "Risk"
        UNION SELECT DISTINCT "severity" AS v FROM "FDA483Observation"
    ) s WHERE v NOT IN ('Critical', 'High', 'Medium', 'Low');
    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION
            'Finding.severity / Risk.severity / FDA483Observation.severity hold values outside the generic taxonomy (Critical/High/Medium/Low): %', offenders;
    END IF;
END $$;

-- ── 3. Constraints ───────────────────────────────────────────────────────────

-- FDA taxonomy: regulatory observation vocabulary.
ALTER TABLE "Deviation"
    ADD CONSTRAINT "Deviation_severity_taxonomy"
    CHECK ("severity" IN ('Critical', 'Major', 'Minor'));

-- Generic taxonomy: internal quality-management vocabulary.
ALTER TABLE "CAPA"
    ADD CONSTRAINT "CAPA_risk_taxonomy"
    CHECK ("risk" IN ('Critical', 'High', 'Medium', 'Low'));

ALTER TABLE "Finding"
    ADD CONSTRAINT "Finding_severity_taxonomy"
    CHECK ("severity" IN ('Critical', 'High', 'Medium', 'Low'));

ALTER TABLE "Risk"
    ADD CONSTRAINT "Risk_severity_taxonomy"
    CHECK ("severity" IN ('Critical', 'High', 'Medium', 'Low'));

ALTER TABLE "FDA483Observation"
    ADD CONSTRAINT "FDA483Observation_severity_taxonomy"
    CHECK ("severity" IN ('Critical', 'High', 'Medium', 'Low'));

ALTER TABLE "ChangeControl"
    ADD CONSTRAINT "ChangeControl_risk_taxonomy"
    CHECK ("risk" IN ('Critical', 'High', 'Medium', 'Low'));

-- ── OPERATIONAL NOTE ──────────────────────────────────────────────────────────
--
-- Prisma's schema language cannot express CHECK constraints, so these are unmanaged:
-- they live only in this migration and not in prisma/schema.prisma. Consequences:
--
--   * `prisma migrate deploy` (CI, and .do/app.yaml) applies them. Correct.
--   * `prisma migrate dev` may report the database as drifted, because it reconciles
--     against schema.prisma and cannot see these constraints. Do NOT "fix" that by
--     letting it drop them; prefer `migrate deploy`, which this repository already
--     uses everywhere that matters.
--   * The local SQLite development database does NOT get these constraints. Its schema
--     is created from the generated client (npm run db:generate:dev), not from this
--     chain. Local protection comes from the application-level fail-closed check, which
--     is why that check was shipped first rather than relying on the database alone.