import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(new URL(`../../${p}`, import.meta.url), "utf8");

/**
 * TRIPWIRE, not a fix.
 *
 * Razorpay retries a webhook on any non-2xx, and the route returns 200 from its
 * catch block (analysis 5.4), so a delivery can be observed more than once.
 * Until Phase 2 provisions from the webhook with real dedupe, the browser's
 * verify-payment call is the ONLY provisioning path — and it is idempotent on
 * `PendingSignup.status` plus the `@unique` on `Payment.razorpayPaymentId`.
 *
 * If a `tenant.create` or `subscription.create` appears in the webhook route
 * before that dedupe work lands, a replayed delivery WILL double-provision.
 * Phase 2 deletes this file when it lands real idempotency.
 */
describe("webhook replay invariants (pre-Phase-2 tripwire)", () => {
  it("the webhook route does not create a tenant", async () => {
    const src = await read("app/api/webhooks/razorpay/route.ts");
    assert.ok(
      !/tenant\s*\.\s*create/.test(src),
      "the webhook route creates a Tenant with no dedupe guard — a replayed " +
        "delivery would double-provision",
    );
    assert.ok(
      !/subscription\s*\.\s*create/.test(src),
      "the webhook route creates a Subscription with no dedupe guard",
    );
  });

  it("the webhook returns 200 from its error path, so Razorpay never retries", async () => {
    // Asserts the CURRENT, wrong behaviour on purpose. When Phase 2 makes
    // failures retryable this fails, and the author is told to delete the
    // tripwire rather than leave a stale expectation behind.
    const src = await read("app/api/webhooks/razorpay/route.ts");
    assert.match(
      src,
      /success:\s*true,\s*warning:\s*"Error processing"/,
      "the webhook error path changed — Phase 2 may have landed; delete this tripwire",
    );
  });

  it("verify-payment still guards replay on a completed PendingSignup", async () => {
    // The guard is on `"completed"` — the status this route itself sets at the end
    // of its transaction. `order_created` is what create-order writes, so it is
    // the wrong literal to assert here; the plan's first draft named it and the
    // test caught that.
    const src = await read("app/api/signup/verify-payment/route.ts");
    assert.match(
      src,
      /status\s*===\s*["']completed["']/,
      "the completed-status guard is gone from verify-payment — a replay would " +
        "create a second tenant",
    );
  });

  it("razorpayPaymentId is unique in the schema", async () => {
    const src = await read("prisma/schema.prisma");
    const payment = src.slice(src.indexOf("model Payment {"));
    assert.match(
      payment.slice(0, payment.indexOf("\n}")),
      /razorpayPaymentId\s+String\s+@unique/,
      "Payment.razorpayPaymentId is no longer @unique — the replay backstop is gone",
    );
  });
});
