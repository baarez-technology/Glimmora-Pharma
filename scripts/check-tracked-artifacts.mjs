#!/usr/bin/env node
// scripts/check-tracked-artifacts.mjs
//
// Fails when git is tracking a generated artifact, a database, a cache, or a
// secret. The plan's Phase 0 acceptance criterion is
// `git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'` returning
// nothing — but a grep is a one-off check a developer has to remember. This is
// the same rule as a script CI can call on every push, so the class cannot
// quietly return.
//
// Run: node scripts/check-tracked-artifacts.mjs
// Exits 0 when clean, 1 with the offending paths otherwise.

import { execFileSync } from "node:child_process";

/**
 * A secret file. `.env.example` and friends are EXEMPT: they are value-free
 * templates that are supposed to be tracked, and catching a real `.env` holding a
 * real key is the entire point of this check.
 */
const SECRET_FILE = /(^|\/)\.env(\.|$)/;
const SECRET_TEMPLATE = /\.env\.(example|sample|template|dist)$/;

/** Patterns that must never be tracked, each with the reason, for the output. */
const FORBIDDEN = [
  { pattern: /\.db(-wal|-shm|-journal)?$/, why: "a database file" },
  { pattern: /\.sqlite3?$/, why: "a database file" },
  { pattern: /\.bak$/, why: "a backup file" },
  { pattern: /\.pyc$/, why: "a compiled Python artifact" },
  { pattern: /(^|\/)venv\//, why: "a virtual environment" },
  { pattern: /(^|\/)__pycache__\//, why: "a Python bytecode cache" },
  { pattern: /(^|\/)node_modules\//, why: "an installed dependency tree" },
  { pattern: /\.embedding_cache\.json$/, why: "a generated embedding cache" },
  { pattern: /(^|\/)\.next\//, why: "a Next.js build output" },
  { pattern: /(^|\/)test-screenshots\//, why: "generated test screenshots" },
  { pattern: /(^|\/)screenshots\//, why: "generated screenshots" },
  { pattern: /(^|\/)playwright-report\//, why: "a Playwright report" },
  { pattern: /(^|\/)test-results\//, why: "Playwright test results" },
];


/**
 * Tracked on purpose, with the reason. Kept as a small explicit list rather than
 * a pattern so that removing an entry is a reviewable diff and cannot happen by
 * accident when a pattern is loosened.
 *
 * The screenshot bundles are here because the images are EMBEDDED in a live
 * document — `docs/AI-API-TESTING-MANUAL.md` references them by relative path,
 * so untracking the files breaks the manual. Whether to archive them externally
 * and re-host, or to keep them, is an open documentation decision (plan section
 * 12, item 7) and is not for a hygiene script to settle.
 */
const ALLOWED_TRACKED = [
  { match: /^docs\/(manual|test-screenshots)\/screenshots?\//, why: "embedded in a document by relative path" },
  { match: /^docs\/test-screenshots\//, why: "embedded in a document by relative path" },
];

let tracked;
try {
  tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" });
} catch (error) {
  console.error("could not read the git index:", error.message);
  process.exit(1);
}

const files = tracked.split("\n").filter(Boolean);
const offenders = [];

for (const file of files) {
  if (SECRET_TEMPLATE.test(file)) continue;
  if (ALLOWED_TRACKED.some((a) => a.match.test(file))) continue;
  if (SECRET_FILE.test(file)) {
    offenders.push({ file, why: "a secret file" });
    continue;
  }
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(file)) {
      offenders.push({ file, why });
      break;
    }
  }
}

if (offenders.length === 0) {
  console.log(`check:artifacts OK — ${files.length} tracked files, none generated.`);
  process.exit(0);
}

console.error(`check:artifacts FAILED — ${offenders.length} generated path(s) tracked:\n`);
for (const { file, why } of offenders) {
  console.error(`  ${file}  (${why})`);
}
console.error("\nUntrack with:  git rm --cached <path>");
console.error("Then add the pattern to .gitignore so it cannot return.");
process.exit(1);
