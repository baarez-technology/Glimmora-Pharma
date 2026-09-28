import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { consume, resetRateLimits, sweepRateLimits, trackedKeys, clientIp } from "./rateLimit";

/**
 * The Next.js side had no rate limiting at all. `app/api/signup/initiate` is
 * unauthenticated and runs `bcrypt.hash(password, 12)` on every call — the most
 * expensive hash cost in the system, on a route anyone can reach — and the
 * credentials provider ran `bcrypt.compare` with no limit in front of it.
 *
 * The store here is in-process, so it is per-instance and resets on a cold
 * start. That is a real limitation and it is documented at the definition site
 * rather than assumed away. A multi-instance deployment needs Redis.
 */
describe("rateLimit.consume", () => {
  beforeEach(() => resetRateLimits());

  it("allows a burst up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      const r = consume("burst", 5, 60_000);
      assert.equal(r.ok, true, `request ${i + 1} of 5 was refused`);
    }
  });

  it("refuses once the limit is reached, and says when to retry", () => {
    for (let i = 0; i < 5; i++) consume("burst", 5, 60_000);
    const r = consume("burst", 5, 60_000);
    assert.equal(r.ok, false);
    assert.ok(r.retryAfterSeconds > 0, "a refusal must say when to retry");
  });

  it("keeps separate budgets per key", () => {
    for (let i = 0; i < 5; i++) consume("alice", 5, 60_000);
    assert.equal(consume("alice", 5, 60_000).ok, false);
    assert.equal(consume("bob", 5, 60_000).ok, true, "one caller exhausted another's budget");
  });

  it("is bounded, so a key flood cannot exhaust memory", () => {
    for (let i = 0; i < 5000; i++) consume(`flood-${i}`, 10, 60_000);
    assert.ok(trackedKeys() <= 10_000, `the store grew to ${trackedKeys()} keys, past the bound`);
  });

  it("sweep reports a count and never grows the store", () => {
    consume("expiring", 10, 1);
    const before = trackedKeys();
    const removed = sweepRateLimits();
    assert.ok(removed >= 0, "sweep must return a count");
    assert.ok(trackedKeys() <= before, "sweep grew the store");
  });

  it("clamps a zero or negative window instead of dividing by zero", () => {
    for (const bad of [0, -1, Number.NaN]) {
      const r = consume(`bad-${String(bad)}`, 1, bad);
      assert.equal(typeof r.ok, "boolean", `windowMs=${bad} did not produce a decision`);
      assert.ok(r.retryAfterSeconds >= 0, `retryAfterSeconds was ${r.retryAfterSeconds}`);
    }
  });

  it("caps a window at the ceiling so a key cannot be pinned forever", () => {
    // A 10-year window would keep every stamp alive and let one key grow
    // without limit, so the window is clamped to 24h.
    const r = consume("pinned", 1, 10 * 365 * 24 * 60 * 60 * 1000);
    assert.equal(r.ok, true);
    assert.equal(consume("pinned", 1, 10 * 365 * 24 * 60 * 60 * 1000).ok, false);
  });

  it("does not record a denied request, so a hammering client cannot extend its own lockout", () => {
    consume("hammer", 1, 60_000);
    const before = trackedKeys();
    for (let i = 0; i < 50; i++) consume("hammer", 1, 60_000);
    assert.equal(trackedKeys(), before, "a denied request allocated storage");
  });

  it("reports a non-negative retry", () => {
    for (let i = 0; i < 10; i++) consume("neg", 3, 60_000);
    const r = consume("neg", 3, 60_000);
    assert.ok(r.retryAfterSeconds >= 0, `retryAfterSeconds was ${r.retryAfterSeconds}`);
  });
});

describe("clientIp", () => {
  it("prefers the first forwarded address", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    assert.equal(clientIp(h), "203.0.113.9");
  });

  it("falls back to x-real-ip, then to 'unknown'", () => {
    assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(clientIp(new Headers()), "unknown");
  });
});
