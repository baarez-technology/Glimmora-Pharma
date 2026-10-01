"""Execute the severity-taxonomy migration against a real Postgres, inside a
transaction that is rolled back.

Stands in for a staging deploy. Exists because hand-written SQL that is never run is
a guess: this migration already had two defects that only executing it could reveal -
a CASE written in simple form where a searched form was needed, and a backfill that
handled lowercase but not upper-case. Both are caught here in seconds and would
otherwise have surfaced as a failed production deploy.

Nothing persists: the tables are TEMP and the transaction is rolled back.

Usage: python scripts/try_severity_migration.py
"""
from __future__ import annotations

import pathlib
import re
import sys

import psycopg2

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = (
    ROOT / "prisma" / "migrations" / "20260930120000_add_severity_taxonomy_constraints"
    / "migration.sql"
)

TEMP_TABLES = """
CREATE TEMP TABLE "Deviation"         (id int primary key, "severity" text);
CREATE TEMP TABLE "CAPA"              (id int primary key, "risk" text);
CREATE TEMP TABLE "Finding"           (id int primary key, "severity" text);
CREATE TEMP TABLE "Risk"              (id int primary key, "severity" text);
CREATE TEMP TABLE "FDA483Observation" (id int primary key, "severity" text);
CREATE TEMP TABLE "ChangeControl"     (id int primary key, "risk" text);
"""

# Representative rows: clean Title Case, lowercase, upper-case, and padded - the
# shapes a hand-entered or cross-written value actually takes.
SEED = [
    ('INSERT INTO "Deviation" VALUES (%s,%s)',
     [(1, "Critical"), (2, "Major"), (3, "Minor"), (4, "critical"), (5, "  MAJOR  ")]),
    ('INSERT INTO "CAPA" VALUES (%s,%s)',
     [(1, "Critical"), (2, "High"), (3, "low"), (4, "MEDIUM")]),
    ('INSERT INTO "Finding" VALUES (%s,%s)',
     [(1, "High"), (2, "MEDIUM"), (3, "critical")]),
    ('INSERT INTO "Risk" VALUES (%s,%s)', [(1, "Critical"), (2, "LOW")]),
    ('INSERT INTO "FDA483Observation" VALUES (%s,%s)',
     [(1, "Critical"), (2, "High"), (3, "Low"), (4, "medium")]),
    ('INSERT INTO "ChangeControl" VALUES (%s,%s)', [(1, "Medium")]),
]

BACKFILL_EXPECTED = [
    ("Deviation", "severity", 4, "Critical"),
    ("Deviation", "severity", 5, "Major"),      # padded AND upper-case
    ("CAPA", "risk", 3, "Low"),
    ("CAPA", "risk", 4, "Medium"),
    ("Finding", "severity", 2, "Medium"),
    ("Finding", "severity", 3, "Critical"),
    ("Risk", "severity", 2, "Low"),
    ("FDA483Observation", "severity", 4, "Medium"),
]

MUST_REJECT = [
    ("Deviation.severity = 'High'", 'INSERT INTO "Deviation" VALUES (%s,%s)', (90, "High")),
    ("Deviation.severity = 'critical'", 'INSERT INTO "Deviation" VALUES (%s,%s)', (91, "critical")),
    ("CAPA.risk = 'Major'", 'INSERT INTO "CAPA" VALUES (%s,%s)', (90, "Major")),
    ("CAPA.risk = 'CRITICAL'", 'INSERT INTO "CAPA" VALUES (%s,%s)', (91, "CRITICAL")),
    ("Finding.severity = 'Major'", 'INSERT INTO "Finding" VALUES (%s,%s)', (90, "Major")),
    ("Risk.severity = 'MinorX'", 'INSERT INTO "Risk" VALUES (%s,%s)', (90, "MinorX")),
    ("ChangeControl.risk = 'Major'", 'INSERT INTO "ChangeControl" VALUES (%s,%s)', (90, "Major")),
]

MUST_ACCEPT = [
    ("Deviation.severity = 'Minor'", 'INSERT INTO "Deviation" VALUES (%s,%s)', (95, "Minor")),
    ("CAPA.risk = 'Medium'", 'INSERT INTO "CAPA" VALUES (%s,%s)', (95, "Medium")),
    ("FDA483Observation.severity = 'High'", 'INSERT INTO "FDA483Observation" VALUES (%s,%s)', (95, "High")),
]

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + (f"   {detail}" if detail else ""))
    if not condition:
        failures.append(label)


def main() -> int:
    env = (ROOT.parent / "pharma_glimmora_ai_backend" / ".env").read_text(encoding="utf-8")
    url = re.search(r"^TEST_DATABASE_URL\s*=\s*(.+)$", env, re.M).group(1)
    url = url.strip().strip('"').strip("'")
    sql = MIGRATION.read_text(encoding="utf-8")

    con = psycopg2.connect(url)
    con.autocommit = False
    cur = con.cursor()
    try:
        for stmt in [s.strip() for s in TEMP_TABLES.split(";") if s.strip()]:
            cur.execute(stmt)
        for stmt, rows in SEED:
            for row in rows:
                cur.execute(stmt, row)

        cur.execute(sql)
        print("MIGRATION APPLIED OK\n")

        print("backfill normalisation:")
        for tbl, col, rid, expected in BACKFILL_EXPECTED:
            cur.execute(f'SELECT "{col}" FROM "{tbl}" WHERE id = %s', (rid,))
            got = cur.fetchone()[0]
            ok(f"{tbl}.{col} #{rid} -> {expected!r}", got == expected, f"got {got!r}")

        cur.execute(
            "SELECT conname FROM pg_constraint WHERE conname LIKE '%\\_taxonomy' ORDER BY conname"
        )
        names = [r[0] for r in cur.fetchall()]
        print(f"\nconstraints created: {len(names)} (expected 6)")
        ok("six CHECK constraints exist", len(names) == 6, ", ".join(names))

        print("\nvalues the constraint must reject:")
        for label, stmt, params in MUST_REJECT:
            # A CHECK violation ABORTS the whole transaction in Postgres, so every
            # probe gets its own savepoint. Without this the first expected failure
            # poisons every later assertion and the harness reports nonsense.
            cur.execute("SAVEPOINT probe")
            try:
                cur.execute(stmt, params)
                ok(label, False, "was ACCEPTED")
            except psycopg2.Error:
                ok(label, True)
            finally:
                cur.execute("ROLLBACK TO SAVEPOINT probe")

        print("\nvalid values the constraint must still accept:")
        for label, stmt, params in MUST_ACCEPT:
            cur.execute("SAVEPOINT probe")
            try:
                cur.execute(stmt, params)
                ok(label, True)
            except psycopg2.Error as e:
                ok(label, False, str(e).strip())
            finally:
                cur.execute("ROLLBACK TO SAVEPOINT probe")

        con.rollback()
    finally:
        con.close()

    print()
    if failures:
        print(f"FAIL: {len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK - the migration is valid SQL with the intended behaviour. Rolled back; nothing persisted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())