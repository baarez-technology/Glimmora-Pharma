/**
 * Single-QA SoD override — WRITE PATH verification.
 *
 * The decision half is covered by src/actions/capas/sod-override.policy.test.ts
 * (pure functions, runs in CI). This covers the half that needs a real database:
 * that `writeDeviationSodOverride` writes the waiver row AND its audit row inside
 * the caller's transaction, atomic with the signed close.
 *
 * The property that matters for Part 11
 * ------------------------------------
 * A separation-of-duties waiver is an admission that a control was bypassed. If the
 * waiver row could land while the close it authorises rolled back — or vice versa —
 * the audit trail would claim an override that never authorised anything, and the
 * close would be unattributable. So the assertions are about ATOMICITY, not about
 * field values:
 *
 *   1. inside an open transaction, the waiver row and its audit row are both visible
 *   2. the audit row carries the control, the waived rule, the reason code, the
 *      justification, and the signature it is linked to
 *   3. ROLLING BACK that transaction leaves NO waiver row and NO audit row — an
 *      orphan waiver is the specific failure this is checking for
 *
 * Every assertion runs inside a transaction that is rolled back, so this script
 * leaves the database byte-for-byte as it found it and is safe to re-run.
 *
 * Requires the four SoD tables. On a dev database that predates them they are
 * absent — run `node scripts/ensure-sod-tables.mjs` first.
 *
 * `--conditions=react-server` is required, not incidental: `sod-override.ts` does
 * `import "server-only"`, whose default export THROWS outside a React Server
 * Component. The package resolves to a no-op only under the `react-server`
 * condition, which is what Next sets for server bundles. The same flag is needed
 * by any script or test that imports a server-only module.
 *
 * Usage:
 *   node scripts/ensure-sod-tables.mjs
 *   DATABASE_URL="file:./dev.db" \
 *     node --conditions=react-server --import tsx scripts/verify-sod-write-path.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeDeviationSodOverride } from "../src/actions/capas/sod-override";

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

const prisma = new PrismaClient();

async function main() {
  // A waiver has FKs to Tenant and Deviation, so both must be real rows. Using
  // genuine ids means a missing FK constraint would surface as an error rather
  // than being silently accepted.
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  const deviation = await prisma.deviation.findFirst({
    select: { id: true, title: true },
  });
  if (!tenant || !deviation) throw new Error("dev.db has no Tenant/Deviation to anchor the test");

  const sigId = "sig-test-anchor";
  const opts = {
    tenantId: tenant.id,
    deviationId: deviation.id,
    control: "DEV_CLOSE_REPORTER" as const,
    actorUserId: "user-test-actor",
    actorName: "Test Actor",
    actorRole: "qa",
    reasonCode: "SOLE_QA_ON_SITE",
    justification: "Sole QA on site this shift; documented in the batch record.",
    recordTitle: deviation.title ?? "Deviation",
    signedRecordId: sigId,
  };

  // ── 1 + 2. Inside an open transaction, both rows land, fully populated ─────
  const waiverCountBefore = await prisma.deviationSODOverride.count();
  const auditCountBefore = await prisma.auditLog.count();

  await prisma.$transaction(async (tx) => {
    await writeDeviationSodOverride(tx, opts);

    const waiver = await tx.deviationSODOverride.findFirst({
      where: { deviationId: opts.deviationId, control: opts.control },
    });
    check(
      "waiver row is written inside the caller's transaction",
      waiver !== null,
      waiver ? `id=${waiver.id}` : "no row visible inside the transaction",
    );
    check(
      "waiver records control, reason, justification and the signature link",
      !!waiver &&
        waiver.control === opts.control &&
        waiver.reasonCode === opts.reasonCode &&
        waiver.justification === opts.justification &&
        waiver.signedRecordId === sigId,
      waiver
        ? `control=${waiver.control} reason=${waiver.reasonCode} sig=${waiver.signedRecordId}`
        : "n/a",
    );

    const audit = await tx.auditLog.findFirst({
      where: { action: "DEVIATION_SOD_OVERRIDE_USED", recordId: opts.deviationId },
    });
    check(
      "audit row is written in the SAME transaction as the waiver",
      audit !== null,
      audit ? `module="${audit.module}" action=${audit.action}` : "no audit row inside the transaction",
    );

    let waivedRule = "";
    let auditSig = "";
    if (audit?.newValue) {
      try {
        const parsed = JSON.parse(audit.newValue) as {
          waivedRule?: string;
          signedRecordId?: string;
          justification?: string;
        };
        waivedRule = parsed.waivedRule ?? "";
        auditSig = parsed.signedRecordId ?? "";
      } catch {
        /* left empty; asserted below */
      }
    }
    check(
      "audit names the identity rule that was waived and links the signature",
      waivedRule === "reporter!=closer" && auditSig === sigId,
      `waivedRule="${waivedRule}" signedRecordId="${auditSig}"`,
    );

    // Roll back: the assertions above saw the rows, and this proves they were
    // never durably committed.
    throw new Error("__ROLLBACK__");
  }).catch((e: unknown) => {
    if (!(e instanceof Error) || e.message !== "__ROLLBACK__") throw e;
  });

  // ── 3. After rollback: no orphan waiver, no orphan audit ──────────────────
  const waiverAfter = await prisma.deviationSODOverride.count();
  const auditAfter = await prisma.auditLog.count();

  check(
    "ROLLBACK leaves no orphan waiver row",
    waiverAfter === waiverCountBefore,
    `before=${waiverCountBefore} after=${waiverAfter}`,
  );
  check(
    "ROLLBACK leaves no orphan audit row",
    auditAfter === auditCountBefore,
    `before=${auditCountBefore} after=${auditAfter}`,
  );

  // ── 4. The database is untouched by this script ───────────────────────────
  console.log();
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`FAIL: ${failed.length}/${results.length} checks failed.`);
    return 1;
  }
  console.log(`OK: ${results.length}/${results.length} checks passed. Database unchanged.`);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
