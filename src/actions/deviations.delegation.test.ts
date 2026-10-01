/**
 * The Deviation closure path must live in FastAPI, not in Next.js.
 *
 * A migration is only real if something fails when it silently regresses. This suite
 * is that something. It reads the SOURCE of the two migrated actions and asserts they
 * delegate, because a reverted delegate - someone copying the old body back, or
 * quietly re-adding a prisma call - would otherwise pass every functional test while
 * putting regulated writes back in the frontend.
 *
 * What it asserts, and why each one matters:
 *
 *   - closeDeviation and startInvestigation call the service.
 *   - Neither contains `prisma.` at all. Not "no writes" - NO prisma access, because
 *     the Part 11 signature and the audit row both come from the service now, and a
 *     stray prisma call in one of these functions would mean a write outside the
 *     transaction the service controls.
 *   - Neither references the canonicalisers or the signing provenance helpers, which
 *     would mean a SECOND implementation of the content hash.
 *   - The signature password is still forwarded. Losing it silently would turn a
 *     §11.200(a)(1)(ii) re-authentication into an unsigned write.
 *   - The canonicaliser and hash still exist in lib/signing.ts, because other domains
 *     (CAPA, Finding, FDA483) still use them. Deleting them would break those.
 *
 * It also pins the exact contract the UI depends on, so a future change to the return
 * shape is caught here rather than in a component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const actionsSrc = readFileSync(join(root, "src/actions/deviations.ts"), "utf8");
const signingSrc = readFileSync(join(root, "src/lib/signing.ts"), "utf8");

/** Extract one exported function's body by brace matching. Brace counting rather
 *  than a regex, because these bodies contain braces inside strings and template
 *  literals and a naive `.*?}` would truncate mid-function and pass vacuously. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const closeBody = bodyOf(actionsSrc, "closeDeviation");
const startBody = bodyOf(actionsSrc, "startInvestigation");

test("closeDeviation delegates to the Deviation service", () => {
  assert.match(closeBody, /callDeviationService/, "closeDeviation must call the service");
  assert.match(closeBody, /\["close"\]|["'`]close["'`]/, "must target the close transition");
});

test("startInvestigation delegates to the Deviation service", () => {
  assert.match(startBody, /callDeviationService/, "startInvestigation must call the service");
  assert.match(startBody, /investigation/, "must target the investigation transition");
});

test("neither migrated action touches Prisma", () => {
  for (const [name, body] of [
    ["closeDeviation", closeBody],
    ["startInvestigation", startBody],
  ] as const) {
    assert.ok(
      !body.includes("prisma."),
      `${name} still calls prisma directly — the regulated write must happen inside the service transaction`,
    );
  }
});

test("neither migrated action re-implements the content hash", () => {
  for (const [name, body] of [
    ["closeDeviation", closeBody],
    ["startInvestigation", startBody],
  ] as const) {
    assert.ok(
      !body.includes("canonicalizeDeviationClosureContent"),
      `${name} must not canonicalise; a second implementation of the hash is the exact failure this migration exists to prevent`,
    );
    assert.ok(!body.includes("computeContentHash"), `${name} must not hash`);
    assert.ok(
      !body.includes("readSigningProvenance"),
      `${name} must not collect signing provenance — the service does it`,
    );
  }
});

test("closeDeviation still forwards the signing password", () => {
  // Losing this silently would downgrade a §11.200(a)(1)(ii) re-authentication into
  // an unsigned regulated write, and would not fail any other test.
  assert.match(
    closeBody,
    /signing_password:\s*parsed\.data\.password/,
    "the signing password must be forwarded to the service",
  );
});

test("closeDeviation still forwards the SoD override inputs", () => {
  assert.match(closeBody, /sod_override_reason_code/);
  assert.match(closeBody, /sod_override_justification/);
});

test("the client-side zod validation is retained as the UX layer", () => {
  assert.match(
    closeBody,
    /CloseDeviationSchema\.safeParse/,
    "field-level validation stays for immediate feedback; the service remains authoritative",
  );
  assert.match(closeBody, /fieldErrors/, "the ActionResult contract must keep fieldErrors");
});

test("both actions return the ActionResult shape the UI already consumes", () => {
  for (const [name, body] of [
    ["closeDeviation", closeBody],
    ["startInvestigation", startBody],
  ] as const) {
    assert.ok(
      body.includes("success: true") && body.includes("success: false"),
      `${name} must keep returning the ActionResult union`,
    );
  }
  // startInvestigation has always returned null on success; a caller may rely on it.
  assert.match(startBody, /data:\s*null/, "startInvestigation must still return data: null");
  assert.match(closeBody, /data:\s*result\.deviation/, "closeDeviation must still return the closed record");
});

test("deviationErrorMessage separates a refusal from a service fault", () => {
  // A 5xx must not be shown to the user as if it were their mistake.
  assert.match(actionsSrc, /function deviationErrorMessage/);
  assert.match(actionsSrc, /err\.status\s*>=\s*500/, "5xx must fall back, not surface raw");
  assert.match(actionsSrc, /DeviationServiceUnavailableError/, "an unreachable service has its own message");
});

test("lib/signing.ts still exists for the domains not yet migrated", () => {
  // CAPA, Finding and FDA483 closures still canonicalise here. Removing it would
  // break them, and the assertion exists so this file's future deletion is a
  // deliberate act rather than an accident.
  assert.match(signingSrc, /export function canonicalizeDeviationClosureContent/);
  assert.match(signingSrc, /export function computeContentHash/);
});