-- Canonicalize legacy snake_case Finding.status values to Title Case.
-- FindingStatus = "Open" | "In Progress" | "Closed". The raise-CAPA path
-- (createCAPA) previously wrote "in_progress", which rendered raw in the UI
-- (statusBadge prints the stored value). This normalizes already-corrupted
-- rows. The 'open'/'closed' updates are defensive (0 rows expected) so any
-- other accidental snake_case is also healed. Postgres- and SQLite-portable.
UPDATE "Finding" SET "status" = 'In Progress' WHERE "status" = 'in_progress';
UPDATE "Finding" SET "status" = 'Open' WHERE "status" = 'open';
UPDATE "Finding" SET "status" = 'Closed' WHERE "status" = 'closed';
