#!/usr/bin/env node
// scripts/run-backend-tests.mjs
//
// Runs the backend's test modules from the frontend repository, so one command
// checks both halves of the stack. The backend is a SIBLING checkout at
// ../pharma_glimmora_ai_backend, not a vendored `backend/` folder — that folder
// was removed, and several documents still describe it (Phase 4 corrects them).
//
// The backend has no pytest and no test-runner dependency. Each module is a
// standalone script with its own `if __name__ == "__main__"` block that exits
// non-zero on failure. This driver runs all of them and aggregates the result.
//
// Run: npm run test:backend

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const backendRoot = join(repoRoot, "..", "pharma_glimmora_ai_backend");

// The three pre-existing modules run FIRST, so a regression in a suite that was
// already here is visible before any of this phase's new modules report.
const MODULES = [
  "tests/test_ai_security.py",
  "tests/test_ai_grounding.py",
  "tests/smoke_test.py",
  "tests/test_config.py",
  "tests/test_health.py",
  "tests/test_production_detection.py",
  "tests/test_identity.py",
  "tests/test_audit_trail.py",
  "tests/test_rate_limit.py",
];

if (!existsSync(backendRoot)) {
  console.error(`Backend repository not found at ${backendRoot}`);
  console.error("Expected a sibling checkout of pharma_glimmora_ai_backend.");
  process.exit(1);
}

// The backend's own venv if it exists, else whatever `python` resolves to. The
// declared runtime is 3.12.7 (.python-version, runtime.txt); a local venv on a
// different version is a recorded deviation, not a reason to skip the suite.
const venvPython = join(backendRoot, "venv", "Scripts", "python.exe");
const python = existsSync(venvPython)
  ? venvPython
  : process.platform === "win32"
    ? "python"
    : "python3";

let failed = 0;

for (const module of MODULES) {
  console.log(`\n${"=".repeat(60)}\n${module}\n${"=".repeat(60)}`);
  // No shell. The repository path contains a space ("Glimmora Projects"), and
  // `shell: true` on Windows splits it into two arguments — which fails with
  // "'C:\...\Glimmora' is not recognized as an internal or external command".
  // An absolute interpreter path needs no shell to be resolved.
  const result = spawnSync(python, [join(backendRoot, module)], {
    cwd: backendRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) failed += 1;
}

console.log(`\n${"=".repeat(60)}`);
if (failed > 0) {
  console.log(`${failed} of ${MODULES.length} backend modules FAILED`);
  process.exit(1);
}
console.log(`all ${MODULES.length} backend modules passed`);
