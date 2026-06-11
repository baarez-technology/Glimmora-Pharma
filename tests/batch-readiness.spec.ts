import { test, expect } from "@playwright/test";

/**
 * Feature test — Batch Readiness Agent (pre-release completeness).
 *
 * Covers the Batch Records module:
 *   1. Batches list with a per-batch readiness badge.
 *   2. Selecting a batch runs the mock-AI completeness scan and shows
 *      completeness %, missing entries, review items, and a suggested
 *      pre-release checklist.
 *   3. The "not ready" batch (STB-2026-043) surfaces missing entries.
 *   4. The QP-authority guardrail is shown (agent never releases).
 *
 * Deterministic mock data: 041 ready (100%), 042 needs review (78%),
 * 043 not ready (50%). Login: QA Head.
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };

test("Batch Readiness: analyses completeness and flags missing entries", async ({
  page,
  context,
}) => {
  await context.clearCookies();

  // ── Login ──
  await page.goto("/login");
  await page.locator("#email").fill(QA_HEAD.email);
  await page.locator("#password").fill(QA_HEAD.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });

  // ── Batch Records page ──
  await page.goto("/batch-records");
  await expect(
    page.getByRole("heading", { name: "Batch Records" }),
  ).toBeVisible({ timeout: 10_000 });

  // QP-authority guardrail is present.
  await expect(page.getByText(/QP retains release authority/i)).toBeVisible();

  // ── 1. The not-ready batch carries a "Not ready" badge in the list ──
  const notReadyBatch = page.getByRole("button", { name: "Batch STB-2026-043" });
  await expect(notReadyBatch).toBeVisible({ timeout: 10_000 });
  await expect(notReadyBatch.getByText("Not ready")).toBeVisible();

  // ── 2. Select it → completeness scan surfaces missing entries ──
  await notReadyBatch.click();
  // Scan resolves (1.1s shim) → 50% completeness header.
  await expect(page.getByText("50%")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/Missing entries \(5\)/i)).toBeVisible();
  // A specific missing line clearance entry is listed.
  await expect(page.getByText(/Line clearance signature/i)).toBeVisible();

  // ── 3. Suggested pre-release checklist is shown ──
  await expect(
    page.getByText("Suggested pre-release checklist"),
  ).toBeVisible();

  // ── 4. The ready batch (STB-2026-041) shows 100% + Ready ──
  await page.getByRole("button", { name: "Batch STB-2026-041" }).click();
  await expect(page.getByText("100%")).toBeVisible({ timeout: 12_000 });
});
