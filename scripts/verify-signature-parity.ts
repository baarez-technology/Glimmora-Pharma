/**
 * Part 11 signature parity harness — READ-ONLY, ORM-free.
 *
 * Answers one question: for every e-signature already in the database, does the
 * CURRENT canonicaliser, fed the record as it stands, reproduce the contentHash
 * that was stored when the record was signed?
 *
 *   MATCH        the hash reproduces
 *   DRIFT        it does not — the signed content changed, the canonicaliser
 *                changed since signing, or the value does not survive the
 *                round-trip. Any of those is a Part 11 finding.
 *   ORPHANED     the record this signature attests to no longer exists. A
 *                different problem from a hash mismatch: nothing to compare
 *                against. In a live database this is a retention/integrity
 *                question; in a seeded dev dump it is usually fixture residue.
 *   UNSUPPORTED  no verifier for this recordType, so nothing is claimed
 *
 * DRIFT and ORPHANED are deliberately distinct. Conflating them turns "this
 * record was deleted" into "this signature was tampered with", and those get
 * very different responses.
 *
 * Why ORM-free: this harness exists to prove a move TO another service
 * (docs/REFACTORING-ARCHITECTURE.md §9.2 #4, §10). A check that runs through
 * Prisma cannot be used to verify the port once Prisma is gone, and would
 * silently change behaviour when it does. So it reads the rows directly. The
 * same input can be fed to a SQLAlchemy implementation and compared to this one.
 *
 * It writes nothing. There is no INSERT/UPDATE/DELETE in this file. The answer
 * must be obtainable against a production export without mutating it.
 *
 * Run:  npx tsx scripts/verify-signature-parity.ts
 *       npx tsx scripts/verify-signature-parity.ts --db prisma/dev.db.bak
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  canonicalizeDeviationClosureContent,
  canonicalizeFDA483ResponseContent,
} from "../src/lib/signing";

type Verdict = "MATCH" | "DRIFT" | "ORPHANED" | "UNSUPPORTED";

type SigRow = {
  id: string;
  recordType: string;
  recordId: string;
  contentHash: string;
  contentSummary: string | null;
  signatureMeaning: string | null;
  createdAt: number | string | null;
};

/** Prisma writes DateTime to SQLite as INTEGER unix milliseconds. Verified:
 *  Deviation.closedDate and SignedRecord.passwordVerifiedAt hold the identical
 *  integer for the same closure, so millisecond precision survives the
 *  round-trip and toISOString() is reproducible. */
function toDate(v: number | string | null): Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return new Date(Number(v));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeContentHash(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The only recordType with both a canonicaliser and a reconstructible input.
 *  `deviations.ts` writes `closedDate: closedAt` and `closureNotes` using the
 *  SAME values passed to canonicalizeDeviationClosureContent, so the signed
 *  input is recoverable from the record. That equality is what makes this
 *  check possible at all. */
function verifyDeviationClosure(
  db: DatabaseSync,
  recordId: string,
): { verdict: Verdict; recomputed: string | null; detail: string } {
  const dev = db
    .prepare("select id, title, severity, rootCause, closureNotes, closedDate from Deviation where id = ?")
    .get(recordId) as Record<string, unknown> | undefined;

  if (!dev) return { verdict: "ORPHANED", recomputed: null, detail: "Deviation row not found" };

  const closedDate = toDate(dev.closedDate as number | string | null);
  if (!closedDate) return { verdict: "DRIFT", recomputed: null, detail: "Deviation has no usable closedDate" };

  const canonical = canonicalizeDeviationClosureContent({
    deviationId: dev.id as string,
    title: dev.title as string,
    severity: dev.severity as string,
    rootCause: (dev.rootCause as string | null) ?? null,
    closingComment: (dev.closureNotes as string | null) ?? null,
    closedAt: closedDate,
  });

  return {
    verdict: "MATCH",
    recomputed: computeContentHash(canonical),
    detail: `closedDate=${closedDate.toISOString()}`,
  };
}

/** FDA 483 response submission. `fda483.ts` computes the draft hash from the
 *  `draft` PARAMETER, then writes `responseDraft: draft`, `submittedAt` and
 *  `signatureMeaning` in the SAME transaction — so the signed input is
 *  recoverable. Note the draft is hashed RAW (not canonicalJson), so a
 *  post-signing edit to the draft is drift by design: the code says the second
 *  hash exists "so the canonical bound state is compact yet still detects any
 *  post-signing tampering of the response." */
function verifyFDA483Response(
  db: DatabaseSync,
  recordId: string,
  signatureMeaning: string | null,
): { verdict: Verdict; recomputed: string | null; detail: string } {
  const ev = db
    .prepare(
      "select id, referenceNumber, responseDraft, submittedAt, signatureMeaning from FDA483Event where id = ?",
    )
    .get(recordId) as Record<string, unknown> | undefined;

  if (!ev) return { verdict: "ORPHANED", recomputed: null, detail: "FDA483Event row not found" };

  const submittedAt = toDate(ev.submittedAt as number | string | null);
  if (!submittedAt)
    return { verdict: "DRIFT", recomputed: null, detail: "FDA483Event has no usable submittedAt" };

  const meaning = (ev.signatureMeaning as string | null) ?? signatureMeaning;
  if (!meaning)
    return { verdict: "DRIFT", recomputed: null, detail: "no signatureMeaning on event or signature" };

  const draft = (ev.responseDraft as string | null) ?? "";
  const responseDraftHash = computeContentHash(draft);
  const canonical = canonicalizeFDA483ResponseContent({
    eventId: ev.id as string,
    referenceNumber: ev.referenceNumber as string,
    responseDraftHash,
    signatureMeaning: meaning,
    submittedAt,
  });

  return {
    verdict: "MATCH",
    recomputed: computeContentHash(canonical),
    detail: `submittedAt=${submittedAt.toISOString()} draftLen=${draft.length}`,
  };
}

function main(): number {
  const argIdx = process.argv.indexOf("--db");
  const path = argIdx > -1 ? process.argv[argIdx + 1] : "prisma/dev.db";
  process.stderr.write(`Reading signatures read-only from ${path}\n`);

  const db = new DatabaseSync(path, { readOnly: true });

  const sigs = db
    .prepare("select id, recordType, recordId, contentHash, contentSummary, signatureMeaning, createdAt from SignedRecord order by createdAt asc")
    .all() as unknown as SigRow[];

  if (sigs.length === 0) {
    process.stdout.write("No SignedRecord rows. Nothing to verify.\n");
    db.close();
    return 0;
  }

  const byType = new Map<string, number>();
  for (const s of sigs) byType.set(s.recordType, (byType.get(s.recordType) ?? 0) + 1);
  process.stdout.write(`Verifying ${sigs.length} signature(s):\n`);
  for (const [t, n] of byType) process.stdout.write(`  ${t}: ${n}\n`);
  process.stdout.write("\n");

  let drift = 0;
  let orphaned = 0;
  let unsupported = 0;
  let matched = 0;

  for (const s of sigs) {
    const short = s.recordId.slice(0, 8);
    const out =
      s.recordType === "DEVIATION_CLOSURE"
        ? verifyDeviationClosure(db, s.recordId)
        : s.recordType === "FDA483_RESPONSE"
          ? verifyFDA483Response(db, s.recordId, s.signatureMeaning)
          : { verdict: "UNSUPPORTED" as Verdict, recomputed: null, detail: "no verifier for this recordType" };

    if (out.verdict === "UNSUPPORTED") {
      unsupported++;
      process.stdout.write(`UNSUPPORTED ${s.recordType} ${short} — ${out.detail}\n`);
      continue;
    }
    if (out.verdict === "ORPHANED") {
      orphaned++;
      process.stdout.write(`ORPHANED    ${s.recordType} ${short} — ${out.detail}\n`);
      continue;
    }
    if (out.recomputed === s.contentHash) {
      matched++;
      process.stdout.write(`MATCH        ${s.recordType} ${short} ${s.contentHash.slice(0, 16)}…\n`);
    } else {
      drift++;
      process.stdout.write(`DRIFT        ${s.recordType} ${short}\n`);
      process.stdout.write(`               stored      ${s.contentHash}\n`);
      process.stdout.write(`               recomputed  ${out.recomputed}\n`);
      process.stdout.write(`               ${out.detail}\n`);
    }
  }

  db.close();
  process.stdout.write(
    `\nmatched=${matched} drift=${drift} orphaned=${orphaned} unsupported=${unsupported}\n`,
  );
  if (drift > 0) {
    process.stdout.write(
      "FAIL: a signature does not reproduce. A move is not specifiable until this is explained.\n",
    );
    return 1;
  }
  process.stdout.write(
    "OK: every verifiable signature reproduces its stored hash.\n" +
      (unsupported > 0 || orphaned > 0
        ? "NOTE: ORPHANED and UNSUPPORTED rows are unproven, not proven-correct.\n"
        : ""),
  );
  return 0;
}

process.exit(main());
