/**
 * Separation-of-duties override policy — verification of §8.7 / decision §9.2 #9.
 *
 * These assert the DECISION half of the single-QA SoD override: the pure
 * `evaluate*` transform that every waivable gate calls. The write half
 * (`write*Override` + its audit row, atomic with the signed close) needs a
 * database and is verified separately — see the note at the bottom.
 *
 * Why this must be pinned before any of it moves (docs/REFACTORING-ARCHITECTURE.md
 * §5.2, §8.7): this is a security control with three parallel implementations
 * (CAPA / Deviation / Finding). A port to another service is only meaningful if
 * the current behaviour is known exactly — including the places it is permissive,
 * because those get "cleaned up" during a port and the cleanup is a behaviour change
 * nobody signed off.
 *
 * Three properties are load-bearing and are asserted as such:
 *
 *  1. FLAG-OFF IS CHECKED FIRST. A tenant without the override must see only the
 *     gate's ORIGINAL block message, and must never learn the feature exists. The
 *     Critical/Major ceiling therefore must NOT pre-empt it. Getting this order
 *     wrong leaks feature existence to tenants that lack it.
 *
 *  2. The severity ceiling is an EQUALITY test against a normalised label, and
 *     `normalizeSeverityForDisplay` returns null for anything it does not
 *     recognise. So an unrecognised severity string does NOT hit the ceiling.
 *     See CHARACTERISATION below — this is fail-open and is recorded, not endorsed.
 *
 *  3. Justification is trimmed before the 20-character minimum, so padding cannot
 *     manufacture a justification.
 *
 * Run: npm run test:unit
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// `sod-override.ts` is a server-only module and imports the Prisma singleton at
// module scope. Neither is needed to exercise the pure decision functions.
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/prisma", { namedExports: { prisma: {} } });

// `@/lib/severity` is deliberately NOT mocked: the taxonomy IS the behaviour under
// test, so the real implementation has to be in the loop.
const {
  evaluateSodOverride,
  evaluateDeviationSodOverride,
  SOD_OVERRIDE_CRITICAL_BLOCK,
  DEVIATION_SOD_OVERRIDE_CEILING_BLOCK,
} = await import("./sod-override");

const ORIGINAL = "Original gate block message.";

/** A justification that clears the 20-character minimum. */
const GOOD_JUST = "Sole QA on site this shift.";
const GOOD_CODE = "SOLE_QA_ON_SITE";
const input = (over: Record<string, string> = {}) => ({
  sodOverrideReasonCode: GOOD_CODE,
  sodOverrideJustification: GOOD_JUST,
  ...over,
});

// ── 1. Flag-off privacy: the ORIGINAL message, verbatim, always ───────────────

test("capa: flag OFF returns the gate's original message verbatim", () => {
  const d = evaluateSodOverride({
    risk: "Low", flagOn: false, existingBlockError: ORIGINAL, input: input(),
  });
  assert.equal(d.proceed, false);
  assert.equal(d.proceed === false && d.error, ORIGINAL);
});

test("capa: flag OFF wins over the Critical ceiling (feature existence is not leaked)", () => {
  const d = evaluateSodOverride({
    risk: "Critical", flagOn: false, existingBlockError: ORIGINAL, input: input(),
  });
  assert.equal(d.proceed, false);
  // If this ever equals the override message, a tenant without the feature can
  // distinguish it from an ordinary block. That is a privacy regression.
  assert.equal(d.proceed === false && d.error, ORIGINAL);
  assert.notEqual(d.proceed === false && d.error, SOD_OVERRIDE_CRITICAL_BLOCK);
});

test("deviation: flag OFF wins over the Critical/Major ceiling", () => {
  for (const sev of ["Critical", "Major"]) {
    const d = evaluateDeviationSodOverride({
      severity: sev, flagOn: false, existingBlockError: ORIGINAL, input: input(),
    });
    assert.equal(d.proceed, false);
    assert.equal(d.proceed === false && d.error, ORIGINAL);
    assert.notEqual(d.proceed === false && d.error, DEVIATION_SOD_OVERRIDE_CEILING_BLOCK);
  }
});

// ── 2. The severity ceilings ─────────────────────────────────────────────────

test("capa: Critical is refused, in any casing", () => {
  for (const risk of ["Critical", "critical", "CRITICAL", "  critical  "]) {
    const d = evaluateSodOverride({
      risk, flagOn: true, existingBlockError: ORIGINAL, input: input(),
    });
    assert.equal(d.proceed, false, `expected block for ${JSON.stringify(risk)}`);
    assert.equal(d.proceed === false && d.error, SOD_OVERRIDE_CRITICAL_BLOCK);
  }
});

test("deviation: Critical AND Major are both refused, in any casing", () => {
  for (const sev of ["Critical", "critical", "Major", "major", "MAJOR"]) {
    const d = evaluateDeviationSodOverride({
      severity: sev, flagOn: true, existingBlockError: ORIGINAL, input: input(),
    });
    assert.equal(d.proceed, false, `expected ceiling block for ${JSON.stringify(sev)}`);
    assert.equal(d.proceed === false && d.error, DEVIATION_SOD_OVERRIDE_CEILING_BLOCK);
  }
});

test("deviation: Minor is waivable", () => {
  const d = evaluateDeviationSodOverride({
    severity: "Minor", flagOn: true, existingBlockError: ORIGINAL, input: input(),
  });
  assert.equal(d.proceed, true);
});

// ── 3. Reason code and justification ─────────────────────────────────────────

test("a missing or unrecognised reason code is refused", () => {
  for (const over of [
    { sodOverrideReasonCode: undefined },
    { sodOverrideReasonCode: "" },
    { sodOverrideReasonCode: "BECAUSE_I_SAID_SO" },
  ]) {
    const d = evaluateSodOverride({
      risk: "Low", flagOn: true, existingBlockError: ORIGINAL,
      input: input(over as Record<string, string>),
    });
    assert.equal(d.proceed, false, `expected refusal for ${JSON.stringify(over)}`);
  }
});

test("justification under 20 characters is refused; exactly 20 is accepted", () => {
  const nineteen = "x".repeat(19);
  const twenty = "x".repeat(20);

  const short = evaluateSodOverride({
    risk: "Low", flagOn: true, existingBlockError: ORIGINAL,
    input: input({ sodOverrideJustification: nineteen }),
  });
  assert.equal(short.proceed, false);

  const exact = evaluateSodOverride({
    risk: "Low", flagOn: true, existingBlockError: ORIGINAL,
    input: input({ sodOverrideJustification: twenty }),
  });
  assert.equal(exact.proceed, true);
});

test("justification is trimmed, so padding cannot manufacture length", () => {
  // 19 real characters, padded to 37. If the trim were removed this would pass.
  const padded = `   ${"x".repeat(19)}   `;
  const d = evaluateSodOverride({
    risk: "Low", flagOn: true, existingBlockError: ORIGINAL,
    input: input({ sodOverrideJustification: padded }),
  });
  assert.equal(d.proceed, false, "padding must not count toward the 20-char minimum");
});

test("a valid waiver proceeds and echoes the trimmed justification", () => {
  const d = evaluateSodOverride({
    risk: "Medium", flagOn: true, existingBlockError: ORIGINAL,
    input: input({ sodOverrideJustification: `  ${GOOD_JUST}  ` }),
  });
  assert.equal(d.proceed, true);
  if (d.proceed) {
    assert.equal(d.reasonCode, GOOD_CODE);
    assert.equal(d.justification, GOOD_JUST);
  }
});

// ?? FAIL CLOSED on an unrecognised severity ???????????????????????????????????
//
// A waiver admits that a control was bypassed. Permitting one because the severity
// could not be classified is the wrong direction. The two scales here are disjoint -
// FDA Critical/Major/Minor for deviations and 483s, generic Critical/High/Medium/Low
// for internal quality records - so a cross-taxonomy write lands a value the taxonomy
// has no mapping for, and that used to pass straight through the ceiling.

test("an unrecognised severity refuses the waiver rather than allowing it", () => {
  // "Major" is a valid FDA severity but NOT a valid generic one.
  const capa = evaluateSodOverride({
    risk: "Major",
    flagOn: true,
    existingBlockError: ORIGINAL,
    input: input(),
  });
  assert.equal(capa.proceed, false, "'Major' is not a generic severity and must not be waived");
  assert.match(capa.proceed === false ? capa.error : "", /not a recognised value/);

  // "High" is a valid generic severity but NOT a valid FDA one.
  const dev = evaluateDeviationSodOverride({
    severity: "High",
    flagOn: true,
    existingBlockError: ORIGINAL,
    input: input(),
  });
  assert.equal(dev.proceed, false, "'High' is not an FDA severity and must not be waived");
  assert.match(dev.proceed === false ? dev.error : "", /not a recognised value/);
});

test("null, empty and whitespace severities also refuse", () => {
  for (const sev of [null, "", "   "]) {
    const d = evaluateDeviationSodOverride({
      severity: sev,
      flagOn: true,
      existingBlockError: ORIGINAL,
      input: input(),
    });
    assert.equal(d.proceed, false, `${JSON.stringify(sev)} must not be waivable`);
  }
});

test("flag OFF still wins over the new check", () => {
  // Privacy ordering must survive: a tenant without the feature sees its ORIGINAL
  // block message and never learns the override exists - including when the severity
  // could not be classified.
  const d = evaluateDeviationSodOverride({
    severity: "High",
    flagOn: false,
    existingBlockError: ORIGINAL,
    input: input(),
  });
  assert.equal(d.proceed, false);
  assert.equal(d.proceed === false ? d.error : "", ORIGINAL);
});

test("recognised below-ceiling severities are still waivable", () => {
  // Fail-closed must not become fail-everything.
  const g = evaluateSodOverride({
    risk: "Medium",
    flagOn: true,
    existingBlockError: ORIGINAL,
    input: input(),
  });
  assert.equal(g.proceed, true);

  const d = evaluateDeviationSodOverride({
    severity: "Minor",
    flagOn: true,
    existingBlockError: ORIGINAL,
    input: input(),
  });
  assert.equal(d.proceed, true);
});
