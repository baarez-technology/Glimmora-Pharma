/**
 * Create the four single-QA SoD override tables in the LOCAL SQLite dev database.
 *
 * Why this exists
 * ---------------
 * The local dev database (prisma/dev.db, restored from prisma/dev.db.bak) predates the
 * migrations that added the SoD override tables, so all four are ABSENT:
 *
 *     CAPASODOverride  DeviationSODOverride  FindingSODOverride  SystemStageSODOverride
 *
 * That means the single-QA override WRITE path cannot be exercised locally at all —
 * which is why it shipped marked UNVERIFIED (docs/REFACTORING-ARCHITECTURE.md §8.8).
 *
 * Why not `prisma db push`
 * ------------------------
 * Because the diff between this dev database and the current model is not additive.
 * `prisma migrate diff` against prisma/schema.dev-sqlite.prisma reports it would:
 *   - CREATE 10 tables (these 4 plus Subscription/Plan/Payment/TenantRegion/AgiPolicy)
 *   - DROP   CAPADocument, ReadinessCard          (dead models, already removed upstream)
 *   - REBUILD Tenant, Site, Finding, Notification (SQLite's copy-and-swap ALTER path)
 *
 * Rebuilding four core tables re-inserts every row, so `db push` on a seeded dev
 * database is a genuinely destructive operation — which is exactly what Prisma's
 * `--accept-data-loss` gate is protecting against. It is the right gate.
 *
 * This script therefore applies ONLY the four additive tables, using the DDL Prisma
 * itself generated, and never touches an existing table. It is additive by
 * construction: no DROP, no ALTER, no rebuild.
 *
 * Local dev database only. Never point this at Postgres — `db push` is forbidden
 * against the shared Neon instance because it drops the tables the FastAPI service
 * owns (see .do/app.yaml and be:app/main.py).
 *
 * Usage: node scripts/ensure-sod-tables.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = join(root, "prisma", "dev.db");

const TABLES = [
  "CAPASODOverride",
  "DeviationSODOverride",
  "FindingSODOverride",
  "SystemStageSODOverride",
];

/** Exactly the DDL `prisma migrate diff` emits for these four tables under the
 *  sqlite provider. Kept literal so the script has no dependency on the Prisma CLI
 *  and cannot drift into touching anything it should not. */
const DDL = {
  CAPASODOverride: `CREATE TABLE "CAPASODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPASODOverride_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPASODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  DeviationSODOverride: `CREATE TABLE "DeviationSODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviationSODOverride_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviationSODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  FindingSODOverride: `CREATE TABLE "FindingSODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingSODOverride_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FindingSODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  SystemStageSODOverride: `CREATE TABLE "SystemStageSODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemStageSODOverride_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SystemStageSODOverride_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ValidationStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SystemStageSODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
};

if (!existsSync(DB)) {
  console.error(
    `[sod-tables] ${DB} not found.\n` +
      "  The local dev database is gitignored. Restore it from prisma/dev.db.bak,\n" +
      "  or run `npm run db:seed` against a fresh one.",
  );
  process.exit(1);
}

const db = new DatabaseSync(DB);
db.exec("PRAGMA foreign_keys = ON;");

const existing = new Set(
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name),
);

let created = 0;
let skipped = 0;
for (const t of TABLES) {
  if (existing.has(t)) {
    console.log(`[sod-tables] ${t}: already present`);
    skipped++;
    continue;
  }
  db.exec(DDL[t]);
  console.log(`[sod-tables] ${t}: created`);
  created++;
}

db.close();
console.log(
  `\n[sod-tables] done. created=${created} alreadyPresent=${skipped}\n` +
    "  No existing table was altered or dropped. Local SQLite dev database only.",
);
