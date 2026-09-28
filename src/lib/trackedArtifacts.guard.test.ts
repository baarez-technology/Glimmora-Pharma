import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/**
 * The artifact check is only as good as its pattern list, and a pattern that
 * silently stops matching is a check that silently stops working. These pin the
 * classes the Phase 0 exit criterion names, plus the two large generated files
 * the plan's original list missed entirely.
 */
describe("tracked-artifact guard", () => {
  const src = read("scripts/check-tracked-artifacts.mjs");

  const COVERAGE: ReadonlyArray<readonly [string, RegExp]> = [
    ["env files", /\.env/],
    ["database files", /\.db/],
    ["sqlite files", /sqlite/],
    ["backup files", /\.bak/],
    ["compiled python", /\.pyc/],
    ["virtualenvs", /venv/],
    ["python caches", /__pycache__/],
    ["node_modules", /node_modules/],
    ["embedding caches", /embedding_cache/],
    ["next build output", /\.next/],
    ["screenshots", /screenshots/],
    ["playwright output", /playwright-report|test-results/],
  ];

  for (const [label, fragment] of COVERAGE) {
    it(`covers ${label}`, () => {
      assert.match(src, fragment, `the check does not cover ${label}`);
    });
  }

  it("exits non-zero so a red pipeline blocks a merge", () => {
    assert.match(src, /process\.exit\(1\)/, "a failing check must fail the pipeline");
    assert.match(src, /process\.exit\(0\)/, "a clean run must succeed");
  });

  it("tells the reader how to fix it", () => {
    assert.match(src, /git rm --cached/, "the failure output should say how to fix it");
  });

  it("is wired to a script", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.scripts["check:artifacts"], "check:artifacts is not in package.json");
  });

  it("typecheck is wired to a script", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.scripts.typecheck, "typecheck is not in package.json");
  });

  it("the backend test driver is wired to a script", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.scripts["test:backend"], "test:backend is not in package.json");
  });

  it("the backend driver expects a sibling checkout, not a vendored folder", () => {
    const driver = read("scripts/run-backend-tests.mjs");
    assert.match(driver, /pharma_glimmora_ai_backend/, "the driver must name the sibling repo");
    assert.doesNotMatch(
      driver,
      /join\(repoRoot,\s*"backend"/,
      "the driver must not look for a vendored backend/ folder — that folder was " +
        "removed and re-vendoring it is the failure .do/app.yaml:31-35 records",
    );
  });
});
