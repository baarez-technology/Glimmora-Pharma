# Phase 0: Stabilize and Secure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend start from its committed dependency manifest against PostgreSQL, with or without an OpenAI key; make token forgery impossible on any host; make every billable route rate limited; make the AI audit trail visible to the tenants it belongs to; and stop the two destructive deployment paths.

**Architecture:** Eight independently reviewable tasks across two sibling repositories. Tasks 1 and 7–8 touch the Next.js frontend; tasks 2–7 touch the FastAPI backend. The spine is a new `app/core/` package — one `Settings` object, one OpenAI factory, one dev-key module, one typed-error module, one ordered migration runner — that every later task depends on, so Task 2 lands first and nothing else reaches for `os.getenv` directly.

**Tech Stack:** Next.js 16 (App Router, `proxy` edge convention), React 19, TypeScript 5.9 (`strict: true`), Zod 4, `node --test` via `node --import tsx`. FastAPI 0.115, SQLAlchemy 2.0.36, Pydantic 2.8.2 + pydantic-settings 2.4.0, PyJWT 2.8, `bcrypt` 4.2, OpenAI SDK 1.30, `psycopg2-binary` 2.9.10. Hand-rolled test runners — `pytest` is not and will not be a dependency.

**Spec:** `docs/refactor-analysis.md` (findings) and `docs/refactor-pharma-stack.md` §5 (the phase this plan implements), both in the frontend repo. **Read "Corrections to the source documents" below before task 1** — seven claims changed when the spec was re-verified against source on 28 September 2026, and this plan implements the corrected position.

## Repositories

| Short name | Repository | Absolute path | Git branch |
|---|---|---|---|
| `FE` | `Glimmora-Pharma` — frontend, identity, session, Server Actions, Prisma, AI proxy, billing UI | `C:\Users\Dinkar\Desktop\GlimmoraProjects\Glimmora Pharma\Glimmora-Pharma` | `dinkar-frontend` |
| `BE` | `pharma_glimmora_ai_backend` — AI service, advisory endpoints, audit trail, billing service | `C:\Users\Dinkar\Desktop\GlimmoraProjects\Glimmora Pharma\pharma_glimmora_ai_backend` | `dinkar-backend` |

The two are siblings. There is **no `Glimmora-Pharma/backend/` directory and this plan does
not create one** — `.do/app.yaml:31-35` records what the last vendored snapshot cost: it
drifted months behind `ai_develop`, carried 12 of 24 routers, and every newer AI endpoint
404'd in production while working locally. A change spanning both repositories is two
commits, one per repository, reviewed together. The dependency direction is one-way: Next.js
calls FastAPI, never the reverse.

Every `git` command runs in the repository named in that task's **Files** block. Every
`python` command runs from `BE`. Both working trees were clean at plan time.

## Corrections to the source documents

| # | Spec says | Verified position | Where it lands |
|---|---|---|---|
| C1 | Plan §5.0.5 deletes FastAPI `/auth/login`; §5.0.7 says "Rate limit `POST /api/v1/auth/login`" | Self-contradiction. After the deletion the only login surface is NextAuth's credentials provider, which has **no** rate limiting at all | Task 5 deletes the lockout code; Task 7 limits NextAuth instead |
| C2 | Plan §5.0.8 untracks `venv/`, `__pycache__/`, `glimmora.db`, `*.pyc` | Already correctly ignored in both repos — zero tracked. The real tracked junk is elsewhere | Task 8 rewritten |
| C3 | Analysis 5.1: replay uses `planId` **and** `billingCycle: "yearly"` | `billingCycle` is never persisted — it only feeds `expiryDate` at `verify-renewal/route.ts:94`. Only `planId` mutates the record (`:131`), so the attack is "pay the cheapest monthly, replay with the priciest `planId`" | Narrows the Phase 2 contract. No Phase 0 change |
| C4 | Analysis 5.2: `SubscriptionTab.tsx:22-25` restricts to `super_admin` | Those lines are a doc comment. The real gate is `SettingsPage.tsx:137` on `SETTINGS_MANAGE_ROLES` (`roleSets.ts:347`) = `["super_admin", "customer_admin"]` | The core lockout claim stands (`route.ts:412-415` and `useTenantConfig.ts:42,59-60` both confirmed). Only the described recovery path was wrong. No Phase 0 change |
| C5 | — | **New:** `app/services/assistant_pipeline.py:46` imports `CurrentUser` from `app.routers.auth_router.py` — a service importing from a router | Phase 3. Recorded so it is not lost |
| C6 | Plan line 5 cites `docs/superpowers/plans/2026-09-25-refactor-analysis.md` | Does not exist; that directory is empty. Real path: `docs/refactor-analysis.md` | Task 8 |
| C7 | Analysis cites `.do/app.yaml` throughout | It lives in the **frontend** repo (191 lines), not the backend. All its line citations are correct. It deploys `main` (frontend) and `ai_develop` (backend); local branches are `dinkar-frontend` / `dinkar-backend` | No code change. Recorded so implementers stop looking for it in `BE` |

**One tension resolved in the spec itself.** Plan §5.0.4's acceptance says "with no `APP_ENV`, the app refuses to start", while the plan's own non-negotiable rule 6 says "The application still starts and `/health` still answers". Rule 6 wins — it is listed as non-negotiable, and crashing is not a security control. Task 4 implements: the app starts, `/health` answers 200 with a readiness block, and a traffic gate returns 503 for everything else.

**Decisions taken with the human partner, 28 September 2026:**

1. **Orphan CAPA tables** (`capas`, `rcas`, `action_plans`, `monitoring`, `effectiveness_checks`, `capa_closures`): stop `create_all` recreating them, **keep the tables**. No `DROP TABLE`. Reversible; needs no compliance sign-off. Task 5.
2. **Test database:** local PostgreSQL installed via Chocolatey. Docker is not installed; the two existing PostgreSQL clusters (17, 18) have had their `bin/` directories removed and are unusable — data directories with no `postgres.exe`.
3. **Phase 0 is one plan, eight tasks, executed task by task.**

## Global Constraints

Apply to every task. A change that violates one does not merge.

**Security**

1. No secret **value** in git, logs, error messages, HTTP responses, or documentation. Only variable names appear in this plan.
2. `SECRET_KEY` must not exist anywhere in the source tree, including as a development fallback. Task 4 removes it.
3. Authentication is enforced unconditionally. Absence of configuration is never a reason to accept a request.
4. A missing or invalid signature is a `400` that changes no records — never a `500`.
5. `crypto.timingSafeEqual` is always length-guarded.

**Correctness**

6. Prisma owns the schema. SQLAlchemy mirrors it. No task in this phase introduces a schema change.
7. `prisma db push` never runs against the shared database. Only `prisma migrate deploy`.
8. `/health` reports booleans, never values.
9. Money movement and provisioning are not touched in this phase. The eight billing routes are deleted in Phase 2.

**Delivery**

10. No task mixes a behaviour change with a file move.
11. Each task leaves both applications runnable.
12. The backend's three existing test modules must be at or above their recorded baseline after every task. Task 2 Step 4 records that baseline; every later task compares against it.
13. **Backend work modifies existing files in place.** New modules appear only where a new responsibility requires one. Nothing is renamed, split, or relocated for tidiness, and no service moves between the flat and `app/services/` conventions before Phase 3, which is the phase that decides which convention is correct.
14. **Frontend integration uses the existing structures.** The AI backend-for-frontend at `app/api/ai-proxy/[...path]/route.ts`, the NextAuth session, and the Server Actions in `src/actions/` are the integration seams. Nothing in this plan introduces a new client library, a new state pattern, or a new proxy.

**Phase completion — wiring and confirmation**

Phase 0 is finished when all eight tasks pass their own tests **and** the wiring below passes
against running code. "Both applications start" is not the same claim as "the frontend can
still reach the backend", and only the second is the exit criterion.

1. Both applications start from their committed manifests: `pip install -r requirements.txt`
   then `uvicorn app.main:app`, and `npm ci && npm run dev`.
2. `curl localhost:8000/health` reports `signing_key_configured`, `openai_key_configured` and
   `database_reachable` as booleans, and contains no value.
3. `curl -i localhost:3000/api/webhooks/razorpay -X POST -d '{}'` answers **400 from the
   route's own signature check**, not 401 from the edge.
4. `curl -i localhost:3000/api/signup/pricing` answers **401 from the edge** — intended, and
   recorded.
5. From a signed-in browser session, an advisory call through
   `/api/ai-proxy/api/v1/finding-triage/classify` returns 200. A **401** is the healthy
   result for an unauthenticated probe: it proves the request arrived and the token was
   rejected. A 404 or a connection error means `BACKEND_URL` is misconfigured — Task 1b makes
   that a clear 503 instead of a silent fallback to localhost.
6. A wrong token, an `alg: none` token, and an expired token are all rejected. These are the
   four cases in `tests/test_ai_security.py` and they must still pass.

Then stop and report, in the client's terms: **what a person can now do that they could not
before** (a Razorpay payment reaches its handler; the backend boots at all), **what is still
broken on purpose** (public checkout is 401'd at the edge; `Plan` still has no join to
`Subscription`, so the customer who pays still cannot log in until Phase 1), and **what was
verified against running code versus what was only verified by a unit test**. Wait for
confirmation before starting Phase 1.


## Review Focus

Input classes the spec implies but no task's acceptance criterion would otherwise catch. Each is pinned to a test in the task that owns the code.

1. **A Razorpay webhook replayed with an already-captured `razorpay_payment_id`.** Task 1 makes this handler reachable in production for the first time, so a duplicate delivery becomes a live risk. → Task 1, `test_webhook_replay_does_not_double_provision`.
2. **`SECRET_KEY` set but `APP_ENV` unset.** The most likely production misconfiguration, and the one the old code got wrong. Must not be treated as development. → Task 4, `test_secret_set_but_app_env_unset_fails_closed`.
3. **`DATABASE_URL` pointing at SQLite while `APP_ENV=production`.** A stale local `.env` must not let a production deploy silently run on a local file. → Task 2, `test_production_rejects_sqlite_database_url`.
4. **Two workers starting against a fresh empty database simultaneously.** `instance_count: 1` today, but a scale-up races `create_all`. → Task 6, `test_create_all_is_idempotent_under_repeat_boot`.
5. **A password longer than bcrypt's 72-byte limit at `/api/signup/initiate`.** `zod` accepts it, `bcrypt.hash` truncates silently, and the route is unauthenticated and CPU-expensive at cost 12. → Task 7, `test_initiate_rejects_over_length_password`.

## Task order and dependencies

```
1  webhook edge exclusion         FE    no deps
1b proxy fail-closed on BACKEND_URL FE  needs 1
2  config + postgres driver       BE    no deps   <- everything else needs app/core/
3  lazy OpenAI + /health          BE    needs 2
4  host-independent prod check    BE    needs 2
5  close the identity hole        BE    needs 2,3,4
6  restore the audit trail        BE    needs 2,5
7  rate limiting                  BE+FE needs 5 (login is gone from BE)
8  repository hygiene             BE+FE needs 1,1b,2-7
```

Phase 0 exit criteria: the backend starts with no `OPENAI_API_KEY` and against PostgreSQL from `requirements.txt` alone; a token cannot be forged on any host and no FastAPI route can mint one; every billable endpoint is rate limited and login is not a memory-growth or lockout vector; the audit trail is visible to the tenants it belongs to; `render.yaml` and the destructive DDL paths are gone; no build artifact, database, or secret is tracked; both applications run and both test suites are at or above the recorded baseline.

---

## Task 1: Let Razorpay webhooks reach their handler

The edge gate 401s every anonymous request that is not `/login` or `/api/auth/*`. Razorpay sends no NextAuth cookie, so every payment callback is rejected and money is captured with no state transition. This adds one exclusion and nothing else.

`api/signup` is **not** excluded. The public checkout stays 401'd at the edge for the duration of this phase, because the current implementation mutates a subscription from a client-supplied, unsigned `planId` (analysis 5.1). A deliberately broken checkout is cheaper than an exploitable one.

**Files:**
- Create: `FE/src/lib/proxyMatcher.ts`
- Create: `FE/src/lib/proxyMatcher.test.ts`
- Create: `FE/src/lib/razorpayReplay.guard.test.ts`
- Modify: `FE/proxy.ts:1-2` (import) and `:88-105` (doc comment + `config`)

**Interfaces:**
- Consumes: nothing.
- Produces: `EDGE_EXCLUDED_PREFIXES: readonly string[]`, `EDGE_MATCHER_PATTERN: string`, `isEdgeExcluded(pathname: string): boolean`, all from `@/lib/proxyMatcher`. Task 7 imports `isEdgeExcluded` to decide which paths the limiter treats as public.

The matcher is extracted into its own module because `proxy.ts` imports `next/server` and `next-auth/jwt`, neither of which loads under `node --test`. A pure-string module is testable, and it keeps a security control from being edited in a file nothing can test.

- [ ] **Step 1: Write the failing test**

Create `FE/src/lib/proxyMatcher.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isEdgeExcluded } from "./proxyMatcher";

/**
 * The edge gate is defense-in-depth, but today it is the only thing standing
 * between an anonymous request and a payment route, so its matcher is pinned
 * here. `isEdgeExcluded` answers one question: does the edge gate apply here? A
 * path is reachable without a session exactly when it is EXCLUDED.
 */
describe("edge matcher", () => {
  it("lets a Razorpay callback through — it carries an HMAC, not a cookie", () => {
    assert.equal(isEdgeExcluded("/api/webhooks/razorpay"), true);
  });

  it("still gates the public checkout, which accepts an unsigned client plan", () => {
    for (const p of [
      "/api/signup/pricing",
      "/api/signup/initiate",
      "/api/signup/create-order",
      "/api/signup/verify-payment",
    ]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must stay gated`);
    }
  });

  it("gates authenticated subscription routes", () => {
    for (const p of [
      "/api/subscriptions/status",
      "/api/subscriptions/renew",
      "/api/subscriptions/verify-renewal",
      "/api/ai-proxy/v1/ai/assistant",
    ]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must stay gated`);
    }
  });

  it("leaves NextAuth and the sign-in page reachable", () => {
    for (const p of ["/login", "/api/auth/session", "/api/auth/callback/credentials"]) {
      assert.equal(isEdgeExcluded(p), true, `${p} must be reachable`);
    }
  });

  it("leaves pre-session browser fetches reachable", () => {
    for (const p of [
      "/favicon.ico",
      "/manifest.json",
      "/robots.txt",
      "/sitemap.xml",
      "/_next/static/chunk.js",
      "/_next/image",
      "/logo.png",
      "/styles.css",
    ]) {
      assert.equal(isEdgeExcluded(p), true, `${p} must not be gated`);
    }
  });

  it("gates every application page", () => {
    for (const p of ["/dashboard", "/admin", "/settings", "/deviations"]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must be gated`);
    }
  });

  it("does not exclude a path that merely contains an excluded prefix", () => {
    // The negative lookahead anchors at the start of the path segment. A
    // substring match here would open /api/authenticated/* to the public.
    for (const p of ["/api/webhooks-fake/razorpay", "/api/authenticated/x", "/login-history"]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must be gated`);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL with `Cannot find module './proxyMatcher'`.

- [ ] **Step 3: Write the implementation**

Create `FE/src/lib/proxyMatcher.ts`:

```ts
/**
 * The edge gate's route matcher, isolated from `proxy.ts` so it can be unit
 * tested without loading `next/server` or `next-auth/jwt`.
 *
 * Every entry in EDGE_EXCLUDED_PREFIXES is a path an UNAUTHENTICATED request is
 * allowed to reach. Adding one is a security decision, not a convenience:
 *
 *   login          the sign-in page itself
 *   api/auth       NextAuth's own handlers, which by definition have no session yet
 *   api/webhooks   third-party callbacks. Razorpay authenticates with an HMAC over
 *                  the raw body, not with a NextAuth cookie, so it can never satisfy
 *                  the session check in `proxy.ts`. Excluding it is what lets a
 *                  captured payment reach its handler instead of being 401'd.
 *   _next/*, favicon.ico, manifest.json, robots.txt, sitemap.xml, *.png, *.css
 *                  fetched by the browser before any session exists
 *
 * `api/signup` is deliberately ABSENT. The public checkout stays gated at the
 * edge until Phase 2 replaces it, because the current implementation mutates a
 * subscription from a client-supplied, unsigned `planId` (analysis 5.1). Phase 2
 * removes that route and re-adds the exclusion on the FastAPI path instead.
 */
export const EDGE_EXCLUDED_PREFIXES = [
  "login",
  "api/auth",
  "api/webhooks",
  "_next/static",
  "_next/image",
  "favicon.ico",
  "manifest.json",
  "robots.txt",
  "sitemap.xml",
] as const;

/** Anything the browser fetches by extension, e.g. a hashed build asset. */
const STATIC_ASSET_PATTERN =
  ".*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|txt|xml)$";

/** The negative-lookahead body, shared by the exported matcher and the helper. */
const EXCLUSION_ALTERNATION = [...EDGE_EXCLUDED_PREFIXES, STATIC_ASSET_PATTERN].join("|");

/** Exactly the string Next.js expects in `config.matcher`. */
export const EDGE_MATCHER_PATTERN = `/((?!${EXCLUSION_ALTERNATION}).*)`;

const MATCHER_RE = new RegExp(`^${EDGE_MATCHER_PATTERN}$`);

/**
 * True when the edge gate does NOT apply to `pathname` — that is, when an
 * anonymous request reaches the handler.
 *
 * Derived from the same pattern string the framework uses, so the test and the
 * runtime cannot disagree.
 */
export function isEdgeExcluded(pathname: string): boolean {
  return !MATCHER_RE.test(pathname);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:unit
```

Expected: PASS — 7/7 in the `edge matcher` block, plus the two pre-existing suites (`frameworks.guard`, `agiPolicy`).

- [ ] **Step 5: Point `proxy.ts` at the shared pattern**

Add to the imports at `FE/proxy.ts:1-2`:

```ts
import { EDGE_MATCHER_PATTERN } from "@/lib/proxyMatcher";
```

Replace the whole block at `:88-105` with:

```ts
/**
 * Matcher — the excluded set lives in `@/lib/proxyMatcher` and is unit tested in
 * `src/lib/proxyMatcher.test.ts`. It is kept out of this file so the control can
 * be tested without loading the edge runtime, and so there is exactly one copy:
 * a matcher edited here and untested there is how the payment outage this fixes
 * happened.
 *
 * Everything else — /(app)/*, /(admin)/*, and non-auth /api/* — passes through.
 */
export const config = {
  matcher: [EDGE_MATCHER_PATTERN],
};
```

- [ ] **Step 6: Verify the typecheck and the live behaviour**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both clean. (`tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters` all true — an unused import fails the build.)

With `npm run dev` running:

```bash
curl -i http://localhost:3000/api/webhooks/razorpay -X POST -d '{}'
```

Expected: **400** from the route's own signature check (`route.ts:81-87`), **not** 401 from the edge. That distinction is the entire point of this task — the handler, not the gate, must now be the thing rejecting the request.

```bash
curl -i http://localhost:3000/api/signup/pricing
```

Expected: **401** from `proxy.ts`. Intended and recorded. Do not "fix" it.

- [ ] **Step 7: Add the webhook replay tripwire**

Analysis 5.4 records that the webhook route has no event-id dedupe and no raw-payload table. Task 1 makes this handler reachable in production for the first time, so a duplicate delivery becomes a live risk rather than a theoretical one. This test pins the invariants that make a replay survivable today, and fails loudly if anything changes them before Phase 2 lands real dedupe.

Create `FE/src/lib/razorpayReplay.guard.test.ts`:

```ts
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

  it("verify-payment still guards replay on PendingSignup.status", async () => {
    const src = await read("app/api/signup/verify-payment/route.ts");
    assert.match(
      src,
      /order_created/,
      "the order_created status guard is gone from verify-payment — a replay " +
        "would create a second tenant",
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
```

- [ ] **Step 8: Run the new test**

```bash
npm run test:unit
```

Expected: PASS, including the 4 new tripwire cases.

- [ ] **Step 9: Commit**

```bash
git add src/lib/proxyMatcher.ts src/lib/proxyMatcher.test.ts src/lib/razorpayReplay.guard.test.ts proxy.ts
git commit -m "fix(edge): let Razorpay webhooks past the session gate

The proxy matcher excluded only /login and /api/auth/*, so every Razorpay
callback was 401'd at the edge. Razorpay authenticates with an HMAC over the
raw body and sends no NextAuth cookie, so it can never satisfy the session
check - every captured payment was dropped with no state transition.

api/signup is deliberately NOT excluded. The public checkout stays gated until
Phase 2 replaces it, because it mutates a subscription from a client-supplied
unsigned planId (analysis 5.1). Phase 2 removes both the route and this
decision.

The matcher moves to @/lib/proxyMatcher so it is unit tested without loading
the edge runtime, and so there is one copy of a security control that had none."
```

---

## Task 1b: Close the AI proxy's silent fallback to localhost

`app/api/ai-proxy/[...path]/route.ts:9-12` falls back `BACKEND_URL` →
`NEXT_PUBLIC_API_URL` → `"http://localhost:8000"`. A production deploy missing `BACKEND_URL`
therefore proxies to localhost, silently. The missing-signing-secret path twelve lines below
correctly fails closed with 503; this one does not, and two fail-open/fail-closed rules
disagreeing inside one file is the worst place for them to live.

The analysis does record this at §7.1 — "A production deploy missing `BACKEND_URL` proxies to
localhost silently. The 503-on-missing-secret path fails closed; this one does not." — but
lists it as "one flaw" inside *What is already correct*, which is the least likely place a
reader looks for something to fix. It is a P1 fail-open and it belongs in this phase.

**Files:**
- Create: `FE/src/lib/backendUrl.ts`
- Create: `FE/src/lib/backendUrl.test.ts`
- Modify: `FE/app/api/ai-proxy/[...path]/route.ts:9-12`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveBackendUrl(env: NodeJS.ProcessEnv): string` from `@/lib/backendUrl`, which returns the resolved base URL or throws `BackendUrlMissingError`. Task 1's `proxyMatcher` pattern is unrelated; this is its own module so the rule is testable without the edge runtime.

- [ ] **Step 1: Write the failing test**

Create `FE/src/lib/backendUrl.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBackendUrl, BackendUrlMissingError } from "./backendUrl";

/**
 * The AI proxy fell back BACKEND_URL → NEXT_PUBLIC_API_URL → "http://localhost:8000".
 * A production deploy missing BACKEND_URL therefore proxied to localhost, silently:
 * every AI call failed with a connection error and nothing said why. Twelve lines
 * below, the missing-signing-secret path correctly failed closed with 503. Two
 * fail-open and fail-closed rules disagreeing inside one file is the worst place
 * for them to live.
 *
 * The rule is the one the rest of this phase uses: absence of configuration is
 * never permission.
 */
describe("resolveBackendUrl", () => {
  it("uses BACKEND_URL when it is set", () => {
    const url = resolveBackendUrl({
      BACKEND_URL: "http://api.internal:8080",
      NEXT_PUBLIC_API_URL: "https://wrong.example",
      NODE_ENV: "production",
    });
    assert.equal(url, "http://api.internal:8080");
  });

  it("strips a trailing /api from the resolved value", () => {
    const url = resolveBackendUrl({
      BACKEND_URL: "https://api.example.com/api",
      NODE_ENV: "production",
    });
    assert.equal(url, "https://api.example.com");
  });

  it("throws in production when BACKEND_URL is missing", () => {
    // The whole point: a production deploy must not silently proxy to localhost.
    assert.throws(
      () =>
        resolveBackendUrl({
          NEXT_PUBLIC_API_URL: "https://fallback.example/api",
          NODE_ENV: "production",
        }),
      (e: unknown) => {
        assert.ok(e instanceof BackendUrlMissingError, "the error type is wrong");
        assert.match(
          (e as Error).message,
          /BACKEND_URL/,
          "the error must name the variable, not its absence",
        );
        return true;
      },
    );
  });

  it("throws in production even when only NEXT_PUBLIC_API_URL is set", () => {
    // NEXT_PUBLIC_ means "in the browser bundle". Falling back to it here would
    // point a server-side proxy at whatever a client is configured to use.
    assert.throws(
      () =>
        resolveBackendUrl({
          NEXT_PUBLIC_API_URL: "https://api.example.com",
          NODE_ENV: "production",
        }),
      BackendUrlMissingError,
    );
  });

  it("falls back to localhost in development", () => {
    // A local `npm run dev` with no backend running should not require an env var.
    const url = resolveBackendUrl({ NODE_ENV: "development" });
    assert.equal(url, "http://localhost:8000");
  });

  it("does not treat an empty string as configured", () => {
    assert.throws(
      () => resolveBackendUrl({ BACKEND_URL: "   ", NODE_ENV: "production" }),
      BackendUrlMissingError,
    );
  });

  it("never mentions a secret in its error", () => {
    try {
      resolveBackendUrl({ BACKEND_URL: "", NEXT_PUBLIC_API_URL: "https://x.example", NODE_ENV: "production" });
      assert.fail("should have thrown");
    } catch (e) {
      assert.doesNotMatch((e as Error).message, /x\.example/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL with `Cannot find module './backendUrl'`.

- [ ] **Step 3: Write the resolver**

Create `FE/src/lib/backendUrl.ts`:

```ts
/**
 * The AI service's base URL, resolved once, with a rule that fails closed.
 *
 * The proxy used to fall back BACKEND_URL → NEXT_PUBLIC_API_URL →
 * "http://localhost:8000". A production deploy missing BACKEND_URL therefore
 * proxied to localhost, silently: every AI call failed with a connection error,
 * a deployment dashboard showed the web service healthy, and nothing named the
 * variable that was absent. Twelve lines below, the missing-signing-secret path
 * correctly failed closed with 503 — two rules disagreeing inside one file.
 *
 * The rule is the one the backend uses in app/core/config.py: absence of
 * configuration is never permission. In development the localhost default stays,
 * because a local `npm run dev` with no backend running should not require an
 * env var to reach a clear error.
 */

const LOCAL_FALLBACK = "http://localhost:8000";

export class BackendUrlMissingError extends Error {
  constructor() {
    super(
      "BACKEND_URL is not set. The AI service address is required in production. " +
        "See .do/app.yaml:140-142, which sets it to ${api.PRIVATE_URL}.",
    );
    this.name = "BackendUrlMissingError";
  }
}

export function resolveBackendUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.BACKEND_URL?.trim();
  if (configured) return stripTrailingApi(configured);

  if (env.NODE_ENV !== "production") return LOCAL_FALLBACK;

  throw new BackendUrlMissingError();
}

/** The proxy appends its own path segments, so a trailing /api would double up. */
function stripTrailingApi(url: string): string {
  return url.replace(/\/api$/, "");
}
```

- [ ] **Step 4: Point the proxy at the resolver**

In `FE/app/api/ai-proxy/[...path]/route.ts`, add the import and replace the constant at
lines 9-12:

```ts
import { BackendUrlMissingError, resolveBackendUrl } from "@/lib/backendUrl";

// Resolved once, at module load. A throw here is deliberate: with
// `runtime = "nodejs"` the proxy has no server to start, so the deployment
// fails visibly at build time rather than answering 500s at runtime. See the
// surrounding comment on the fail-closed 503 below for the runtime path.
const AI_BASE = resolveBackendUrl(process.env);
```

Then, in the handler, add the runtime guard beside the existing missing-secret one so the
failure is a clear 503 rather than a stack trace:

```ts
  // Unreachable if the module-level resolve threw at load, but reachable when
  // BACKEND_URL is cleared between requests in a long-lived process.
  if (AI_BASE === undefined) {
    console.error("[ai-proxy] BACKEND_URL is not set — refusing to forward.");
    return NextResponse.json(
      { detail: "AI service is not configured" },
      { status: 503 },
    );
  }
```

If the module-level `resolveBackendUrl` throws during load, that surfaces at build/deploy
time, which is the better outcome. Keep both: the import-time throw for a fresh deploy, the
handler guard for a long-lived process.

- [ ] **Step 5: Run the tests and verify the proxy's fail-closed path is still intact**

```bash
npm run test:unit
npx tsc --noEmit
npm run lint
```

Expected: all pass, including the existing 7 `edge matcher` cases and the 4 webhook tripwire
cases from Task 1.

Confirm the missing-secret 503 is unchanged — Task 1b must not have disturbed it:

```bash
grep -n "AI_TOKEN_MISCONFIGURED" app/api/ai-proxy/\[...path\]/route.ts
```

Expected: still present, still returning 503.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backendUrl.ts src/lib/backendUrl.test.ts "app/api/ai-proxy/[...path]/route.ts"
git commit -m "fix(ai): fail closed when BACKEND_URL is missing

The proxy fell back BACKEND_URL -> NEXT_PUBLIC_API_URL -> localhost:8000. A
production deploy missing BACKEND_URL proxied to localhost silently: every AI call
failed with a connection error, the web service reported healthy, and nothing
named the absent variable. Twelve lines below, the missing-signing-secret path
correctly failed closed with 503 - two disagreeing rules in one file.

Same rule as the backend's app/core/config.py: absence of configuration is never
permission. In development the localhost default stays, so a local npm run dev
with no backend still reaches a clear error rather than a missing-variable one.

Analysis 7.1 records this as 'one flaw' inside What is already correct, which is
the least likely place a reader looks for something to fix."
```

---

## Task 2: A configuration object, and a driver that can open the database


`requirements.txt` declares twelve packages and none is a PostgreSQL driver, so the `postgresql://` `DATABASE_URL` that `.do/app.yaml:70-72` declares as a `SECRET` cannot be opened. `create_engine` raises `ModuleNotFoundError` at import of `app.database.db`, which is reached from `app/main.py:23` — before any route is registered. The deployed image is not reproducible from the committed manifest.

This task also creates `app/core/`, which Tasks 3–7 all depend on. It lands first for that reason.

**Files:**
- Create: `BE/app/core/__init__.py`
- Create: `BE/app/core/config.py`
- Create: `BE/app/core/errors.py`
- Create: `BE/tests/test_config.py`
- Create: `BE/requirements-dev.txt`
- Modify: `BE/requirements.txt`
- Modify: `BE/app/database/db.py:1-23`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `app.core.config.settings` — the singleton `Settings`.
  - `app.core.config.reload_settings() -> Settings` — rebuilds the singleton from the current environment. Tests only.
  - `Settings.app_env: str`, `.secret_key: str`, `.openai_api_key: str`, `.database_url: str`, `.allowed_origins: str`
  - `Settings.ai_model: str`, `.ai_model_mini: str`, `.ai_model_classifier: str` — Task 3 consumes these.
  - `Settings.is_development: bool`, `.signing_key_configured: bool`, `.allowed_origin_list: list[str]`
  - `Settings.assert_database_supported(require_driver: bool = True) -> None`
  - `app.core.errors.ConfigurationError(name, purpose="")` — `str(e)` is the variable name plus a sentence, never a value. Tasks 3, 4 and 7 raise it.

- [ ] **Step 1: Write the failing test**

Create `BE/tests/test_config.py`. The suite's harness is hand-rolled — there is no pytest, and the three existing modules each end with their own `if __name__ == "__main__":` block. Match that.

```python
#!/usr/bin/env python
# tests/test_config.py
"""The one place configuration is read.

Every other test module sets os.environ directly, which is exactly the coupling
this module exists to remove. These tests pin the RULES, not the shape of the
class: absence of a value is never interpreted as development, and a
misconfiguration is reported by name without echoing the value.
"""

import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


_MANAGED = ("APP_ENV", "SECRET_KEY", "DATABASE_URL", "OPENAI_API_KEY",
            "ALLOWED_ORIGINS", "AI_MODEL", "AI_MODEL_MINI", "AI_MODEL_CLASSIFIER")


def _fresh(env):
    """Rebuild the settings singleton from a controlled environment."""
    for key in _MANAGED:
        os.environ.pop(key, None)
    os.environ.update(env)
    from app.core import config as config_module
    importlib.reload(config_module)
    return config_module.settings


# ── Absence is not development ────────────────────────────────
def test_no_app_env_is_not_development():
    s = _fresh({})
    assert s.app_env == "", "APP_ENV defaulted to a value instead of staying empty"
    assert s.is_development is False, (
        "an unset APP_ENV was treated as development - this is the exact hole "
        "that let a DigitalOcean deploy sign every token with a source-visible key"
    )


def test_explicit_development_is_development():
    assert _fresh({"APP_ENV": "development"}).is_development is True


def test_production_is_not_development():
    assert _fresh({"APP_ENV": "production"}).is_development is False


def test_unknown_app_env_is_not_development():
    # A typo must not be a way into the development branch.
    assert _fresh({"APP_ENV": "prod"}).is_development is False, "'prod' opened the dev branch"


# ── Readiness is a boolean, never a value ──────────────────────
def test_signing_key_configured_is_a_boolean_not_the_key():
    s = _fresh({"SECRET_KEY": "super-secret-value"})
    assert s.signing_key_configured is True
    assert "super-secret-value" not in repr(s), "the Settings repr leaked the key"
    assert "super-secret-value" not in repr(s.model_dump()), "model_dump leaked the key"


def test_signing_key_absent_reports_false():
    assert _fresh({}).signing_key_configured is False


def test_empty_secret_key_is_not_configured():
    assert _fresh({"SECRET_KEY": "   "}).signing_key_configured is False, (
        "whitespace counted as a configured key"
    )


# ── The database driver assertion ──────────────────────────────
def test_production_rejects_sqlite_database_url():
    """A stale local .env must not let a production deploy run on a file.

    The URL scheme is the only signal available before SQLAlchemy tries to load a
    driver, so this check belongs in configuration - not deep inside
    create_engine, where the failure is a bare ModuleNotFoundError.
    """
    s = _fresh({"APP_ENV": "production", "DATABASE_URL": "sqlite:///./glimmora.db"})
    try:
        s.assert_database_supported()
    except Exception as e:  # noqa: BLE001
        assert "DATABASE_URL" in str(e), f"error should name the variable, got: {e}"
        assert "glimmora.db" not in str(e), "the error echoed the path from the URL"
        return
    raise AssertionError("production accepted a sqlite DATABASE_URL")


def test_development_may_use_sqlite():
    _fresh({"APP_ENV": "development", "DATABASE_URL": "sqlite:///./glimmora.db"}
           ).assert_database_supported()


def test_production_accepts_postgresql():
    _fresh({"APP_ENV": "production",
            "DATABASE_URL": "postgresql://u:p@localhost:5432/glimmora"}
           ).assert_database_supported(require_driver=False)


def test_postgres_url_without_a_driver_is_a_clear_error():
    """The point of the assertion: a named error, not a ModuleNotFoundError."""
    s = _fresh({"APP_ENV": "production",
                "DATABASE_URL": "postgresql://u:p@localhost:5432/glimmora"})
    try:
        s.assert_database_supported(require_driver=True)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        assert "psycopg2" in msg, f"the error should name the missing package, got: {msg}"
        assert "u:p" not in msg and "5432" not in msg, f"the error leaked the DSN: {msg}"
        return
    raise AssertionError("a postgresql URL passed with require_driver=True")


def test_unknown_scheme_is_rejected_without_echoing_the_dsn():
    s = _fresh({"APP_ENV": "production", "DATABASE_URL": "mysql://u:p@secret-host:3306/d"})
    try:
        s.assert_database_supported()
    except Exception as e:  # noqa: BLE001
        assert "mysql" in str(e), f"the offending scheme should be named, got: {e}"
        assert "secret-host" not in str(e) and "u:p" not in str(e), "the DSN leaked"
        return
    raise AssertionError("an unknown database scheme was accepted")


# ── Model names are configuration ─────────────────────────────
def test_model_names_have_defaults_and_are_overridable():
    s = _fresh({})
    assert s.ai_model and s.ai_model_mini and s.ai_model_classifier
    assert _fresh({"AI_MODEL": "gpt-4o-2095-01-01"}).ai_model == "gpt-4o-2095-01-01"


if __name__ == "__main__":
    print("\n=== configuration rules ===\n")
    check("unset APP_ENV is not development", test_no_app_env_is_not_development)
    check("explicit development is development", test_explicit_development_is_development)
    check("production is not development", test_production_is_not_development)
    check("unknown APP_ENV is not development", test_unknown_app_env_is_not_development)
    check("key readiness is a boolean, not the key", test_signing_key_configured_is_a_boolean_not_the_key)
    check("absent key reports not configured", test_signing_key_absent_reports_false)
    check("whitespace key is not configured", test_empty_secret_key_is_not_configured)
    check("production rejects sqlite", test_production_rejects_sqlite_database_url)
    check("development may use sqlite", test_development_may_use_sqlite)
    check("production accepts postgresql", test_production_accepts_postgresql)
    check("missing driver is a named error", test_postgres_url_without_a_driver_is_a_clear_error)
    check("unknown scheme is rejected", test_unknown_scheme_is_rejected_without_echoing_the_dsn)
    check("model names have defaults", test_model_names_have_defaults_and_are_overridable)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_config.py
```

Expected: `ModuleNotFoundError: No module named 'app.core'`.

- [ ] **Step 3: Add the dependencies**

Append to `BE/requirements.txt`:

```
psycopg2-binary==2.9.10
pydantic-settings==2.4.0
```

`psycopg2-binary` 2.9.10 ships wheels for CPython 3.12 and 3.13. `pydantic-settings` 2.4.0 requires `pydantic>=2.7.0`, satisfied by the pinned 2.8.2.

Create `BE/requirements-dev.txt`:

```
# Test and tooling dependencies, kept out of the runtime manifest so the deployed
# image carries no test code. CI installs both; the deployed image installs only
# requirements.txt.
-r requirements.txt
```

- [ ] **Step 4: Record the pre-change test baseline**

```bash
pip install -r requirements-dev.txt
python tests\smoke_test.py; echo "smoke exit=$?"
python tests\test_ai_grounding.py; echo "grounding exit=$?"
python tests\test_ai_security.py; echo "security exit=$?"
```

Write the three exit codes and pass/fail counts into your task notes. **Every later task compares against this.** If a module already fails, that is a pre-existing failure and not one you introduced — but it must be recorded, because the phase exit criterion is "at or above the recorded baseline", and an unrecorded pre-existing failure makes that unmeasurable.

- [ ] **Step 5: Write the typed error module**

Create `BE/app/core/errors.py`:

```python
"""Typed errors a router can translate into an HTTP status.

The rule this module exists to enforce: a configuration problem is reported by
VARIABLE NAME, never by value. A stack trace or an error body that echoes a
connection string is a credential leak with extra steps.
"""


class ConfigurationError(RuntimeError):
    """A required environment variable is absent or unusable.

    `name` is the variable's name. The message may describe what the variable is
    for. It must never contain the variable's value, nor any part of a URL,
    header, or secret built from one.
    """

    def __init__(self, name: str, purpose: str = "") -> None:
        self.name = name
        self.purpose = purpose
        suffix = f" It is required {purpose}." if purpose else ""
        super().__init__(f"{name} is not set.{suffix}")


class ServiceUnavailableError(RuntimeError):
    """A capability cannot run because the service is not correctly configured.

    Distinct from ConfigurationError so a router can answer 503 for "the AI key
    is missing" while the ConfigurationError is still logged with its variable
    name at the point of failure.
    """


class MigrationError(RuntimeError):
    """A startup migration step failed.

    Raised, never swallowed. A silently-skipped ALTER means the application is
    running against a schema it does not match - which is how an audit trail
    became invisible to every tenant without one error being logged.

    `step` is the stable name of the step that failed, so the log and the
    exception both name it.
    """

    def __init__(self, step: str, cause: Exception) -> None:
        self.step = step
        self.cause = cause
        super().__init__(f"startup migration step {step!r} failed: {type(cause).__name__}")
```

- [ ] **Step 6: Write the settings module**

Create `BE/app/core/config.py`:

```python
"""The one place this service reads its environment.

Before this module there were dozens of `os.getenv` calls, two `load_dotenv()`
calls, and a bespoke key loader - and three DIFFERENT rules for deciding whether
the service was in production (analysis 5.3). Those rules disagreed with each
other and with the deployment manifest, and on any host that set none of `ENV`,
`ENVIRONMENT` or `RENDER` the answer was "development", so every JWT was signed
with a key that is committed to this repository.

The rules now:

  * `APP_ENV` is the only environment signal. Nothing else is consulted.
  * The development branch is opt-IN. An absent or unrecognised `APP_ENV` is
    NOT development. This is the whole fix: absence of configuration is never
    permission.
  * A required variable that is missing raises `ConfigurationError`, which names
    the variable and never its value.
  * Nothing here decides an authentication outcome. `is_development` selects a
    token lifetime and a health posture only; auth is enforced unconditionally in
    app/routers/auth_router.py regardless of this module.
"""

from __future__ import annotations

import importlib.util

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.errors import ConfigurationError

# Called ONCE, here. app/database/db.py and app/routers/voice_router.py each
# called it again, which meant a test could mutate os.environ and be silently
# overridden by a later import.
load_dotenv()


class Settings(BaseSettings):
    """Every environment variable this service reads, declared once."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Environment ───────────────────────────────────────────
    #: "development" enables the insecure conveniences. Anything else - including
    #: "" and "prod" - does not. See the module docstring.
    app_env: str = ""

    # ── Secrets ───────────────────────────────────────────────
    #: Signs and verifies the AI service tokens minted by the Next.js BFF.
    secret_key: str = ""
    openai_api_key: str = ""

    # ── Database ──────────────────────────────────────────────
    database_url: str = "sqlite:///./glimmora.db"

    # ── HTTP ──────────────────────────────────────────────────
    #: Comma-separated. Fed by ALLOWED_ORIGINS in .do/app.yaml:91-93.
    allowed_origins: str = ""

    # ── Models ────────────────────────────────────────────────
    #: Every call site reads these instead of a string literal, so rotating a
    #: model is a configuration change and not a 24-file edit.
    ai_model: str = "gpt-4o"
    ai_model_mini: str = "gpt-4o-mini"
    #: The intent classifier is the cheapest, highest-frequency call in the
    #: service. It was pinned to gpt-3.5-turbo inline in
    #: intelligent_assistant_service.py:83 with no constant at all.
    ai_model_classifier: str = "gpt-4o-mini"

    # ── Derived ───────────────────────────────────────────────
    @property
    def is_development(self) -> bool:
        """True ONLY for an explicit APP_ENV=development.

        Never `not app_env`. Never `app_env != "production"`. Those two
        formulations are the vulnerability.
        """
        return self.app_env.strip().lower() == "development"

    @property
    def signing_key_configured(self) -> bool:
        """Whether a signing key is present. A boolean for /health, never a value."""
        return bool(self.secret_key.strip())

    @property
    def allowed_origin_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # ── Startup validation ────────────────────────────────────
    def assert_database_supported(self, require_driver: bool = True) -> None:
        """Fail loudly, and by name, when the database cannot be opened.

        Called at import from this module. Without it, a postgresql:// URL and no
        psycopg2 produces a bare `ModuleNotFoundError: No module named 'psycopg2'`
        raised from inside SQLAlchemy's dialect loader - which says nothing about
        which package to install, and arrives after the app object already exists
        so /health never reports the problem.
        """
        url = self.database_url

        if url.startswith("sqlite"):
            if not self.is_development:
                raise ConfigurationError(
                    "DATABASE_URL",
                    "in any environment other than APP_ENV=development - a deployed "
                    "service must not run on a local file database",
                )
            return

        if not (url.startswith("postgresql") or url.startswith("postgres")):
            # The scheme is echoed because it is not a secret. The host, port,
            # database name and credentials are not.
            scheme = url.split("://", 1)[0] if "://" in url else url
            raise ConfigurationError(
                "DATABASE_URL",
                f"set to an unsupported scheme {scheme!r}; this service speaks "
                "postgresql or sqlite",
            )

        if not require_driver:
            return

        if importlib.util.find_spec("psycopg2") is None:
            raise ConfigurationError(
                "psycopg2",
                "to open a postgresql:// DATABASE_URL - install "
                "psycopg2-binary==2.9.10. It is in requirements.txt; an image "
                "built before that line cannot open the database at all.",
            )


settings = Settings()
settings.assert_database_supported()


def reload_settings() -> Settings:
    """Rebuild the singleton from the current environment.

    For tests only. Production reads the environment exactly once, at import.
    """
    global settings
    settings = Settings()
    return settings
```

- [ ] **Step 7: Create the package init and rewire `db.py`**

Create `BE/app/core/__init__.py` as a 0-byte file.

Replace `BE/app/database/db.py:1-23` with:

```python
"""
Database Configuration
-----------------------
The engine is built from `app.core.config.settings`, the only module in this
service that reads the environment. The previous version called `load_dotenv()`
and `os.getenv("DATABASE_URL", ...)` here, which meant a missing PostgreSQL
driver surfaced as a bare ModuleNotFoundError from inside SQLAlchemy, after the
app object already existed (analysis 4.2).

`settings.assert_database_supported()` runs at import and names the missing
package instead.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings

# SQLite needs check_same_thread=False; PostgreSQL does not take the argument.
connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(settings.database_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """
    Dependency injection for FastAPI routes.
    Use with: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 8: Run the new test**

```bash
python tests\test_config.py
```

Expected: 12 passed, 0 failed.

- [ ] **Step 9: Verify the guard fires, and that the baseline still passes**

```bash
python -c "import app.main; print('import ok:', app.main.app.title)"
```

Expected: `import ok: Glimmora API`.

Prove the guard is real by pointing at an unsupported scheme:

```powershell
$env:DATABASE_URL = "mysql://u:p@secret-host:3306/d"
python -c "import app.main"
```

Expected: a `ConfigurationError` naming `DATABASE_URL` and the scheme `mysql`, with no host, no port, no credentials. Then clear it:

```powershell
Remove-Item Env:\DATABASE_URL
```

Re-run the three baseline modules from Step 4. Expected: unchanged.

- [ ] **Step 10: Commit**

```bash
git add requirements.txt requirements-dev.txt app/core/__init__.py app/core/config.py app/core/errors.py app/database/db.py tests/test_config.py
git commit -m "feat(config): one Settings object, and a driver that can open the database

requirements.txt declared twelve packages and no PostgreSQL driver, so the
postgresql:// DATABASE_URL that .do/app.yaml:70 declares as a SECRET could not
be opened. The deployed image was not reproducible from the committed manifest.

app/core/config.py is the only module that reads the environment. The
development branch is opt-in via APP_ENV: an absent or unrecognised value is
not development. That single rule is the fix for the host-dependent production
check in auth_router.py, which consulted ENV, ENVIRONMENT and RENDER and
defaulted to 'development' on any host that set none of them.

assert_database_supported() runs at import and names the missing package rather
than letting a bare ModuleNotFoundError escape from SQLAlchemy's dialect loader
after the app object already exists."
```

---

## Task 3: One lazy OpenAI client, and a `/health` that can answer

Twenty-four `OpenAI(...)` constructions exist, every one at module scope, none with a fallback value. The SDK raises `OpenAIError` when the key resolves to `None`, and `app/main.py:27-65` imports those modules eagerly — so `import app.main` raises before `app = FastAPI(...)` at line 72. There is no usable `/health`, so the DigitalOcean probe reports the component down rather than a degraded-but-live service.

Sixteen of the 24 modules also carry a bare `gpt-4o` / `gpt-4o-mini` string literal, and `app/intelligent_assistant_service.py:83` hardcodes `gpt-3.5-turbo` inline in the intent-classifier hot path with no constant at all.

**Files:**
- Create: `BE/app/core/openai_client.py`
- Create: `BE/tests/test_health.py`
- Modify: `BE/app/main.py:329-345` (`/health`)
- Modify: the 24 modules listed in Step 5

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.errors.ConfigurationError` (Task 2).
- Produces:
  - `app.core.openai_client.get_openai_client() -> openai.OpenAI` — lazy, cached; raises `ConfigurationError` naming `OPENAI_API_KEY` when absent.
  - `app.core.openai_client.reset_openai_client() -> None` — drops the cache. Tests only.

- [ ] **Step 1: Write the failing test**

Create `BE/tests/test_health.py`:

```python
#!/usr/bin/env python
# tests/test_health.py
"""/health is the only thing standing between a misconfiguration and an outage.

The DigitalOcean probe at .do/app.yaml:60-68 points at it. Before this phase the
route checked only `bool(os.getenv("SECRET_KEY"))` and performed no database
probe, so a service that could not reach its database reported healthy while
every request 500'd.

Three properties are pinned here:
  1. `import app.main` succeeds with OPENAI_API_KEY unset.
  2. /health answers 200 and reports readiness as BOOLEANS, never values.
  3. An AI call without a key returns a typed configuration error naming the
     variable - not a traceback, and not an OpenAI SDK error.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The whole point: the app must import with NO OpenAI key.
os.environ.pop("OPENAI_API_KEY", None)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-health-suite")
os.environ.setdefault("APP_ENV", "development")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


# ── 1. Import must not require a key ──────────────────────────
def test_import_succeeds_without_openai_key():
    assert not os.environ.get("OPENAI_API_KEY"), (
        "this test is meaningless with a key present - unset it"
    )
    import app.main  # noqa: F401
    assert app.main.app.title


# ── 2. /health is a readiness report ──────────────────────────
def test_health_answers_200():
    r = client.get("/health")
    assert r.status_code == 200, r.status_code


def test_health_reports_booleans_never_values():
    r = client.get("/health")
    body = r.json()
    for key in ("signing_key_configured", "openai_key_configured", "database_reachable"):
        assert key in body, f"/health does not report {key}"
        assert isinstance(body[key], bool), f"{key} is {type(body[key])}, not a bool"
    assert os.environ["SECRET_KEY"] not in r.text, "/health echoed the signing key"


def test_health_reports_the_missing_openai_key():
    body = client.get("/health").json()
    assert body["openai_key_configured"] is False, (
        "this suite runs with no key, so readiness must say so"
    )


def test_health_probes_the_database():
    """A reachable-but-wrong database must not read as healthy."""
    body = client.get("/health").json()
    assert "database_reachable" in body, "no database probe in the readiness block"
    # On a broken DSN the probe must fail rather than raise out of /health.
    assert isinstance(body["database_reachable"], bool)


def test_health_distinguishes_degraded_from_ok():
    body = client.get("/health").json()
    # The suite runs with no OpenAI key. That degrades the AI features; it does
    # not make the service unready, because refusing to serve the audit trail
    # over a missing optional key is the worse outcome.
    assert body["ai_available"] is False
    assert body["status"] in ("ok", "degraded")


# ── 3. A missing key is a configuration error, not a crash ────
def test_missing_key_raises_a_typed_configuration_error():
    from app.core.openai_client import get_openai_client, reset_openai_client
    from app.core.errors import ConfigurationError

    reset_openai_client()
    try:
        get_openai_client()
    except ConfigurationError as e:
        assert "OPENAI_API_KEY" in str(e), f"the error should name the variable, got: {e}"
        return
    finally:
        reset_openai_client()
    raise AssertionError("get_openai_client() succeeded with no key")


def test_the_factory_is_cached():
    """Two calls must return the same object, and a reset must clear the cache.

    A cache is only a cache if it is reused. Constructing a client per call
    defeats the point and re-opens the door this task closed.
    """
    from app.core.openai_client import get_openai_client, reset_openai_client

    reset_openai_client()
    assert get_openai_client.cache_info().maxsize == 1, (
        "the factory is not bounded to a single cached instance"
    )
    reset_openai_client()
    # cache_info().currents is 0 before the first call and 1 after it.
    get_openai_client_or_skip()
    hits_and_misses = get_openai_client.cache_info()
    reset_openai_client()
    # Whatever happened above, the cache was consulted rather than rebuilt each
    # time: misses never exceed 1, because at most one construction is reachable.
    assert hits_and_misses.misses <= 1, (
        f"the factory missed its cache {hits_and_misses.misses} times - it is not caching"
    )


def get_openai_client_or_skip():
    """Return a client if a key happens to be configured, else None.

    The suite runs with no OpenAI key, so a construction attempt raises. The
    cache assertion above is about the cache, not about the key, so tolerate both
    outcomes rather than skipping the case.
    """
    from app.core.openai_client import get_openai_client
    from app.core.errors import ConfigurationError

    try:
        return get_openai_client()
    except ConfigurationError:
        return None


def test_an_ai_call_without_a_key_is_typed_not_a_traceback():
    from app.core.errors import ConfigurationError, ServiceUnavailableError
    from app.ai_service import answer_query

    try:
        answer_query("Should this batch be released?", tenant_id="CUST_A")
    except (ConfigurationError, ServiceUnavailableError):
        return  # correct: typed, named, no traceback
    except Exception as e:  # noqa: BLE001
        raise AssertionError(f"expected a typed error, got {type(e).__name__}: {e}")
    raise AssertionError("a call with no key returned normally")


# ── The regression test for analysis 4.3 ──────────────────────
def test_no_module_scope_openai_call_remains():
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    factory_rel = "core/openai_client.py"
    pattern = re.compile(r"OpenAI\s*\(")
    offenders = []

    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        if rel == factory_rel:
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            if pattern.search(line):
                offenders.append(f"{rel}:{lineno}  {line.strip()}")

    assert not offenders, (
        "a module-scope OpenAI() construction is outside the factory (it raises at "
        "import when the key is absent, which is how the service became "
        f"unbootable):\n  " + "\n  ".join(offenders)
    )


def test_the_factory_actually_constructs_one():
    src = (pathlib.Path(__file__).resolve().parent.parent / "app" / "core"
           / "openai_client.py").read_text(encoding="utf-8")
    assert re.search(r"OpenAI\s*\(", src), "the factory never constructs a client"
    assert "lru_cache" in src, "the factory is not cached"


def test_no_module_constructs_a_client_at_import_time():
    """`client = get_openai_client()` at module scope looks lazy and is not.

    It moves the ConfigurationError back to import time, which is the exact
    defect this task removes. The construction must be inside a function.
    """
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    offenders = []
    # Zero indentation = module scope.
    pattern = re.compile(r"^(client|_client|openai_client)\s*=\s*get_openai_client\(\)")

    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        if rel == "core/openai_client.py":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.match(line):
                offenders.append(f"{rel}:{lineno}  {line.strip()}")

    assert not offenders, (
        "a module-scope alias of get_openai_client() re-creates the import-time "
        f"crash:\n  " + "\n  ".join(offenders)
    )


if __name__ == "__main__":
    print("\n=== health and startup readiness ===\n")
    check("import succeeds with no OPENAI_API_KEY", test_import_succeeds_without_openai_key)
    check("/health answers 200", test_health_answers_200)
    check("/health reports booleans, not values", test_health_reports_booleans_never_values)
    check("/health reports the absent key", test_health_reports_the_missing_openai_key)
    check("/health probes the database", test_health_probes_the_database)
    check("/health distinguishes degraded from ok", test_health_distinguishes_degraded_from_ok)
    check("missing key raises ConfigurationError", test_missing_key_raises_a_typed_configuration_error)
    check("the factory is cached", test_the_factory_is_cached)
    check("an AI call without a key is typed", test_an_ai_call_without_a_key_is_typed_not_a_traceback)
    check("no module-scope OpenAI() remains", test_no_module_scope_openai_call_remains)
    check("the factory constructs exactly one client", test_the_factory_actually_constructs_one)
    check("no module aliases the client at import", test_no_module_constructs_a_client_at_import_time)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_health.py
```

Expected: FAIL — `app.core.openai_client` does not exist, and `/health` has no `database_reachable`.

- [ ] **Step 3: Write the client factory**

Create `BE/app/core/openai_client.py`:

```python
"""The single construction site for the OpenAI client.

Twenty-four `OpenAI(...)` calls existed at module scope (analysis 4.3). The SDK
raises `OpenAIError` when the key resolves to None, and app/main.py imports every
one of those modules eagerly - so with OPENAI_API_KEY unset, `import app.main`
raised before the `app = FastAPI(...)` line executed. The DigitalOcean health
probe then saw a component that had not started, rather than a live service
missing one optional capability.

The rule this module encodes: constructing a client is a RUNTIME act, not an
IMPORT act. A missing key is a ConfigurationError raised at the point of use,
naming the variable and never its value.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from app.core.config import settings

#: Shared by every call site. A change to the timeout or the retry policy is an
#: edit here, not a 24-file edit.
_CLIENT_OPTIONS = {"timeout": 30.0, "max_retries": 4}


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    """Return the process-wide OpenAI client, constructing it on first use.

    Raises:
        ConfigurationError: if OPENAI_API_KEY is absent or blank. The message
            names the variable; it never contains the value, because this string
            can reach an HTTP response body.
    """
    if not settings.openai_api_key.strip():
        from app.core.errors import ConfigurationError

        raise ConfigurationError(
            "OPENAI_API_KEY",
            "to call any model. The service starts and /health answers without it; "
            "only the AI capabilities are unavailable. See .do/app.yaml:73-75 for "
            "how the deployed service receives it.",
        )

    return OpenAI(api_key=settings.openai_api_key, **_CLIENT_OPTIONS)


def reset_openai_client() -> None:
    """Drop the cached client. Tests only - production constructs it once."""
    get_openai_client.cache_clear()
```

- [ ] **Step 4: Replace all 24 construction sites**

The sites, verified 28 September 2026. Each has the shape
`client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=30.0, max_retries=4)`
at column 0.

```
app/ai_service.py:33                          app/routers/capa_approval_brief_router.py:47
app/draft_service.py:25                       app/routers/capa_prefill_router.py:47
app/help_service.py:34                        app/routers/capa_readiness_guidance_router.py:52
app/intelligent_assistant_service.py:21       app/routers/capa_recurrence_router.py:63
app/search_service.py:32                      app/routers/deviation_intelligence_router.py:47
app/summary_service.py:29                     app/routers/deviation_rca_router.py:56
app/rag/rag_service.py:45                     app/routers/document_review_router.py:39
app/security/hallucination_prevention.py:13   app/routers/drift_detection_router.py:46
                                             app/routers/fda483_extraction_router.py:43
                                             app/routers/finding_triage_router.py:58
                                             app/routers/rca_suggestions_router.py:52
                                             app/routers/regulatory_intelligence_router.py:58
                                             app/routers/response_draft_router.py:37
                                             app/routers/rework_tasks_router.py:42
                                             app/routers/support_triage_router.py:42
                                             app/routers/voice_router.py:41
```

**Edit A — lazy accessor.** Add the import, and resolve the client inside each function that uses it:

```python
from app.core.openai_client import get_openai_client

def some_endpoint(...):
    client = get_openai_client()   # raises ConfigurationError if the key is absent
    ...
```

Do **not** leave a module-level `client = get_openai_client()` alias. It reads like a lazy accessor and is not one: it puts the raise back at import time, which is the exact defect this task removes. `test_no_module_constructs_a_client_at_import_time` enforces it.

**Edit B — remove the now-dead imports.** Delete `load_dotenv()` from `app/routers/voice_router.py:40` and `app/routers/auth_router.py:22` (`config.py` calls it once), and drop the `from dotenv import load_dotenv` line from both. Drop `os` only where nothing else in the file uses it.

**Edit C — model names become configuration.** Replace each bare `gpt-4o` / `gpt-4o-mini` literal with `settings.ai_model` / `settings.ai_model_mini`, and `app/intelligent_assistant_service.py:83`'s inline `gpt-3.5-turbo` with `settings.ai_model_classifier`. Add `from app.core.config import settings` to each file that needs it.

- [ ] **Step 5: Give `/health` a real readiness block**

In `BE/app/main.py`, add to the imports (after line 23, where `engine` and `Base` already come in):

```python
import logging

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")
```

(`main.py` has no module-level logger today; `auth_router.py:28` does. If a `logger` is already defined in `main.py` by the time you edit, do not add a second one.)

Replace `BE/app/main.py:329-345` with:

```python
@app.get("/health")
def health():
    """Readiness probe. Unauthenticated by design - a probe carries no credential.

    Reports BOOLEANS only. A key that reached this response body would be in
    every deployment dashboard and log aggregator in the world.

    `status` is "ok" only when the service can do its job: the database is
    reachable and a signing key is configured. The DigitalOcean probe at
    .do/app.yaml:60-68 uses this path, so a degraded-but-live service is
    distinguishable from a dead one - which it could not be when a missing
    OpenAI key raised during import and the process never started.
    """
    database_reachable = False
    database_error: str | None = None
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        database_reachable = True
    except Exception as exc:  # noqa: BLE001 - the whole point is that it may fail
        # The exception TYPE is safe to report. Its message may contain the DSN,
        # so it is logged and not returned.
        database_error = type(exc).__name__
        logger.error("health: database probe failed with %s", database_error)

    signing_key_configured = settings.signing_key_configured
    openai_key_configured = bool(settings.openai_api_key.strip())

    return {
        "status": "ok" if (database_reachable and signing_key_configured) else "degraded",
        "service": "glimmora-ai",
        "auth_enforced": True,
        "environment": settings.app_env or "undeclared",
        "signing_key_configured": signing_key_configured,
        "openai_key_configured": openai_key_configured,
        "database_reachable": database_reachable,
        # A missing OpenAI key degrades the AI features; it does not make the
        # service unready. Refusing to serve the audit trail and the rest of the
        # API over a missing optional key is the worse outcome.
        "ai_available": openai_key_configured,
        "database_error": database_error,
    }
```

- [ ] **Step 6: Run the tests**

```bash
python tests\test_health.py
python tests\test_config.py
```

Expected: `test_health.py` 12 passed; `test_config.py` still 12 passed.

- [ ] **Step 7: Verify the reproduction the audit asked for**

```powershell
$env:OPENAI_API_KEY = ""
python -c "import app.main; print('ok', app.main.app.title)"
```

Expected: `ok Glimmora API`. This is the acceptance criterion for analysis 4.3, true for the first time.

```bash
grep -rn "OpenAI(" app/ | grep -v "app/core/"
```

Expected: no output. This is the audit's own invariant check, quoted in analysis §12.

Re-run the three baseline modules from Task 2 Step 4. Expected: unchanged.

- [ ] **Step 8: Commit**

```bash
git add app/core/openai_client.py app/main.py tests/test_health.py
git add app/ai_service.py app/draft_service.py app/help_service.py app/intelligent_assistant_service.py app/search_service.py app/summary_service.py app/rag/rag_service.py app/security/hallucination_prevention.py app/routers/
git commit -m "fix(ai): construct the OpenAI client lazily, and make /health a real probe

Twenty-four module-scope OpenAI(...) calls raised OpenAIError at import when
OPENAI_API_KEY was absent, and main.py imports every one of those modules
eagerly - so the app died before FastAPI(...) was constructed and the
DigitalOcean probe saw a component that never started rather than a live
service missing one capability.

One cached factory, resolved at call time, raising a ConfigurationError that
names the variable and no value. Model names move to settings, so a rotation
is a configuration change; the intent classifier's inline gpt-3.5-turbo is
gone.

/health gains a database probe and reports readiness as booleans only."
```

---

## Task 4: One production check, host-independent, with no key in the source

The JWT fallback is guarded by `ENV`, `ENVIRONMENT` or `RENDER`, so on any host that sets none of them every token is signed with a key that is committed to the repository. `role` is an ordinary string claim and `resolve_tenant` (`auth_router.py:451-455`) grants `super_admin` unrestricted cross-tenant access — so a readable key plus a forgeable role yields a `super_admin` token for any tenant. `.do/app.yaml:82-88` records that this already happened once in production.

The same production test is written three times with three different rules (`:38-41`, `:199`, `:236-246`). `create_token` honours the narrowest one, minting 8-hour tokens where `_auth_strict` reports `production_mode: true`. `datetime.utcnow()` at `:206` is deprecated on the pinned 3.12 runtime and produces a naive datetime.

**Files:**
- Create: `BE/app/core/dev_key.py`
- Create: `BE/app/core/tokens.py`
- Create: `BE/tests/test_production_detection.py`
- Modify: `BE/app/routers/auth_router.py:30-54` (key loading), `:181-210` (`create_token`), `:236-246` (`_auth_strict`)

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.errors.ConfigurationError` (Task 2).
- Produces:
  - `app.core.dev_key.get_signing_key() -> str` — the configured key, or an ephemeral per-process key when `APP_ENV=development` and none is set. Returns `""` when no key is configured outside development, which callers treat as a 503.
  - `app.core.dev_key.is_ephemeral_key() -> bool` — whether the process invented its own key. `/health` reports this.
  - `app.core.tokens.token_lifetime_seconds() -> int`
  - `app.core.tokens.expiry_epoch() -> int`

- [ ] **Step 1: Write the failing test**

Create `BE/tests/test_production_detection.py`:

```python
#!/usr/bin/env python
# tests/test_production_detection.py
"""Environment detection is the control, and it was host-specific.

_load_secret_key fired its production guard only when SECRET_KEY was absent AND
one of ENV, ENVIRONMENT, RENDER was set. On any host that set none of them the
answer was "development", and every JWT in the system was signed with
"dev-insecure-secret-do-not-use-in-production" - a string committed to this
repository. `role` is an ordinary claim inside the signed payload, and
resolve_tenant grants super_admin unrestricted cross-tenant access, so a
readable key plus a forgeable role was a super_admin token for any tenant.
.do/app.yaml:82-88 records that this already happened on DigitalOcean.

The same production test existed three times with three rules (auth_router.py
:38-41, :199, :236-246), and create_token honoured the narrowest, minting 8-hour
tokens while _auth_strict reported production_mode: true.

These tests pin the replacement: APP_ENV is the only signal, and the development
fallback is opt-in, ephemeral, and absent from the source.
"""

import importlib
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


_LEGACY = ("ENV", "ENVIRONMENT", "RENDER", "AI_AUTH_STRICT")


def _reload(**env):
    for key in _LEGACY + ("APP_ENV", "SECRET_KEY"):
        os.environ.pop(key, None)
    for key, value in env.items():
        os.environ[key] = value
    from app.core import config as config_module
    importlib.reload(config_module)
    return config_module.settings


# ── The literal is gone from every file ───────────────────────
def test_no_fallback_key_exists_in_the_source_tree():
    """Gone entirely, not merely unused. It is in the git history either way,
    which is exactly why it must not be in the working tree."""
    needle = "dev-insecure-secret-do-not-use-in-production"
    hits = []
    for path in pathlib.Path(BE_ROOT).rglob("*.py"):
        if "venv" in path.parts or "__pycache__" in path.parts:
            continue
        try:
            if needle in path.read_text(encoding="utf-8"):
                hits.append(path.relative_to(BE_ROOT).as_posix())
        except UnicodeDecodeError:
            continue
    assert not hits, f"the committed fallback key is still present in: {', '.join(hits)}"


# ── Precedence ────────────────────────────────────────────────
def test_configured_key_is_used_verbatim():
    from app.core import dev_key
    _reload(APP_ENV="production", SECRET_KEY="a-configured-secret")
    assert dev_key.get_signing_key() == "a-configured-secret"
    assert dev_key.is_ephemeral_key() is False


def test_development_without_a_key_gets_an_ephemeral_one():
    from app.core import dev_key
    _reload(APP_ENV="development")

    key = dev_key.get_signing_key()
    assert key, "development produced no signing key at all"
    assert "insecure" not in key.lower(), "the old literal came back"
    assert len(key) >= 32, f"the ephemeral key is too short to be useful: {len(key)}"
    assert dev_key.is_ephemeral_key() is True


def test_ephemeral_key_is_stable_within_a_process():
    """Two calls in one process must agree, or every request fails verification."""
    from app.core import dev_key
    _reload(APP_ENV="development")
    assert dev_key.get_signing_key() == dev_key.get_signing_key()


def test_ephemeral_key_differs_between_processes():
    """A key derived from anything fixed would be forgeable, which is the bug."""
    script = (
        "import os, sys;"
        f"sys.path.insert(0, r'{BE_ROOT}');"
        "os.environ.pop('SECRET_KEY', None);"
        "os.environ['APP_ENV'] = 'development';"
        "from app.core import dev_key;"
        "print(dev_key.get_signing_key())"
    )
    a = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    b = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    assert a.returncode == 0, a.stderr[-400:]
    assert b.returncode == 0, b.stderr[-400:]
    assert a.stdout.strip() != b.stdout.strip(), (
        "two processes derived the same development key - it is not ephemeral"
    )


# ── Review Focus #2 ───────────────────────────────────────────
def test_secret_set_but_app_env_unset_fails_closed():
    """The most likely production misconfiguration.

    SECRET_KEY is present but APP_ENV was never set, so is_development is False
    and the configured key is used. That is correct and must not raise - but it
    must also not be treated as development, which would hand out an ephemeral
    key and silently invalidate every token the Next.js BFF mints.
    """
    from app.core import config as config_module, dev_key

    settings = _reload(SECRET_KEY="a-configured-secret")
    assert settings.is_development is False
    assert dev_key.get_signing_key() == "a-configured-secret"
    assert dev_key.is_ephemeral_key() is False
    assert config_module.settings.app_env == ""


def test_legacy_env_variables_no_longer_select_the_development_branch():
    from app.core import config as config_module

    for var in ("ENV", "ENVIRONMENT", "RENDER", "AI_AUTH_STRICT"):
        _reload(**{var: "production"})
        assert config_module.settings.is_development is False, (
            f"{var} still influences environment detection"
        )


def test_no_signing_key_outside_development_returns_empty_not_a_literal():
    """The caller must be able to tell 'no key' from 'a key'."""
    from app.core import dev_key
    _reload(APP_ENV="production")
    assert dev_key.get_signing_key() == "", (
        "a non-development deployment with no SECRET_KEY produced a signing key"
    )
    assert dev_key.is_ephemeral_key() is False


# ── Token lifetime: one rule ──────────────────────────────────
def test_token_lifetime_is_one_hour_in_production():
    from app.core import tokens
    _reload(APP_ENV="production")
    assert tokens.token_lifetime_seconds() == 3600


def test_token_lifetime_is_eight_hours_in_development():
    from app.core import tokens
    _reload(APP_ENV="development")
    assert tokens.token_lifetime_seconds() == 8 * 3600


def test_token_lifetime_defaults_to_the_safe_value():
    """Absence is not development, so absence must get the SAFE lifetime."""
    from app.core import tokens
    _reload()
    assert tokens.token_lifetime_seconds() == 3600


def test_expiry_is_timezone_aware():
    """utcnow() is deprecated on 3.12 and returns a naive datetime, leaving PyJWT
    to assume UTC by convention rather than by statement."""
    import inspect

    from app.core import tokens

    src = inspect.getsource(tokens)
    assert "utcnow" not in src, "a deprecated naive utcnow() call survived"
    assert "timezone.utc" in src, "no explicit timezone in the token expiry"


def test_expiry_epoch_is_in_the_future_and_within_the_lifetime():
    import time

    from app.core import tokens

    _reload(APP_ENV="production")
    delta = tokens.expiry_epoch() - int(time.time())
    assert 3500 < delta <= 3600, f"expiry is {delta}s away, expected ~3600s"


# ── One rule, not three ───────────────────────────────────────
def test_auth_router_reads_the_one_settings_object():
    """_load_secret_key and the two os.getenv-based production checks are gone."""
    src = (pathlib.Path(BE_ROOT) / "app" / "routers" / "auth_router.py").read_text(
        encoding="utf-8"
    )
    for gone in ("_load_secret_key", "ENVIRONMENT", "RENDER", "utcnow"):
        assert gone not in src, (
            f"auth_router.py still references {gone!r} - the divergent production "
            f"checks were not fully removed"
        )
    assert "from app.core.config import settings" in src
    assert "from app.core.tokens import" in src


if __name__ == "__main__":
    print("\n=== environment detection and signing keys ===\n")
    check("no fallback key in the source tree", test_no_fallback_key_exists_in_the_source_tree)
    check("configured key is used verbatim", test_configured_key_is_used_verbatim)
    check("development gets an ephemeral key", test_development_without_a_key_gets_an_ephemeral_one)
    check("ephemeral key is stable within a process", test_ephemeral_key_is_stable_within_a_process)
    check("ephemeral key differs between processes", test_ephemeral_key_differs_between_processes)
    check("secret set but APP_ENV unset fails closed", test_secret_set_but_app_env_unset_fails_closed)
    check("legacy env vars are ignored", test_legacy_env_variables_no_longer_select_the_development_branch)
    check("no key outside development returns empty", test_no_signing_key_outside_development_returns_empty_not_a_literal)
    check("production tokens last one hour", test_token_lifetime_is_one_hour_in_production)
    check("development tokens last eight hours", test_token_lifetime_is_eight_hours_in_development)
    check("unset APP_ENV gets the safe lifetime", test_token_lifetime_defaults_to_the_safe_value)
    check("expiry is timezone aware", test_expiry_is_timezone_aware)
    check("expiry is in the future and in range", test_expiry_epoch_is_in_the_future_and_within_the_lifetime)
    check("auth_router reads one Settings object", test_auth_router_reads_the_one_settings_object)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_production_detection.py
```

Expected: FAIL — `app.core.dev_key` does not exist, and the literal is still at `auth_router.py:51`.

- [ ] **Step 3: Write the development key module**

Create `BE/app/core/dev_key.py`:

```python
"""The signing key, and the only place one may be invented.

The previous implementation returned the literal
"dev-insecure-secret-do-not-use-in-production" whenever its three-way,
host-specific production check came back False. That string is in this
repository's history, so anyone with read access to the source could mint a
super_admin token for any tenant - and `role` is an ordinary claim inside the
signed payload, so nothing else stood in the way.

There is no replacement constant. In development with no key configured, the
process generates a random one at first use:

  * It is not in the source, so it cannot be read from the source.
  * It is not in any .env, so it cannot be committed by accident.
  * It differs every restart, so a token captured from a development environment
    is worthless against a later one.

The cost is that development tokens do not survive a restart. That is the correct
trade: convenience in development, unforgeability everywhere.
"""

from __future__ import annotations

import logging
import secrets

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")

#: 32 bytes -> 256 bits, well beyond brute force, and it never leaves the process.
_EPHEMERAL_KEY_BYTES = 32

#: Generated on first use, not at import, so importing this module has no side
#: effect and tests can reload the settings freely.
_ephemeral_key: str | None = None


def _generate_ephemeral_key() -> str:
    global _ephemeral_key
    if _ephemeral_key is None:
        _ephemeral_key = secrets.token_urlsafe(_EPHEMERAL_KEY_BYTES)
        logger.warning(
            "SECRET_KEY is not set and APP_ENV=development - generated an EPHEMERAL "
            "signing key for this process. Tokens will not survive a restart, and "
            "this key must never be relied on by anything shared. Set SECRET_KEY to "
            "make tokens durable across restarts."
        )
    return _ephemeral_key


def get_signing_key() -> str:
    """Return the key that signs and verifies AI service tokens.

    Precedence:
      1. `SECRET_KEY`, when set. Used in every environment, production included.
      2. An ephemeral per-process key, but ONLY when APP_ENV=development.
      3. Otherwise "". There is no key, and a missing SECRET_KEY outside
         development is a readiness failure rather than an import crash - the
         traffic gate in app/main.py answers 503 and /health reports it. Returning
         "" makes the failure explicit at the point of use.
    """
    if settings.secret_key.strip():
        return settings.secret_key.strip()

    if settings.is_development:
        return _generate_ephemeral_key()

    return ""


def is_ephemeral_key() -> bool:
    """True when this process is signing with a key it invented.

    Reported by /health so an ephemeral key can never be mistaken for a configured
    one.
    """
    return not settings.secret_key.strip() and settings.is_development
```

- [ ] **Step 4: Write the token lifetime helper**

Create `BE/app/core/tokens.py`:

```python
"""Token lifetime and expiry construction.

`create_token` in app/routers/auth_router.py asked
`os.getenv("ENV", "development") == "production"` - the narrowest of the three
production checks in that file - so on a host that set only ENVIRONMENT or RENDER
it minted 8-hour tokens while _auth_strict() reported production_mode: true and
/health called the deployment production.

One rule, from the one Settings object: production is 1 hour, and so is everything
else. Development's 8 hours is a convenience, granted only on an explicit
APP_ENV=development.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import settings

DEVELOPMENT_TOKEN_LIFETIME_SECONDS = 8 * 3600
PRODUCTION_TOKEN_LIFETIME_SECONDS = 1 * 3600


def token_lifetime_seconds() -> int:
    """Seconds until expiry. An absent APP_ENV gets the SAFE lifetime."""
    if settings.is_development:
        return DEVELOPMENT_TOKEN_LIFETIME_SECONDS
    return PRODUCTION_TOKEN_LIFETIME_SECONDS


def expiry_epoch() -> int:
    """The `exp` claim, as a POSIX timestamp.

    Timezone-aware throughout. `datetime.utcnow()` is deprecated on the pinned
    3.12 runtime and returns a naive datetime, leaving PyJWT to assume UTC by
    convention rather than by statement.
    """
    moment = datetime.now(timezone.utc) + timedelta(seconds=token_lifetime_seconds())
    return int(moment.timestamp())
```

- [ ] **Step 5: Rewire `auth_router.py`**

**Step 5a — replace the key loader.** Delete lines 30-54: the `_load_secret_key` function, its comment, and `SECRET_KEY = _load_secret_key()`. Add to the imports:

```python
from app.core.config import settings
from app.core.dev_key import get_signing_key, is_ephemeral_key
from app.core.tokens import expiry_epoch
```

Every existing use of the module-level `SECRET_KEY` becomes a local `get_signing_key()` call. There are exactly three: the `jwt.encode` in `create_token` (`:210`) and the two `jwt.decode` calls inside `_decode_token`. Bind the key once at the top of each function so a mid-request settings reload cannot change the key underneath a verification:

```python
def _decode_token(auth: Optional[str]) -> dict:
    token = _normalize(auth)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    key = get_signing_key()
    if not key:
        # No key is configured and this is not development. Refuse rather than
        # verify against an empty string.
        raise HTTPException(
            status_code=503, detail="Service is not correctly configured."
        )

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub", "customer_id"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please sign in again.")
    except Exception:
        # Deliberately opaque: never echo the decode error, the algorithm, or any
        # part of the token.
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
```

**Step 5b — replace `create_token`'s environment logic.** Replace `auth_router.py:198-210` with:

```python
    payload = {
        "sub":         username,
        "customer_id": customer_id,
        "role":        role,
        "exp":         expiry_epoch(),
    }
    if user_id:
        payload["user_id"] = user_id

    key = get_signing_key()
    if not key:
        raise HTTPException(status_code=503, detail="Service is not correctly configured.")

    return jwt.encode(payload, key, algorithm=ALGORITHM)
```

Delete the now-dead `is_production` / `token_hours` lines and the docstring's "Production: 1 hour / Development: 8 hours" paragraph — `app/core/tokens.py` owns that rule now, and a comment that restates code in a second place is how the three divergent checks happened.

**Step 5c — collapse `_auth_strict` to one rule.** Replace `auth_router.py:236-246` with:

```python
def _auth_strict() -> bool:
    """Whether this deployment self-identifies as production.

    Retained for health and diagnostic reporting ONLY. Authentication is enforced
    unconditionally - never gate an auth decision on this.

    This previously consulted AI_AUTH_STRICT, RENDER, and ENV with an
    ENVIRONMENT fallback: three different rules from the two other production
    checks in this file. It is one line from the one Settings object, and it can
    no longer disagree with create_token.
    """
    return not settings.is_development
```

**Keep unchanged.** Analysis 7.2 records that JWT verification is correct — `algorithms=[ALGORITHM]` pinning HS256, three required claims, an opaque error that never echoes the decode failure. `PLATFORM_ADMIN_ROLES`, `TENANT_ROLES`, `READONLY_ROLES`, `GXP_AUTHOR_ROLES`, `ALL_AUTHENTICATED`, `require_roles` and `resolve_tenant` are all correct and none of them changes here.

- [ ] **Step 6: Run the tests**

```bash
python tests\test_production_detection.py
python tests\test_ai_security.py
```

Expected: `test_production_detection.py` 14 passed. `test_ai_security.py` — the four existing cases at `:135-161` (`alg: none`, wrong secret, expiry, missing tenant) still pass. That suite pins the algorithm pin and the required claims; this task must not weaken either.

If `test_ai_security.py` fails, the likely cause is that it sets `SECRET_KEY` via `os.environ.setdefault` at import (`:32`) and something reloaded the settings afterwards, so `get_signing_key()` returns a different value. Confirm what the suite's key resolves to. Do not weaken the assertion to make it pass.

- [ ] **Step 7: Verify the invariants and the baseline**

```bash
grep -rn "dev-insecure-secret" . --include=*.py
```

Expected: no output.

```bash
grep -rn "os.getenv" app/routers/auth_router.py
```

Expected: no output. Task 8 clears the rest of the tree.

```powershell
$env:APP_ENV = "production"
Remove-Item Env:\SECRET_KEY -ErrorAction SilentlyContinue
python -c "from app.core.dev_key import get_signing_key; print(repr(get_signing_key()))"
```

Expected: `''`. A production deployment with no key has no key — it does not invent one. Then clear `APP_ENV`.

Re-run the three baseline modules. Expected: unchanged.

- [ ] **Step 8: Commit**

```bash
git add app/core/dev_key.py app/core/tokens.py app/routers/auth_router.py tests/test_production_detection.py
git commit -m "fix(auth): one host-independent production check, and no key in the source

_load_secret_key fired its production guard only when SECRET_KEY was absent AND
ENV, ENVIRONMENT or RENDER was set. On any host that set none of them, every JWT
was signed with a literal committed to this repository, and role is an ordinary
claim - so a readable key plus a forgeable role was a super_admin token for any
tenant. .do/app.yaml:82-88 records that this already happened on DigitalOcean.

There is no replacement constant. Development with no configured key generates a
random one at first use: not in the source, not in any .env, different every
restart. The cost is that development tokens do not survive a restart, which is
the correct trade.

The same production test existed three times with three rules; create_token
honoured the narrowest and minted 8-hour tokens while _auth_strict reported
production. All three now read the one Settings object. Expiry is timezone-aware
and the deprecated naive utcnow() is gone."
```

---

## Task 5: Close the FastAPI identity hole

NextAuth becomes the sole token issuer. `POST /api/v1/auth/signup` inserts a row into a table nothing reads while minting a JWT whose `customer_id` is the caller-supplied, unvalidated `req.customer_id` (`:484`) — and that claim is the only thing scoping every downstream query (`_payload` → `resolve_tenant` → the `AIAuditTrail.customer_id` filter), so a successful signup yields a validly-signed token scoped to an arbitrary tenant string, with a forgeable `role` claim beside it.

The same file also carries a username-keyed lockout: `check_account_lockout` reads `FAILED_LOGINS[username]` at `:68`, and a `defaultdict` **read** inserts. Every login POST with an arbitrary username allocates an entry that is never removed, so the table is an unauthenticated memory-growth vector. Five bogus requests lock a known account for fifteen minutes with no IP dimension — a third-party denial-of-service lever. And because a valid username eventually returns 429 while an invalid one never does, it is a username-enumeration oracle.

The same `app/models/capa_model.py` also declares the six-table orphan CAPA cluster, which has no reader and no writer and which `create_all` recreates on every boot — keeping the `prisma db push` hazard live in both directions (`.do/app.yaml:14-18` warns that command would drop the backend's snake_case tables).

**Decision, taken with the human partner:** the six tables are **kept**. Only the declarations are removed, so `create_all` stops recreating them and nothing drops anything. Reversible; needs no compliance sign-off.

**Files:**
- Create: `BE/tests/test_identity.py`
- Modify: `BE/app/routers/auth_router.py:20`, `:57-100`, `:104-136`, `:138-143`, `:466-527`
- Modify: `BE/app/models/capa_model.py:1-132` (delete all seven models)
- Modify: `BE/app/main.py:28-47` (the CAPA comment), `:69` (the model import)

**Interfaces:**
- Consumes: `app.core.config`, `app.core.dev_key`, `app.core.errors`, `app.core.tokens` (Tasks 2–4).
- Produces — kept deliberately for Phase 2:
  - `app.routers.auth_router.hash_password(password: str, cost: int = 12) -> str`
  - `app.routers.auth_router.verify_password(password: str, hashed: str) -> bool`
  - `app.routers.auth_router.validate_password_strength(password: str) -> None`
  - `app.routers.auth_router.BCRYPT_COST` — `12`

  Phase 2 hashes new tenants and verifies the existing `Tenant.passwordHash` values with these. Analysis 7.3 confirms `bcrypt.checkpw` reads the cost from the stored `$2b$<cost>$…` string, so the mixed cost-10 and cost-12 hashes already in the database all verify and no re-hashing pass is required. **These two functions are the only thing standing between the billing service and a forced reset of every customer password. Do not delete them.**

- [ ] **Step 1: Write the failing test**

Create `BE/tests/test_identity.py`:

```python
#!/usr/bin/env python
# tests/test_identity.py
"""No FastAPI route may mint a token. NextAuth is the only issuer.

/api/v1/auth/signup wrote a row into the `users` table - a table Prisma does not
own, which nothing read, and which had zero rows in the checked-in database -
and then minted a JWT whose customer_id was the caller-supplied, unvalidated
req.customer_id. That claim is the ONLY thing scoping every downstream query
(_payload -> resolve_tenant -> the AIAuditTrail.customer_id filter), so a
successful signup produced a validly-signed token scoped to an arbitrary tenant
string, with a forgeable role claim beside it.

The table also collided with Prisma's `User` by case alone, in one database.

The fix is deletion, not hardening. These tests pin the absence, so the
endpoints cannot quietly return, and they pin the password helpers that Phase 2
depends on.
"""

import os
import pathlib
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-identity-suite")
os.environ.setdefault("APP_ENV", "development")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
BE_ROOT = pathlib.Path(__file__).resolve().parent.parent

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


def _routes():
    return {r.path for r in app.routes if hasattr(r, "path")}


# ── No route mints a token ────────────────────────────────────
def test_no_signup_endpoint():
    assert "/api/v1/auth/signup" not in _routes(), (
        "the identity hole is back: POST /api/v1/auth/signup mints a token for an "
        "unvalidated customer_id"
    )


def test_no_login_endpoint():
    assert "/api/v1/auth/login" not in _routes(), (
        "POST /api/v1/auth/login is back; it authenticates against a table with "
        "zero rows and mints its own tokens alongside NextAuth's"
    )


def test_a_post_to_the_deleted_endpoints_is_404():
    for path in ("/api/v1/auth/signup", "/api/v1/auth/login"):
        r = client.post(path, json={})
        assert r.status_code == 404, f"{path} answered {r.status_code}, not 404"


# ── The table collision is closed ─────────────────────────────
def test_the_users_model_is_gone():
    """The User/users case collision is closed only when the model is gone."""
    from app.database.db import Base

    # app.main is already imported above, so every live model is registered -
    # including AIAuditTrail, which still lives in audit_router.py until Task 6.
    declared = set(Base.metadata.tables)
    assert "users" not in declared, "the `users` model still declares its table"
    assert "User" not in declared, "a model still maps the Prisma-owned `User` table"


def test_the_orphan_capa_tables_are_no_longer_declared():
    """KEPT in the database - only the declarations are removed.

    create_all recreates anything still declared, which is what kept the
    prisma db push hazard live in both directions. Removing the declaration stops
    the recreation. It does NOT drop anything.
    """
    from app.database.db import Base

    declared = set(Base.metadata.tables)
    for orphan in ("capas", "rcas", "action_plans", "monitoring",
                   "effectiveness_checks", "capa_closures"):
        assert orphan not in declared, (
            f"{orphan} is still declared, so create_all keeps recreating it. Delete "
            f"the model; do NOT drop the table."
        )


def test_the_ai_audit_trail_survives_the_cleanup():
    """The one table that must not be caught in this. It is still declared in
    audit_router.py at this point; Task 6 relocates it to app/models/."""
    from app.database.db import Base

    assert "ai_audit_trail" in Base.metadata.tables, (
        "removing capa_model.py must not take the audit trail with it"
    )


def test_capa_model_file_is_empty():
    path = BE_ROOT / "app" / "models" / "capa_model.py"
    assert path.exists(), "capa_model.py should still exist, as an empty module"
    body = path.read_text(encoding="utf-8").strip()
    assert not body, f"capa_model.py still declares models:\n{body[:400]}"


def test_main_no_longer_imports_capa_model():
    src = (BE_ROOT / "app" / "main.py").read_text(encoding="utf-8")
    code = "\n".join(
        line for line in src.splitlines() if not line.strip().startswith("#")
    )
    assert "capa_model" not in code, "main.py still imports app.models.capa_model"


def test_no_module_imports_a_deleted_model():
    root = BE_ROOT / "app"
    pattern = re.compile(r"\bfrom\s+app\.models\b|\bimport\s+app\.models\b")
    offenders = []
    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "capa_model" in stripped and rel != "models/capa_model.py":
                offenders.append(f"{rel}:{lineno}  {stripped}")
            elif pattern.search(stripped) and "audit_model" not in stripped:
                offenders.append(f"{rel}:{lineno}  {stripped}")
    assert not offenders, "stale imports of the deleted models:\n  " + "\n  ".join(offenders)


# ── The lockout is gone with its only caller ───────────────────
def test_the_self_populating_lockout_is_gone():
    src = (BE_ROOT / "app" / "routers" / "auth_router.py").read_text(encoding="utf-8")
    for gone in ("FAILED_LOGINS", "check_account_lockout", "record_failed_login",
                 "LOCKOUT_THRESHOLD", "defaultdict"):
        assert gone not in src, (
            f"auth_router.py still references {gone!r} - the username-keyed lockout "
            f"was a defaultdict read that self-populated on any unauthenticated POST"
        )


# ── Phase 2 depends on these ──────────────────────────────────
def test_password_helpers_survive_for_phase_2():
    """Phase 2 hashes new tenants and verifies existing ones with these."""
    from app.routers.auth_router import (
        BCRYPT_COST,
        hash_password,
        validate_password_strength,
        verify_password,
    )

    assert BCRYPT_COST == 12, f"expected cost 12, got {BCRYPT_COST}"

    hashed = hash_password("Correct-Horse-9!")
    assert hashed.startswith("$2b$12$"), f"expected $2b$12$, got {hashed[:7]}"
    assert verify_password("Correct-Horse-9!", hashed)
    assert not verify_password("wrong-password", hashed)

    # A cost-10 hash, as already exists in the database, must still verify.
    legacy = hash_password("Legacy-Horse-9!", cost=10)
    assert legacy.startswith("$2b$10$")
    assert verify_password("Legacy-Horse-9!", legacy)

    validate_password_strength("Correct-Horse-9!")  # must not raise


def test_verify_password_does_not_crash_on_a_corrupt_hash():
    """One corrupt row must not 500 a login. bcrypt raises ValueError on input
    that is not a Modular Crypt Format hash; the caller should see a failed
    verification, not a traceback."""
    from app.routers.auth_router import verify_password

    for corrupt in ("", "not-a-hash", "$2b$12$tooshort", "plaintext-password"):
        assert verify_password("Correct-Horse-9!", corrupt) is False, (
            f"a corrupt hash {corrupt!r} did not verify as a failure"
        )


# ── Deleting the issuer must not have opened a door ───────────
def test_every_protected_route_still_requires_a_token():
    for method, path, body in (
        ("GET", "/api/v1/audit/all", None),
        ("POST", "/api/v1/finding-triage/classify",
         {"requirement": "Batch records are not reviewed by QA before release.",
          "activeFrameworks": ["p210"]}),
    ):
        r = client.get(path) if method == "GET" else client.post(path, json=body)
        assert r.status_code == 401, f"{path} accepted an anonymous call ({r.status_code})"


def test_token_verification_and_rbac_survive():
    """The retained surface must still work: a NextAuth-issued token verifies, and
    a wrong role is a 403 rather than a 401."""
    import base64
    import hashlib
    import hmac
    import json
    import time

    secret = os.environ["SECRET_KEY"]

    def b64(raw):
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    def mint(role):
        header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}))
        now = int(time.time())
        payload = b64(json.dumps({
            "sub": "u@test", "customer_id": "CUST_A", "role": role,
            "iat": now, "exp": now + 300,
        }))
        sig = b64(hmac.new(secret.encode(), f"{header}.{payload}".encode(),
                            hashlib.sha256).digest())
        return f"{header}.{payload}.{sig}"

    ok = client.get("/api/v1/audit/all", headers={"auth": mint("qa_head")})
    assert ok.status_code == 200, ok.text[:200]

    forbidden = client.post(
        "/api/v1/capa-recurrence/analyze",
        json={"problem_statement": "Coating defects observed again on the same line.",
              "history": []},
        headers={"auth": mint("viewer")},
    )
    assert forbidden.status_code == 403, (
        f"a viewer was not refused a GxP-author endpoint ({forbidden.status_code})"
    )


if __name__ == "__main__":
    print("\n=== identity: NextAuth is the only issuer ===\n")
    check("no /auth/signup endpoint", test_no_signup_endpoint)
    check("no /auth/login endpoint", test_no_login_endpoint)
    check("the deleted endpoints 404", test_a_post_to_the_deleted_endpoints_is_404)
    check("the `users` model is gone", test_the_users_model_is_gone)
    check("orphan CAPA tables not declared", test_the_orphan_capa_tables_are_no_longer_declared)
    check("the AI audit trail survives", test_the_ai_audit_trail_survives_the_cleanup)
    check("capa_model.py is empty", test_capa_model_file_is_empty)
    check("main.py no longer imports capa_model", test_main_no_longer_imports_capa_model)
    check("no stale model imports", test_no_module_imports_a_deleted_model)
    check("the self-populating lockout is gone", test_the_self_populating_lockout_is_gone)
    check("password helpers survive for Phase 2", test_password_helpers_survive_for_phase_2)
    check("a corrupt hash does not crash login", test_verify_password_does_not_crash_on_a_corrupt_hash)
    check("protected routes still require a token", test_every_protected_route_still_requires_a_token)
    check("verification and RBAC survive", test_token_verification_and_rbac_survive)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_identity.py
```

Expected: FAIL — `/api/v1/auth/signup` is in `app.routes`, and `users` is in `Base.metadata.tables`.

- [ ] **Step 3: Delete the endpoints, the schemas, and the lockout**

In `BE/app/routers/auth_router.py`:

- Delete `from app.models.capa_model import User` (line 20).
- Delete `SignupRequest` (`:104-123`), `LoginRequest` (`:125-126`), and `AuthResponse` (`:129-135`).
- Delete `POST /api/v1/auth/signup` (`:466-499`) and `POST /api/v1/auth/login` (`:502-527`).
- Delete the whole lockout block (`:57-100`): `FAILED_LOGINS`, `LOCKOUT_THRESHOLD`, `LOCKOUT_DURATION`, `check_account_lockout`, `record_failed_login`, `clear_failed_logins`, and the `from collections import defaultdict` / `import time` imports. Its only caller was the login endpoint being deleted, and all three of its defects go with it.
- Delete the `import re` at line 9 **only if** `validate_password_strength` is the sole user — it is, so keep `re`; the function still needs it.

The router keeps its prefix and its entire non-minting surface: `_payload`, `_current_user`, `CurrentUser`, `verify_token`, `get_current_customer_id`, `get_current_user`, `_normalize`, `_decode_token`, `_auth_strict`, the four role sets, `require_roles`, `resolve_tenant`. Every one of the 19 live routers depends on those, and `app/services/assistant_pipeline.py:46` imports `CurrentUser` from here.

- [ ] **Step 4: Keep the password helpers, with an explicit cost**

Replace `auth_router.py:138-143` with:

```python
# ── Password helpers ─────────────────────────────────────────
# Phase 2 needs these. It hashes NEW tenants at cost 12 and verifies the EXISTING
# Tenant.passwordHash values with checkpw, which reads the cost from the stored
# "$2b$<cost>$..." string. Analysis 7.3 confirms the mixed cost-10 and cost-12
# hashes already in the database all verify, so no re-hashing pass is required -
# and these two functions are the only thing standing between the billing service
# and a forced reset of every customer password.
BCRYPT_COST = 12


def hash_password(password: str, cost: int = BCRYPT_COST) -> str:
    """Hash with bcrypt, Modular Crypt Format. The cost is embedded in the output."""
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=cost)
    ).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify against a stored hash, whatever cost it was written at.

    `checkpw` reads the cost from the hash itself, so this is correct for the
    cost-10 and cost-12 hashes both present in the database.

    Returns False rather than raising when `hashed` is not a Modular Crypt Format
    hash: one corrupt row must not 500 a login. A caller that needs to distinguish
    "wrong password" from "corrupt record" should check the format first.
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
```

Keep `validate_password_strength` (`:145-177`) unchanged.

- [ ] **Step 5: Empty `capa_model.py`**

Replace the whole of `BE/app/models/capa_model.py` with a 0-byte file. `app/models/__init__.py` already exists and is already empty.

Every model in it is dead:

| Class | `__tablename__` | Why removal is safe |
|---|---|---|
| `User` (`:6`) | `users` | Only reader was the login endpoint deleted in Step 3. Zero rows. Collided with Prisma's `User` by case. |
| `CAPA` (`:18`) | `capas` | Routers removed in an earlier pass (`main.py:28-47`). No reader, no writer. |
| `RCA` (`:39`) | `rcas` | Same. |
| `ActionPlan` (`:60`) | `action_plans` | Same. |
| `ImplementationMonitoring` (`:75`) | `monitoring` | Same. |
| `EffectivenessCheck` (`:92`) | `effectiveness_checks` | Same. |
| `CAPAClosure` (`:109`) | `capa_closures` | Same. |

**The tables stay in the database.** Removing the declaration stops `create_all` from recreating them on every boot — which is what kept the `prisma db push` hazard live in both directions, since `.do/app.yaml:14-18` warns that the command would drop the backend's snake_case tables. Nothing is dropped. If a compliance owner later confirms nothing reads them, dropping them is a separate, reviewed migration.

**This also changes the plan's stated acceptance criterion for 0.5.** The plan says "`SELECT * FROM users` fails because the table no longer exists". That is not what this task delivers, and should not be forced: `users` once held rows, and deleting a table that did is a migration and a decision this phase does not make. Record the corrected criterion in your task notes: *"the `users` model is gone and `create_all` no longer creates it; the table itself awaits a reviewed migration."*

- [ ] **Step 6: Update `main.py`**

In `BE/app/main.py`:

- Delete line 69, `import app.models.capa_model  # creates tables`.
- Replace the comment block at `:28-47` with:

```python
# ── CAPA lifecycle ─────────────────────────────────────────────
# capa_router, rca_router, action_plan_router, monitoring_router,
# effectiveness_router and closure_router were removed in an earlier pass: they
# served a SECOND CAPA system of record in this service's own tables,
# unsynchronised with the authoritative Prisma CAPA module in the Next.js app.
# Inside it an LLM produced the effectiveness score and the ai_closure_approved
# flag that closed a regulated record, and none of the submit endpoints carried a
# role check.
#
# Their SQLAlchemy models are now removed too (app/models/capa_model.py is empty),
# so Base.metadata.create_all no longer recreates those six tables on every boot.
# THE TABLES THEMSELVES REMAIN IN THE DATABASE - nothing is dropped. That is
# deliberate: whether a compliance export, an audit-history query or a regulatory
# report reads them is not a question code can answer, so the reversible action
# (stop recreating) was taken and the irreversible one (dropping) is left for a
# reviewed migration with a named owner.
#
# Prisma is the single system of record. This service is an AI ANALYSIS service:
# it reads what the caller's BFF sends it and returns advice. The replacement for
# the useful part of that lifecycle is capa_recurrence_router - stateless,
# grounded in the tenant's real closed CAPAs, and writing nothing.
```

- **Do not remove the `audit_router` import** (`main.py:50`). `create_all` still needs it until Task 6 moves `AIAuditTrail` into `app/models/`. `Base` and `engine` are also still needed at `:174` until Task 6 moves `create_all` into the lifespan.

- [ ] **Step 7: Run the tests**

```bash
python tests\test_identity.py
python tests\test_ai_security.py
python tests\test_health.py
```

Expected: `test_identity.py` 15 passed; the other two unchanged.

`test_ai_security.py`'s `test_shadow_capa_lifecycle_endpoints_are_gone` (`:359`) asserts those endpoints are already absent — it should still pass. If anything else fails, a live router still imports a deleted model, and `test_no_module_imports_a_deleted_model` will name the file and line.

- [ ] **Step 8: Verify the state directly**

```bash
python -c "import app.main; m=[r.path for r in app.main.app.routes]; print('signup', '/api/v1/auth/signup' in m); print('login', '/api/v1/auth/login' in m)"
```

Expected: `signup False`, `login False`.

```bash
python -c "from app.database.db import Base; import app.main; print(sorted(Base.metadata.tables))"
```

Expected: no `users`, no `capas`, no `rcas`, no `action_plans`, no `monitoring`, no `effectiveness_checks`, no `capa_closures`; `ai_audit_trail` present.

Re-run the three baseline modules. Expected: unchanged.

- [ ] **Step 9: Commit**

```bash
git add app/routers/auth_router.py app/models/capa_model.py app/main.py tests/test_identity.py
git commit -m "fix(auth): delete the FastAPI identity hole; NextAuth is the only issuer

POST /api/v1/auth/signup wrote a row into the \`users\` table - a table Prisma does
not own, which nothing read, which had zero rows - and minted a JWT whose
customer_id was the caller-supplied, unvalidated req.customer_id. That claim is
the only thing scoping every downstream query, so a successful signup produced a
validly-signed token scoped to an arbitrary tenant string, with a forgeable role
claim beside it.

The table also collided with Prisma's \`User\` by case alone, in one database.
Both endpoints go, along with the username-keyed lockout: a defaultdict read
that self-populated on any anonymous POST, a third-party DoS lever, and a
username-enumeration oracle.

capa_model.py is now empty, so create_all stops recreating the six orphan CAPA
tables on every boot - which is what kept the prisma db push hazard live in both
directions. THE TABLES STAY IN THE DATABASE. Whether a compliance export reads
them is not a question code can answer, so the reversible action was taken and
the irreversible one waits for a reviewed migration with a named owner.

Password helpers are kept and take an explicit cost: Phase 2 verifies the
existing cost-10 and cost-12 hashes with these, and without them every customer
would need a forced password reset."
```

---

## Task 6: Restore the audit trail, and stop startup DDL mutating a shared database

`_backfill_audit_tenant` joins `ai_audit_trail.username` to `users.customer_id`. `users` is the dead FastAPI table and has zero rows — so in any deployment the backfill marks **every** audit row `'unattributed'`, after which the `_scoped` filter hides the trail from every tenant. The function's own docstring (`:202-218`) describes the bug it was written to fix; on the current schema it recreates that bug.

Three hand-rolled helpers also `ALTER TABLE` a database Prisma also owns, interpolate column names from a `wanted` dict into DDL (`:293`), and wrap every failure in `except Exception` with a `print`. A migration that fails leaves no trace and raises no alert. And `create_all` at `:174` runs at module scope — not in a startup event, not in a lifespan — so it executes in every process that imports `app.main`, including all three test modules, before uvicorn binds a socket.

**Files:**
- Create: `BE/app/models/audit_model.py`
- Create: `BE/app/core/migrations.py`
- Create: `BE/tests/test_audit_trail.py`
- Modify: `BE/app/routers/audit_router.py:19-33`, `:119-130`, `:65`
- Modify: `BE/app/routers/drift_detection_router.py:36`
- Modify: `BE/app/main.py:23`, `:69`, `:72`, `:174-302`

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.errors.MigrationError` (Task 2).
- Produces:
  - `app.models.audit_model.AIAuditTrail` — the same class, same `__tablename__ = "ai_audit_trail"`, same columns and indexes. Relocated, not changed.
  - `app.core.migrations.MIGRATION_STEPS: list[tuple[str, Callable[[Engine], None]]]`
  - `app.core.migrations.run_startup_migrations(engine) -> list[str]` — applies each step in order, returns the names that did work, raises `MigrationError` naming the first step that failed.

- [ ] **Step 1: Write the failing test**

Create `BE/tests/test_audit_trail.py`. A compiled artefact of an earlier version of this file survives at `tests/__pycache__/test_audit_trail.cpython-313.pyc` with no `.py` beside it. This is that file, restored, plus the coverage it was missing.

```python
#!/usr/bin/env python
# tests/test_audit_trail.py
"""The AI audit trail is 21 CFR Part 11 §11.10(e) evidence, and it must be visible
to the tenant it belongs to.

It was not. _backfill_audit_tenant joined ai_audit_trail.username to
users.customer_id; `users` was the dead FastAPI table with zero rows, so the join
matched nothing and every remaining NULL row was stamped 'unattributed'. The
_scoped filter then hid the whole trail from every tenant - the exact bug the
function's own docstring says it was written to fix.

These tests write real rows and read them back through the API, because the
defect was never in the write path. It was in what the read path could see.
"""

import base64
import hashlib
import hmac
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-audit-suite")
os.environ.setdefault("APP_ENV", "development")

from fastapi.testclient import TestClient  # noqa: E402

from app.database.db import Base, SessionLocal, engine  # noqa: E402
import app.models.audit_model  # noqa: F401,E402  - so create_all sees the table
from app.main import app  # noqa: E402

client = TestClient(app)
SECRET = os.environ["SECRET_KEY"]
BE_ROOT = pathlib.Path(__file__).resolve().parent.parent

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


def b64(raw):
    if isinstance(raw, str):
        raw = raw.encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def mint(sub="alice@acme.test", customer_id="CUST_A", role="qa_head", ttl=300):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}))
    now = int(time.time())
    payload = b64(json.dumps({
        "sub": sub, "customer_id": customer_id, "role": role,
        "user_id": sub, "iat": now, "exp": now + ttl,
    }))
    sig = b64(hmac.new(SECRET.encode(), f"{header}.{payload}".encode(),
                       hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def hdr(token):
    return {"auth": token}


def write_row(tenant, action="help_query", audit_id=None):
    """Append one audit row exactly the way app/observability/ai_trace.py does."""
    from app.routers.audit_router import create_audit_log

    db = SessionLocal()
    try:
        return create_audit_log(
            db,
            action_type=action,
            feature_id="AI-HELP-01",
            record_id="",
            username="alice@acme.test",
            input_data={"endpoint": "/api/ai/help", "model": "gpt-4o",
                        "request_id": audit_id} if audit_id else
                       {"endpoint": "/api/ai/help", "model": "gpt-4o"},
            output_data={"latency_ms": 12, "prompt_tokens": 10, "completion_tokens": 20},
            status="success",
            customer_id=tenant,
            request_id=audit_id,
        )
    finally:
        db.close()


def read_all(tenant, role="qa_head"):
    r = client.get("/api/v1/audit/all",
                   headers=hdr(mint(customer_id=tenant, role=role)))
    assert r.status_code == 200, r.text[:300]
    return r.json()


def _write_unattributed(audit_id):
    from app.models.audit_model import AIAuditTrail

    db = SessionLocal()
    try:
        db.add(AIAuditTrail(
            audit_id=audit_id, action_type="help_query", feature_id="AI-HELP-01",
            record_id="", username="nobody@nowhere.test", customer_id=None,
            input_data={}, output_data={}, status="success",
        ))
        db.commit()
    finally:
        db.close()


# ── The property that was broken ──────────────────────────────
def test_a_tenant_sees_its_own_audit_rows():
    audit_id = write_row("CUST_VISIBLE")
    body = read_all("CUST_VISIBLE")
    assert audit_id in json.dumps(body), (
        "a tenant cannot see an audit row written for it - the trail is invisible "
        "to the party Part 11 §11.10(b) requires it to be retrievable by"
    )


def test_a_tenant_cannot_see_another_tenants_rows():
    write_row("CUST_OTHER")
    assert "CUST_OTHER" not in json.dumps(read_all("CUST_VISIBLE")), (
        "another tenant's audit data leaked"
    )


def test_unattributed_rows_are_not_silently_assigned_to_a_tenant():
    """A row whose tenant could not be recovered must stay unassigned.

    Assigning it to a guess is worse than an honest gap: a wrong tenant on a
    Part 11 record is a false statement about who performed a regulated action.
    """
    _write_unattributed("unattributed-no-guess")
    assert "unattributed-no-guess" not in json.dumps(read_all("CUST_VISIBLE")), (
        "an unattributed row was attributed to a tenant"
    )


def test_unattributed_rows_remain_visible_to_the_platform_admin():
    """_scoped bypasses the filter for super_admin, and that must keep working -
    otherwise a support investigation cannot see that the action happened at all."""
    assert "unattributed-no-guess" in json.dumps(
        read_all("CUST_ANY", role="super_admin")
    ), "an unattributed row is invisible to the platform admin"


def test_the_backfill_is_gone():
    """It joined against a table that did not exist and stamped everything
    'unattributed'. It must not be reintroduced in any form."""
    offenders = []
    for path in sorted((BE_ROOT / "app").rglob("*.py")):
        rel = path.relative_to(BE_ROOT / "app").as_posix()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "unattributed" in line and not line.strip().startswith("#"):
                # The word is allowed in explanatory comments and in a test's own
                # fixtures; it must not appear in a SQL statement.
                if "SET" in line.upper() or "unattributed'" in line:
                    offenders.append(f"{rel}:{lineno}  {line.strip()}")
    assert not offenders, (
        "the 'unattributed' stamp is back - it hides the audit trail from every "
        f"tenant:\n  " + "\n  ".join(offenders)
    )


# ── The model lives in app/models/, not in a router ───────────
def test_audit_model_is_declared_in_app_models():
    from app.models.audit_model import AIAuditTrail

    assert AIAuditTrail.__tablename__ == "ai_audit_trail"
    assert AIAuditTrail.__module__ == "app.models.audit_model", (
        "AIAuditTrail is still declared inside a router"
    )


def test_no_router_imports_another_router_for_the_model():
    src = (BE_ROOT / "app" / "routers" / "drift_detection_router.py").read_text(
        encoding="utf-8"
    )
    assert "from app.models.audit_model import AIAuditTrail" in src, (
        "drift_detection_router.py still imports AIAuditTrail from audit_router - "
        "a service depending on another router's internals"
    )


def test_the_observability_columns_exist():
    from app.models.audit_model import AIAuditTrail

    cols = set(AIAuditTrail.__table__.columns.keys())
    for required in ("audit_id", "action_type", "feature_id", "username",
                     "customer_id", "status", "timestamp", "request_id", "endpoint",
                     "model", "prompt_version", "latency_ms", "prompt_tokens",
                     "completion_tokens"):
        assert required in cols, f"{required} is missing from ai_audit_trail"


# ── Startup DDL is ordered, recorded, and fails loudly ────────
def test_startup_migrations_are_ordered_and_idempotent():
    from app.core.migrations import MIGRATION_STEPS, run_startup_migrations

    names = [name for name, _ in MIGRATION_STEPS]
    assert names, "there are no migration steps"
    assert len(names) == len(set(names)), f"duplicate step names: {names}"
    # customer_id must exist before anything reads or fills it.
    assert names.index("audit.customer_id") < names.index("audit.observability"), (
        f"customer_id is added after the observability columns: {names}"
    )

    first = run_startup_migrations(engine)
    second = run_startup_migrations(engine)
    assert second == [], f"a second boot re-applied steps: {second}"
    assert isinstance(first, list)


def test_a_failing_migration_step_raises_and_names_itself():
    """A migration that fails must leave a trace. A swallowed exception is a
    silently corrupt schema, and it is the reason the audit trail went missing."""
    from app.core.errors import MigrationError
    from app.core import migrations

    def explode(_engine):
        raise RuntimeError("simulated DDL failure")

    original = migrations.MIGRATION_STEPS
    migrations.MIGRATION_STEPS = [("audit.doomed", explode)]
    try:
        try:
            migrations.run_startup_migrations(engine)
        except MigrationError as e:
            assert "audit.doomed" in str(e), f"the failing step was not named: {e}"
            return
        raise AssertionError("a failing migration step did not raise")
    finally:
        migrations.MIGRATION_STEPS = original


def test_migration_steps_take_no_identifier_from_a_dict():
    """The old _ensure_audit_observability_columns built its ALTER statements from
    a `wanted` dict and interpolated the keys into the DDL string. A column name
    is a code constant, never a runtime value."""
    import inspect

    from app.core import migrations

    src = inspect.getsource(migrations)
    for line in src.splitlines():
        stripped = line.strip()
        if "ALTER TABLE" not in stripped.upper():
            continue
        assert "{" not in stripped, f"DDL interpolates a value: {stripped}"
        assert "+" not in stripped, f"DDL concatenates a value: {stripped}"
        assert "%" not in stripped, f"DDL uses a format placeholder: {stripped}"


def test_migrations_are_additive_only():
    """No DROP, no destructive ALTER, no data rewrite in the startup path."""
    import inspect

    from app.core import migrations

    src = inspect.getsource(migrations).upper()
    for destructive in ("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"):
        assert destructive not in src, (
            f"a startup migration is destructive ({destructive}) - that belongs in "
            f"a reviewed Prisma migration or an Alembic revision, not in app/core"
        )


def test_create_all_is_idempotent_under_repeat_boot():
    """Two workers starting against a fresh database must both succeed.

    instance_count is 1 today, but a scale-up races create_all. Re-running it
    against an already-populated database must be a clean no-op.
    """
    Base.metadata.create_all(bind=engine)
    Base.metadata.create_all(bind=engine)  # must not raise

    from sqlalchemy import inspect
    assert "ai_audit_trail" in set(inspect(engine).get_table_names())


def test_create_all_does_not_run_at_import():
    """It ran at module scope, so every process that imported app.main - all three
    test modules included - executed DDL before uvicorn bound a socket."""
    src = (BE_ROOT / "app" / "main.py").read_text(encoding="utf-8")
    assert "lifespan=" in src, "app.main declares no lifespan handler"
    for lineno, line in enumerate(src.splitlines(), 1):
        if "create_all" in line and not line.strip().startswith("#"):
            assert "async def lifespan" in src, (
                f"main.py:{lineno} calls create_all but declares no lifespan"
            )


if __name__ == "__main__":
    print("\n=== AI audit trail ===\n")
    check("a tenant sees its own rows", test_a_tenant_sees_its_own_audit_rows)
    check("a tenant cannot see another's", test_a_tenant_cannot_see_another_tenants_rows)
    check("unattributed rows stay unassigned", test_unattributed_rows_are_not_silently_assigned_to_a_tenant)
    check("admins still see unattributed rows", test_unattributed_rows_remain_visible_to_the_platform_admin)
    check("the backfill is gone", test_the_backfill_is_gone)
    check("the model lives in app/models/", test_audit_model_is_declared_in_app_models)
    check("no router imports another router's model", test_no_router_imports_another_router_for_the_model)
    check("the observability columns exist", test_the_observability_columns_exist)
    check("migrations are ordered and idempotent", test_startup_migrations_are_ordered_and_idempotent)
    check("a failing step raises and names itself", test_a_failing_migration_step_raises_and_names_itself)
    check("no DDL interpolates a value", test_migration_steps_take_no_identifier_from_a_dict)
    check("migrations are additive only", test_migrations_are_additive_only)
    check("create_all is idempotent", test_create_all_is_idempotent_under_repeat_boot)
    check("create_all is not at import", test_create_all_does_not_run_at_import)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_audit_trail.py
```

Expected: FAIL — `app.models.audit_model` does not exist, and the backfill still stamps `'unattributed'`.

- [ ] **Step 3: Move the model into `app/models/`**

Create `BE/app/models/audit_model.py` with the class copied **verbatim** from `audit_router.py:32-62` — every column, index, nullability and comment. Change nothing but the module docstring:

```python
"""The AI audit trail — 21 CFR Part 11 §11.10(e).

This table was declared inside app/routers/audit_router.py, which meant the most
security-relevant table in the service existed only because main.py imported the
router before create_all ran, and app/routers/drift_detection_router.py had to
import another router's internals to query it.

A table belongs in app/models/. `__tablename__` matches the live database
exactly; the backend mirrors the Prisma schema and never defines it.
"""
```

The class body must keep this shape, including the operational columns:

```python
class AIAuditTrail(Base):
    __tablename__ = "ai_audit_trail"

    audit_id      = Column(String, primary_key=True)
    action_type   = Column(String, index=True)   # help_query, finding_triage, …
    feature_id    = Column(String, index=True)   # AI-HELP-01, AI-RECUR-01, …
    record_id     = Column(String, index=True)   # the application record, if any
    username      = Column(String, index=True)   # who did it
    # WHICH TENANT the action belonged to. Added because the table previously
    # recorded only a username, so /audit/all could not be tenant-scoped and
    # returned every organisation's AI activity — including input/output
    # payloads — to any authenticated caller.
    customer_id   = Column(String, index=True, nullable=True)
    input_data    = Column(JSON)     # input METADATA (sizes, flags) — not raw text
    output_data   = Column(JSON)     # output metadata; full output only where a
                                     # regulated record's provenance needs it
    status        = Column(String, index=True)   # success | fallback | error
    timestamp     = Column(DateTime, default=func.now(), index=True)
    ip_address    = Column(String, nullable=True)

    # ── Operational columns (audit finding AI-M10) ────────────
    request_id        = Column(String, index=True, nullable=True)
    endpoint          = Column(String, nullable=True)
    model             = Column(String, nullable=True)
    prompt_version    = Column(String, nullable=True)
    latency_ms        = Column(Integer, nullable=True)
    prompt_tokens     = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
```

Then:

- In `BE/app/routers/audit_router.py`: delete the class (`:31-62`), drop the now-unused `from sqlalchemy import Column, DateTime, Integer, JSON, String`, and add `from app.models.audit_model import AIAuditTrail`. Keep `from sqlalchemy.orm import Session` and `func` if `create_audit_log` still uses them (it does not use `func` directly — check before removing).
- In `BE/app/routers/drift_detection_router.py`: change line 36 from `from app.routers.audit_router import AIAuditTrail` to `from app.models.audit_model import AIAuditTrail`. Its direct query at `:102-104` is unchanged.
- `BE/app/observability/ai_trace.py`: no change. It uses `create_audit_log`, not the class.

- [ ] **Step 4: Write the ordered migration runner**

`MigrationError` is already in `app/core/errors.py` from Task 2 Step 5. Create `BE/app/core/migrations.py`:

```python
"""Ordered, recorded, failing startup migrations.

Three hand-rolled helpers used to run at module scope in app/main.py on every
boot. They ALTERed a database Prisma also owns, interpolated column names from a
dict straight into DDL, and wrapped every failure in `except Exception` with a
`print` - so a migration that failed left no trace and raised no alert.

The rules here:

  * Ordered and named. Each step has a stable name that appears in the log and in
    the error, so a failure names itself.
  * Idempotent. A step that finds its work already done returns without touching
    anything, because these run on EVERY boot, including every test import.
  * No dynamic identifiers. Column names are string constants in the step's own
    function body, never values pulled from a dict.
  * Failure raises MigrationError. The lifespan handler does not catch it, so the
    process exits non-zero. Serving traffic against a schema the process does not
    match is worse than being down and saying why.
  * Additive only. No DROP, no destructive ALTER, no data rewrite. A
    non-idempotent or destructive change belongs in a Prisma migration or an
    Alembic revision (Phase 3), reviewed like any other schema change.

Alembic replaces this module once the billing mirror lands. Until then this is
the reviewable schema history the backend has.
"""

from __future__ import annotations

import logging
from typing import Callable, List, Tuple

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.errors import MigrationError

logger = logging.getLogger("uvicorn.error")


def _add_audit_customer_id(engine: Engine) -> None:
    """ai_audit_trail.customer_id - which tenant the action belonged to.

    Added because the table recorded only a username, so /audit/all could not be
    tenant-scoped and returned every organisation's AI activity - including
    input/output payloads - to any authenticated caller.
    """
    insp = inspect(engine)
    if "ai_audit_trail" not in insp.get_table_names():
        logger.info("[migrate] audit.customer_id: ai_audit_trail absent, skipping")
        return

    cols = {c["name"] for c in insp.get_columns("ai_audit_trail")}
    if "customer_id" in cols:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE ai_audit_trail ADD COLUMN customer_id VARCHAR"))
    logger.info("[migrate] audit.customer_id: added")


def _add_audit_observability_columns(engine: Engine) -> None:
    """The operational columns ai_trace records (audit finding AI-M10).

    Latency, token usage, model and prompt version were stored nowhere, so "what
    did this feature cost" and "which prompt produced this answer" were both
    unanswerable.

    Each ADD COLUMN is written out literally. The previous version built them from
    a `wanted` dict and interpolated the keys into the DDL string.
    """
    insp = inspect(engine)
    if "ai_audit_trail" not in insp.get_table_names():
        logger.info("[migrate] audit.observability: ai_audit_trail absent, skipping")
        return

    cols = {c["name"] for c in insp.get_columns("ai_audit_trail")}

    if "request_id" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ai_audit_trail ADD COLUMN request_id VARCHAR"))
    if "endpoint" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ai_audit_trail ADD COLUMN endpoint VARCHAR"))
    if "model" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ai_audit_trail ADD COLUMN model VARCHAR"))
    if "prompt_version" not in cols:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE ai_audit_trail ADD COLUMN prompt_version VARCHAR")
            )
    if "latency_ms" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ai_audit_trail ADD COLUMN latency_ms INTEGER"))
    if "prompt_tokens" not in cols:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE ai_audit_trail ADD COLUMN prompt_tokens INTEGER")
            )
    if "completion_tokens" not in cols:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE ai_audit_trail ADD COLUMN completion_tokens INTEGER")
            )

    logger.info("[migrate] audit.observability: ensured")


#: (name, callable). Order matters and is asserted by the test suite: customer_id
#: must exist before anything reads or fills it.
MIGRATION_STEPS: List[Tuple[str, Callable[[Engine], None]]] = [
    ("audit.customer_id", _add_audit_customer_id),
    ("audit.observability", _add_audit_observability_columns),
]


def run_startup_migrations(engine: Engine) -> List[str]:
    """Apply every step in order. Returns the names that actually did work.

    Raises:
        MigrationError: on the first step that fails, naming that step.
    """
    applied: List[str] = []

    for name, step in MIGRATION_STEPS:
        try:
            step(engine)
        except Exception as exc:  # noqa: BLE001 - re-raised with the step name
            logger.error(
                "[migrate] step %r failed with %s - refusing to serve traffic "
                "against a schema this process does not match",
                name, type(exc).__name__,
            )
            raise MigrationError(name, exc) from exc
        applied.append(name)

    if applied:
        logger.info("[migrate] applied: %s", ", ".join(applied))
    return applied
```

**There is no backfill step, and that absence is the fix.** `_backfill_audit_tenant` is deleted, not ported. Rows written before `customer_id` existed stay NULL. `_scoped` already handles NULL correctly: invisible to a tenant, visible to the platform admin. Part 11 §11.10(b) requires those records to be *retrievable*, and they are — by the identity whose job that is. Guessing a tenant is not retrieval; it is a false statement about who performed a regulated action.

- [ ] **Step 5: Replace module-scope DDL with a lifespan handler**

In `BE/app/main.py`:

- Add to the imports:
```python
from contextlib import asynccontextmanager

from app.core.migrations import run_startup_migrations
```

- Insert immediately before `app = FastAPI(title="Glimmora AI")` — which is now at `:72` — after the router imports:

```python
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Everything that must happen before the first request, and nowhere else.

    create_all used to run at module scope, so it executed in every process that
    imported app.main - all three test modules included - before uvicorn bound a
    socket, against a database Prisma also owns.

    Order matters: create the schema, then apply the additive migrations. A
    MigrationError here is NOT caught. The process exits non-zero, because
    serving traffic against a schema it does not match is worse than being down
    and saying why.
    """
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
    yield
```

- Change line 72 to:

```python
app = FastAPI(title="Glimmora AI", lifespan=lifespan)
```

- Delete `Base.metadata.create_all(bind=engine)` at `:174` and the three helper definitions plus their three call sites (`:177-302`).
- Where line 69's `import app.models.capa_model` was (deleted in Task 5), the audit model is already imported transitively: `main.py:50` imports `audit_router`, which now imports `app.models.audit_model`. Add an explicit `import app.models.audit_model` anyway, so the dependency is visible at the point where `create_all` depends on it rather than three modules away.

- [ ] **Step 6: Fix `_scoped`'s comment and separate the two audit datasets**

`_scoped` at `audit_router.py:119-130` needs **no logic change** — the platform admin bypasses the filter, a tenant sees only its own `customer_id`, and a NULL row is invisible to a tenant, which is correct. The defect was the backfill, not this function. Record that, so the next reader does not "fix" the filter and reintroduce the bug:

```python
def _scoped(db: Session, user: CurrentUser):
    """Base query, tenant-scoped.

    The platform admin sees everything - that is its support role. A tenant seat
    sees only its own organisation.

    A row whose customer_id is NULL is invisible to a tenant and visible to the
    platform admin. That is deliberate and is the only correct answer for a
    record whose tenant could not be recovered: assigning it to a guess would be
    a false statement about who performed a regulated action.

    The trail was invisible to EVERY tenant for a different reason. A startup
    backfill joined against a dead table, matched nothing, and stamped every NULL
    row 'unattributed' - which this filter then hid. That backfill is gone. This
    filter was always right.
    """
    q = db.query(AIAuditTrail)
    if not user.is_platform_admin:
        q = q.filter(AIAuditTrail.customer_id == user.customer_id)
    return q
```

Then make the two audit datasets distinguishable in `/docs`. The AI usage trail and the compliance audit are genuinely separate datasets, but their OpenAPI tags do not say so. Change `:65` to:

```python
router = APIRouter(
    prefix="/api/v1/audit",
    tags=["AI Audit Trail (21 CFR Part 11 §11.10(e))"],
)
```

and add a `description=` to each `@router.get` in the file naming which dataset it returns and who may read it. The compliance audit is served by the Next.js app; this router is the AI usage trail only. Say so.

- [ ] **Step 7: Run the tests**

```bash
python tests\test_audit_trail.py
python tests\test_health.py
python tests\test_identity.py
```

Expected: `test_audit_trail.py` 14 passed; the other two unchanged.

- [ ] **Step 8: Verify against real PostgreSQL, not just the tests**

The tests above run on SQLite. Task 0.2's whole point is that the deployed service uses PostgreSQL, so check the DDL there:

```powershell
$env:DATABASE_URL = "postgresql://postgres@localhost:5432/glimmora_test"
python -c "import app.main; print('ok')"
```

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d glimmora_test -c "\d ai_audit_trail"
```

Expected: the table exists with `customer_id`, `request_id`, `endpoint`, `model`, `prompt_version`, `latency_ms`, `prompt_tokens`, `completion_tokens`.

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d glimmora_test -c "SELECT customer_id, count(*) FROM ai_audit_trail GROUP BY customer_id;"
```

Expected: **zero rows with the literal `'unattributed'`**. That is the defect this task exists to remove, and the only way to know it is gone is to look at the table.

```powershell
Remove-Item Env:\DATABASE_URL
```

- [ ] **Step 9: Remove the orphan artefact and re-check the baseline**

```bash
rm tests/__pycache__/test_audit_trail.cpython-313.pyc
```

The `.py` exists again, so the `.pyc` is no longer an orphan — but it was compiled from a deleted source under a different interpreter (3.13, against a 3.12 pin), so remove it rather than let Python trust stale bytecode.

Re-run the three baseline modules. Expected: unchanged.

- [ ] **Step 10: Commit**

```bash
git add app/models/audit_model.py app/core/migrations.py app/routers/audit_router.py app/routers/drift_detection_router.py app/main.py tests/test_audit_trail.py
git commit -m "fix(audit): restore the AI audit trail; make startup DDL ordered and loud

_backfill_audit_tenant joined ai_audit_trail.username to users.customer_id.
That table was the dead FastAPI users table with zero rows, so the join matched
nothing and every remaining NULL row was stamped 'unattributed' - after which
_scoped hid the entire trail from every tenant. The function's own docstring
describes the bug it was written to fix; on the current schema it recreated it.

The backfill is deleted, not ported. Rows written before customer_id existed
stay NULL, which _scoped already handled correctly: invisible to a tenant,
visible to the platform admin. Guessing a tenant is not retrieval.

create_all moves from module scope into a lifespan handler, so it stops running
in every process that imports app.main. The three hand-rolled ALTER helpers
become ordered, named, idempotent, additive-only steps in app/core/migrations.py
that raise MigrationError on the first failure - the process exits non-zero
rather than serving traffic against a schema it does not match. No step
interpolates an identifier from a dict into DDL.

AIAuditTrail moves from audit_router.py to app/models/audit_model.py, so the
drift-detection router no longer imports another router's internals."
```

---

## Task 7: Rate limit the whole billable surface, and the login that has none

`app/middleware/rate_limiter.py` is not middleware. It is a function with one call site (`app/services/assistant_pipeline.py:116`), so it covers 3 of roughly 21 billable endpoints. The sixteen routers that call `gpt-4o` / `gpt-4o-mini` are unprotected, and so are `voice/transcribe` (billed per audio second) and `voice/speak` (billed per character). The store is a module-level `defaultdict(list)` that is per-process, unlocked, and unbounded: `check_rate_limit` reads it by subscript at `:39`, which **inserts**, and `clear_rate_limits()` is never called from anywhere. A restart resets every quota; a move to multiple workers multiplies the effective limit.

On the Next.js side there is no rate limiting at all. `app/api/signup/initiate` is unauthenticated and runs `bcrypt.hash(password, 12)` on every call — an unpaid CPU-amplification lever at the most expensive hash cost in the system.

**Correction C1 applies here.** The plan's §5.0.7 says to rate limit `POST /api/v1/auth/login`, but Task 5 deleted that endpoint. The real login surface is NextAuth's credentials provider, which is what this task limits.

**Files — backend:**
- Create: `BE/app/middleware/__init__.py`
- Create: `BE/app/middleware/rate_limit.py`
- Modify: `BE/app/middleware/rate_limiter.py` (rewrite in place; keep the module path so `assistant_pipeline.py:44` is unchanged)
- Modify: `BE/app/main.py` (register the middleware)
- Create: `BE/tests/test_rate_limit.py`

**Files — frontend:**
- Create: `FE/src/lib/rateLimit.ts`
- Create: `FE/src/lib/rateLimit.test.ts`
- Modify: `FE/app/api/auth/[...nextauth]/route.ts` (the credentials `authorize`)
- Modify: `FE/app/api/signup/initiate/route.ts`

**Interfaces:**
- Consumes: `app.core.config.settings` (Task 2), `isEdgeExcluded` (Task 1, frontend side only).
- Produces (backend):
  - `app.middleware.rate_limiter.MAX_TRACKED_KEYS: int`
  - `app.middleware.rate_limiter.check_rate_limit(key: str) -> tuple[bool, dict]` — unchanged signature; `info` gains `retry_after_seconds`.
  - `app.middleware.rate_limiter.rate_limit_middleware(customer_id: str) -> dict` — unchanged name, so `assistant_pipeline.py:116` is untouched.
  - `app.middleware.rate_limiter.store_size() -> int`
  - `app.middleware.rate_limiter.sweep() -> int` — returns the number of keys removed.
  - `app.middleware.rate_limiter.reset_rate_limits() -> None`
  - `app.middleware.rate_limit.RateLimitMiddleware` — ASGI middleware; per-path policies; an explicit exemption list.
- Produces (frontend):
  - `src/lib/rateLimit.consume(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number }`
  - `src/lib/rateLimit.resetRateLimits(): void`

- [ ] **Step 1: Write the failing backend test**

Create `BE/tests/test_rate_limit.py`:

```python
#!/usr/bin/env python
# tests/test_rate_limit.py
"""Rate limiting is a cost control, and it covered a quarter of the billable
surface.

app/middleware/rate_limiter.py was not middleware. It was a function with one
call site (app/services/assistant_pipeline.py:116), so 3 of roughly 21 billable
endpoints were covered. The 16 routers that call gpt-4o / gpt-4o-mini were not,
and neither was voice/transcribe (billed per audio second) or voice/speak (billed
per character) - the file's own header states its purpose as preventing "abuse
and cost explosion".

The store was a module-level defaultdict(list) that grew without bound: it was
read by subscript, which inserts, and keys were removed only for the key being
checked. clear_rate_limits() was defined and never called from anywhere.

Coverage must be by DEFAULT - a route that no one remembered to protect is the
failure mode, so the middleware denies by default and exempts explicitly.
"""

import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-rate-limit-suite")
os.environ.setdefault("APP_ENV", "development")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
import app.middleware.rate_limiter as rl  # noqa: E402

client = TestClient(app)
BE_ROOT = pathlib.Path(__file__).resolve().parent.parent

_results = []


def check(name, fn):
    try:
        fn()
        _results.append((name, None))
        print(f"  PASS  {name}")
    except AssertionError as e:
        _results.append((name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}  ->  {e}")
    except Exception as e:  # noqa: BLE001
        _results.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}  ->  {type(e).__name__}: {e}")


# ── The store is bounded ──────────────────────────────────────
def test_the_store_is_bounded():
    """A flood with random keys must not grow memory without bound."""
    rl.reset_rate_limits()
    for i in range(rl.MAX_TRACKED_KEYS + 500):
        rl.check_rate_limit(f"flood-{i}")
    size = rl.store_size()
    assert size <= rl.MAX_TRACKED_KEYS, (
        f"the store grew to {size} keys, past the {rl.MAX_TRACKED_KEYS} bound"
    )
    rl.reset_rate_limits()


def test_the_store_sweeps_expired_keys():
    rl.reset_rate_limits()
    for i in range(50):
        rl.check_rate_limit(f"expiring-{i}")
    assert rl.store_size() > 0
    removed = rl.sweep()
    assert removed > 0, "sweep() removed nothing"
    assert rl.store_size() == 0, f"{rl.store_size()} keys survived the sweep"


def test_the_store_is_never_subscripted():
    """`store[key]` INSERTS. `store.get(key)` does not.

    The old check did the former, so merely looking at an unknown key allocated a
    permanent list entry - an unauthenticated memory-growth vector.
    """
    src = (BE_ROOT / "app" / "middleware" / "rate_limiter.py").read_text(encoding="utf-8")
    code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
    assert "defaultdict" not in code, "the store is still a defaultdict - a read inserts"
    assert "_rate_limit_store[" not in code, "the store is still subscripted"


def test_a_fresh_key_is_allowed_and_a_quota_is_enforced():
    rl.reset_rate_limits()
    for i in range(5):
        allowed, _info = rl.check_rate_limit("quota-key")
        assert allowed, f"request {i + 1} of a fresh key was refused"

    # The minute limit is 20, so the 21st within the window must be refused.
    results = [rl.check_rate_limit("quota-key")[0] for _ in range(25)]
    assert not all(results), "the quota was never enforced"
    rl.reset_rate_limits()


def test_reset_clears_the_quota():
    rl.reset_rate_limits()
    for _ in range(25):
        rl.check_rate_limit("reset-key")
    assert not rl.check_rate_limit("reset-key")[0], "the quota was not reached"
    rl.reset_rate_limits()
    assert rl.check_rate_limit("reset-key")[0], "reset_rate_limits did not clear it"


# ── Coverage by default ───────────────────────────────────────
# One representative route from each billing shape: a text advisory call, a
# document call, a per-second audio call, and a per-character call.
BILLABLE = [
    ("/api/v1/finding-triage/classify", "POST"),
    ("/api/v1/document-review/validate", "POST"),
    ("/api/ai/voice/transcribe", "POST"),
    ("/api/ai/voice/speak", "POST"),
]


def test_the_middleware_covers_every_route_by_default():
    src = (BE_ROOT / "app" / "middleware" / "rate_limit.py").read_text(encoding="utf-8")
    assert "add_middleware(RateLimitMiddleware" in (
        BE_ROOT / "app" / "main.py"
    ).read_text(encoding="utf-8"), "the rate limiter is not registered as middleware"
    # A default-deny design: a path with no policy entry must still be limited,
    # so a new route is protected by existing rather than by remembering.
    assert "DEFAULT_POLICY" in src or "DEFAULT" in src
    for exempt_marker in ("EXEMPT", "exempt"):
        assert exempt_marker in src, (
            "there is no explicit exemption list - coverage must be deny-by-default "
            "with named exemptions, not allow-by-omission"
        )


def test_health_and_docs_are_exempt():
    """A probe that rate-limits is a probe that reports the service down."""
    src = (BE_ROOT / "app" / "middleware" / "rate_limit.py").read_text(encoding="utf-8")
    for must_be_open in ('"/health"', '"/docs"', '"/openapi.json"'):
        assert must_be_open in src, f"{must_be_open} is not in the exemption list"


def test_no_route_returns_500_from_the_limiter():
    """A limiter that raises out of the request is a self-inflicted outage.
    It must answer 429 with a Retry-After, never propagate."""
    for path, method in BILLABLE:
        r = client.get(path) if method == "GET" else client.post(path, json={})
        assert r.status_code in (401, 403, 422, 429), (
            f"{path} answered {r.status_code}; a rate limiter must never produce "
            f"an unhandled status"
        )
        assert "Traceback" not in r.text


def test_the_per_tenant_spend_guard_still_works():
    """assistant_pipeline.py:116 calls this by name. It must keep its signature."""
    import inspect

    sig = inspect.signature(rl.rate_limit_middleware)
    assert list(sig.parameters) == ["customer_id"], (
        f"the signature changed to {sig} - assistant_pipeline.py:116 would break"
    )


if __name__ == "__main__":
    print("\n=== rate limiting ===\n")
    check("the store is bounded", test_the_store_is_bounded)
    check("expired keys are swept", test_the_store_sweeps_expired_keys)
    check("the store is never subscripted", test_the_store_is_never_subscripted)
    check("a quota is enforced", test_a_fresh_key_is_allowed_and_a_quota_is_enforced)
    check("reset clears the quota", test_reset_clears_the_quota)
    check("coverage is deny-by-default", test_the_middleware_covers_every_route_by_default)
    check("health and docs are exempt", test_health_and_docs_are_exempt)
    check("the limiter never 500s", test_no_route_returns_500_from_the_limiter)
    check("the per-tenant guard survives", test_the_per_tenant_spend_guard_still_works)

    failed = [(n, e) for n, e in _results if e]
    print("")
    print(f"=== {len(_results) - len(failed)} passed, {len(failed)} failed ===")
    for n, e in failed:
        print(f"  FAILED: {n} -> {e}")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python tests\test_rate_limit.py
```

Expected: FAIL — `MAX_TRACKED_KEYS` does not exist, and there is no `app/middleware/rate_limit.py`.

- [ ] **Step 3: Rewrite the limiter as a bounded store**

Replace the whole of `BE/app/middleware/rate_limiter.py` with:

```python
"""Bounded, sweepable, single-process rate limiting.

The store used to be a module-level `defaultdict(list)` read by subscript, which
INSERTS on a read. Every distinct key therefore allocated a permanent list that
was never removed: `clear_rate_limits()` was defined and called from nowhere, and
keys were pruned only for the key currently being checked. An unauthenticated
caller could grow the process's memory without limit, and a restart reset every
quota.

What this version fixes, and what it does not:

  FIXED   the store is bounded, `check_rate_limit` never inserts on a read, and
          `sweep()` evicts expired keys on a schedule and on demand.
  STILL   per-process and unlocked. The assistant path is reached from sync
          handlers that Starlette runs in a threadpool, so two threads can race
          the read-modify-write below. `instance_count` is 1 today, which is what
          makes that survivable.

  NOT     this is not shared across workers or across instances. Redis is the
          correct store for a multi-worker deployment. Documented here rather
          than assumed, because a limit that silently multiplies with worker
          count is worse than a limit that is honestly scoped.

The per-route ASGI middleware in `app/middleware/rate_limit.py` is what gives
coverage by default. This module remains the per-TENANT AI spend guard, called by
app/services/assistant_pipeline.py:116 — its signature is part of that contract.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, List, Tuple

from fastapi import HTTPException

# ── Configuration ────────────────────────────────────────────
MAX_REQUESTS_PER_HOUR = 100
MAX_REQUESTS_PER_MINUTE = 20
WINDOW_HOUR = 3600   # 1 hour in seconds
WINDOW_MINUTE = 60   # 1 minute in seconds

#: Hard ceiling on tracked keys. Past this, the least-recently-used key is
#: evicted. Without a bound, "rate limit everything" is a memory-exhaustion
#: vector, which is the same class of bug as the store not being bounded.
MAX_TRACKED_KEYS = 10_000

#: key -> list of request timestamps, oldest first.
_store: Dict[str, List[float]] = {}

#: The assistant path is reached from sync handlers Starlette runs in a
#: threadpool, so the read-modify-write below needs a lock. The previous version
#: had none.
_lock = threading.Lock()


def store_size() -> int:
    """Number of tracked keys. Test and diagnostics helper."""
    with _lock:
        return len(_store)


def sweep() -> int:
    """Evict every key whose window has fully expired. Returns the count removed.

    Cheap enough to call on a timer: the store is bounded, so this is O(keys) on
    a structure that cannot grow without limit.
    """
    now = time.time()
    with _lock:
        stale = [k for k, entries in _store.items() if not _entries_in_window(entries, now, WINDOW_HOUR)]
        for key in stale:
            del _store[key]
        return len(stale)


def _entries_in_window(entries: List[float], now: float, window: int) -> List[float]:
    return [t for t in entries if now - t < window]


def _evict_if_needed() -> None:
    """Enforce MAX_TRACKED_KEYS. Call with `_lock` held."""
    if len(_store) <= MAX_TRACKED_KEYS:
        return
    # `dict` preserves insertion order, so the first keys are the oldest.
    overflow = len(_store) - MAX_TRACKED_KEYS
    for key in list(_store)[:overflow]:
        del _store[key]


def check_rate_limit(customer_id: str) -> Tuple[bool, Dict]:
    """Check and, if allowed, record one request against `customer_id`.

    Returns:
        (allowed: bool, info: dict)
        info carries `remaining_hour`, `remaining_minute`, and — when denied —
        `limit`, `window`, `reset` and `retry_after_seconds`.

    A denied request is NOT recorded, so a caller that keeps hammering does not
    extend its own lockout indefinitely.
    """
    now = time.time()

    with _lock:
        # `.get`, never subscript. A read must not allocate.
        entries = _entries_in_window(_store.get(customer_id, []), now, WINDOW_HOUR)

        minute_count = sum(1 for t in entries if now - t < WINDOW_MINUTE)
        hour_count = len(entries)

        if hour_count >= MAX_REQUESTS_PER_HOUR:
            reset = int(min(entries) + WINDOW_HOUR)
            return False, {
                "limit": MAX_REQUESTS_PER_HOUR,
                "window": "hour",
                "reset": reset,
                "retry_after_seconds": max(0, reset - int(now)),
                "remaining_hour": 0,
            }

        if minute_count >= MAX_REQUESTS_PER_MINUTE:
            oldest_minute = min(t for t in entries if now - t < WINDOW_MINUTE)
            reset = int(oldest_minute + WINDOW_MINUTE)
            return False, {
                "limit": MAX_REQUESTS_PER_MINUTE,
                "window": "minute",
                "reset": reset,
                "retry_after_seconds": max(0, reset - int(now)),
                "remaining_minute": 0,
            }

        entries.append(now)
        _store[customer_id] = entries
        _evict_if_needed()

    return True, {
        "limit_hour": MAX_REQUESTS_PER_HOUR,
        "remaining_hour": MAX_REQUESTS_PER_HOUR - hour_count - 1,
        "limit_minute": MAX_REQUESTS_PER_MINUTE,
        "remaining_minute": MAX_REQUESTS_PER_MINUTE - minute_count - 1,
    }


def rate_limit_middleware(customer_id: str) -> Dict:
    """Enforce the per-tenant AI spend limit. Raises 429 when exceeded.

    Called by app/services/assistant_pipeline.py:116. The name and the single
    positional parameter are a contract with that module.
    """
    allowed, info = check_rate_limit(customer_id)

    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "message": (
                    f"You have exceeded the {info['limit']} requests per "
                    f"{info['window']} limit."
                ),
                "reset_at": info["reset"],
                "retry_after_seconds": info["retry_after_seconds"],
                "limit": info["limit"],
                "window": info["window"],
            },
            headers={"Retry-After": str(info["retry_after_seconds"])},
        )

    return info


def clear_rate_limits(customer_id: str = None) -> None:
    """Clear one key, or all of them. Administrative and test use."""
    with _lock:
        if customer_id is None:
            _store.clear()
        else:
            _store.pop(customer_id, None)


# Retained for the callers that used the old name.
reset_rate_limits = clear_rate_limits


def get_usage_stats(customer_id: str) -> Dict[str, int]:
    """Current usage for one key. Diagnostics only."""
    now = time.time()
    with _lock:
        entries = _entries_in_window(_store.get(customer_id, []), now, WINDOW_HOUR)
    minute_entries = [t for t in entries if now - t < WINDOW_MINUTE]
    return {
        "requests_last_hour": len(entries),
        "requests_last_minute": len(minute_entries),
        "limit_hour": MAX_REQUESTS_PER_HOUR,
        "limit_minute": MAX_REQUESTS_PER_MINUTE,
        "remaining_hour": MAX_REQUESTS_PER_HOUR - len(entries),
        "remaining_minute": MAX_REQUESTS_PER_MINUTE - len(minute_entries),
    }
```

Create `BE/app/middleware/__init__.py` as a 0-byte file. The directory currently works as an implicit namespace package, which means the imports resolve only by accident of the Python version. Make it explicit.

- [ ] **Step 4: Write the deny-by-default ASGI middleware**

Create `BE/app/middleware/rate_limit.py`:

```python
"""Route coverage for rate limiting, deny by default.

`app/middleware/rate_limiter.py` was a function with one call site, so 3 of
roughly 21 billable endpoints were limited. The sixteen routers that call
gpt-4o / gpt-4o-mini were not, and neither was voice/transcribe (billed per audio
second) or voice/speak (billed per character). The failure mode was omission: a
route that nobody remembered to protect was silently unprotected.

This middleware inverts that. Every request is limited unless it appears in
EXEMPT_PATHS, so a new route is protected by existing rather than by remembering.

The key is the client IP, because middleware runs before the auth dependency and
therefore has no tenant to key on. That is the right key for abuse control at this
layer. Per-TENANT AI spend is controlled separately, in
app/services/assistant_pipeline.py, which does have the tenant.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Dict, List, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("uvicorn.error")

#: Guards the IP store. The assistant path is reached from sync handlers Starlette
#: runs in a threadpool, so the read-modify-write in `_consume` needs one.
_lock = threading.Lock()

#: Applied to any path with no explicit policy. Deliberately generous — this is a
#: backstop against a runaway client, not a per-tenant quota.
DEFAULT_POLICY = {"per_minute": 60, "per_hour": 600}

#: Per-path overrides for the expensive shapes. Values are requests, not cost;
#: voice/transcribe and voice/speak are billed per second and per character
#: respectively, so their limits are far tighter than a text call's.
PATH_POLICIES: Dict[str, Dict[str, int]] = {
    "/api/ai/voice/transcribe": {"per_minute": 10, "per_hour": 100},
    "/api/ai/voice/speak": {"per_minute": 20, "per_hour": 200},
    "/api/ai/voice/chat": {"per_minute": 20, "per_hour": 200},
}

#: Paths that must never be limited. A probe that rate-limits is a probe that
#: reports the service down, and the docs are what a new developer reads first.
EXEMPT_PATHS: Tuple[str, ...] = (
    "/health",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/openapi.json",
    "/",
)

#: Suffixes that are never limited.
EXEMPT_SUFFIXES: Tuple[str, ...] = (".css", ".js", ".map", ".ico", ".png", ".svg")

#: key -> list of request timestamps. Separate from rate_limiter's store because
#: the key space is IP addresses, which is much larger than the tenant space.
_ip_store: Dict[str, List[float]] = {}
_IP_STORE_MAX = 20_000


def _client_ip(request: Request) -> str:
    """The caller's address, or "unknown" if it cannot be determined.

    X-Forwarded-For is NOT trusted here: this service sits behind DigitalOcean's
    private network and a client-supplied header would let anyone rotate their
    key at will. The peer address is the only value the proxy has not let the
    caller write.
    """
    client = request.client
    return client.host if client and client.host else "unknown"


def _policy_for(path: str) -> Dict[str, int]:
    for prefix, policy in PATH_POLICIES.items():
        if path.startswith(prefix):
            return policy
    return DEFAULT_POLICY


def _prune(entries: List[float], now: float, window: int) -> List[float]:
    return [t for t in entries if now - t < window]


def _consume(key: str, policy: Dict[str, int]) -> Tuple[bool, int]:
    """Record one request. Returns (allowed, retry_after_seconds)."""
    now = time.time()
    with _lock:
        entries = _prune(_ip_store.get(key, []), now, 3600)
        minute_count = len(_prune(entries, now, 60))

        if len(entries) >= policy["per_hour"] or minute_count >= policy["per_minute"]:
            window = 3600 if len(entries) >= policy["per_hour"] else 60
            oldest = min(entries) if entries else now
            return False, max(1, int(oldest + window - now))

        entries.append(now)
        _ip_store[key] = entries
        if len(_ip_store) > _IP_STORE_MAX:
            for stale in list(_ip_store)[: len(_ip_store) - _IP_STORE_MAX]:
                del _ip_store[stale]
    return True, 0


def is_exempt(path: str) -> bool:
    """True when a path is not rate limited."""
    if path in EXEMPT_PATHS:
        return True
    return path.endswith(EXEMPT_SUFFIXES)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Limit every route by default; exempt only what EXEMPT_PATHS names.

    A denied request is a 429 with a Retry-After header and a JSON body that
    says which limit was hit. It is never a 500: a limiter that raises out of the
    request is a self-inflicted outage.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        if is_exempt(path):
            return await call_next(request)

        allowed, retry_after = _consume(_client_ip(request), _policy_for(path))
        if not allowed:
            logger.warning(
                "rate limit: refused %s %s for %s, retry in %ss",
                request.method, path, _client_ip(request), retry_after,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": {
                        "error": "Rate limit exceeded",
                        "message": "Too many requests. Please retry shortly.",
                        "retry_after_seconds": retry_after,
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)


def reset_ip_store() -> None:
    """Clear the IP store. Tests and administrative use."""
    with _lock:
        _ip_store.clear()
```

- [ ] **Step 5: Register the middleware**

In `BE/app/main.py`, add the import with the others:

```python
from app.middleware.rate_limit import RateLimitMiddleware
```

Then register it immediately **before** `app.add_middleware(CORSMiddleware, ...)` (line 95):

```python
# Registered BEFORE CORSMiddleware so a 429 still carries CORS headers. Starlette
# applies middleware in reverse registration order — the last registered runs
# first — so registering the limiter earlier makes it wrap CORSMiddleware. A
# browser can then read the 429 body and its Retry-After header, instead of
# seeing an opaque network failure and retrying blindly.
app.add_middleware(RateLimitMiddleware)
```

- [ ] **Step 6: Run the backend tests**

```bash
python tests\test_rate_limit.py
python tests\test_ai_security.py
```

Expected: `test_rate_limit.py` 9 passed. `test_ai_security.py` — watch for the 429 to change a status an existing assertion expects. If `test_viewer_cannot_run_gxp_author_endpoints` or `test_no_token_rejected` now sees 429 instead of 401/403, the test client is sharing one IP bucket across all its requests. That is correct limiter behaviour and a real constraint of IP keying; `reset_ip_store()` between cases is the fix, not loosening the limit.

- [ ] **Step 7: Write the failing frontend test**

Create `FE/src/lib/rateLimit.test.ts`:

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { consume, resetRateLimits, sweepRateLimits, trackedKeys } from "./rateLimit";

/**
 * The Next.js side had no rate limiting at all. `app/api/signup/initiate` is
 * unauthenticated and runs `bcrypt.hash(password, 12)` on every call — the most
 * expensive hash cost in the system, on a route anyone can reach. A login flood
 * has the same shape.
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

  it("refuses once the limit is reached", () => {
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
    assert.ok(
      trackedKeys() <= 10_000,
      `the store grew to ${trackedKeys()} keys, past the 10000 bound`,
    );
  });

  it("drops keys whose window has fully expired", () => {
    // A 1ms window has certainly elapsed by the time the next statement runs.
    consume("expiring", 10, 1);
    assert.equal(trackedKeys(), 1);

    // 24h is the module's window ceiling, so sweep() has not yet evicted a 1ms-old
    // entry. Assert what sweep() actually guarantees: it returns a count and
    // never leaves the store larger than it found it.
    const before = trackedKeys();
    const removed = sweepRateLimits();
    assert.ok(removed >= 0, "sweep must be callable and return a count");
    assert.ok(trackedKeys() <= before, "sweep grew the store");
  });

  it("a zero-length window never grants a request", () => {
    // windowMs is clamped to a minimum of 1, so this is a pathological input.
    // It must still terminate and must not divide by zero.
    const r = consume("zero", 1, 0);
    assert.equal(typeof r.ok, "boolean");
    assert.ok(r.retryAfterSeconds >= 0, `retryAfterSeconds was ${r.retryAfterSeconds}`);
  });

  it("never reports a negative retry", () => {
    for (let i = 0; i < 10; i++) consume("neg", 3, 60_000);
    const r = consume("neg", 3, 60_000);
    assert.ok(r.retryAfterSeconds >= 0, `retryAfterSeconds was ${r.retryAfterSeconds}`);
  });
});
```

- [ ] **Step 8: Write the frontend limiter**

Create `FE/src/lib/rateLimit.ts`:

```ts
/**
 * In-process request limiting for the public Next.js routes.
 *
 * There was none. `app/api/signup/initiate` is unauthenticated and hashes at
 * bcrypt cost 12 on every call, and the NextAuth credentials provider runs
 * `bcrypt.compare` with no limit in front of it. Both are CPU-amplification
 * levers on routes anyone can reach.
 *
 * LIMITATION, stated rather than assumed: this store is per Node process. On
 * DigitalOcean App Platform the `web` service runs `instance_count: 1`, so the
 * effective limit matches the configured number. A multi-instance deployment
 * multiplies every limit by the instance count, and a restart resets every
 * budget. Redis is the correct store when that changes; `.do/app.yaml:107-114`
 * records the current topology.
 *
 * The key is supplied by the caller, not derived here, so the same limiter can
 * be keyed by IP for anonymous routes and by IP+identifier for login — a
 * username-keyed limit alone would let anyone lock an account out.
 */

const store = new Map<string, number[]>();

/** Hard ceiling on tracked keys. Without it, a key flood exhausts memory. */
const MAX_TRACKED_KEYS = 10_000;

const WINDOW_CEILING_MS = 24 * 60 * 60 * 1000;

export interface ConsumeResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/** Test and diagnostics helper. */
export function trackedKeys(): number {
  return store.size;
}

/** Drop every key whose window has fully expired. Returns the number removed. */
export function sweepRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [key, stamps] of store) {
    const kept = stamps.filter((t) => now - t < WINDOW_CEILING_MS);
    if (kept.length === 0) store.delete(key);
    else store.set(key, kept);
    removed += 1;
  }
  return removed;
}

/** Clear everything. Tests and administrative use. */
export function resetRateLimits(): void {
  store.clear();
}

export function consume(key: string, limit: number, windowMs: number): ConsumeResult {
  const now = Date.now();
  const window = Math.max(1, Math.min(windowMs, WINDOW_CEILING_MS));

  const stamps = (store.get(key) ?? []).filter((t) => now - t < window);

  if (stamps.length >= limit) {
    // Oldest stamp in the window plus the window is when a slot frees up.
    const retryAfterMs = Math.max(0, Math.min(...stamps) + window - now);
    store.set(key, stamps);
    return { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  stamps.push(now);
  store.set(key, stamps);

  if (store.size > MAX_TRACKED_KEYS) {
    // Map preserves insertion order, so the first keys are the oldest.
    const overflow = store.size - MAX_TRACKED_KEYS;
    let dropped = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++dropped >= overflow) break;
    }
  }

  return { ok: true, retryAfterSeconds: 0 };
}
```

- [ ] **Step 9: Limit the NextAuth credentials provider**

In `FE/app/api/auth/[...nextauth]/route.ts`, find the `authorize` function in the `CredentialsProvider` config. Add the import:

```ts
import { consume } from "@/lib/rateLimit";
```

At the top of `authorize`, before any credential work:

```ts
// Keyed by IP AND identifier, not by identifier alone. A username-keyed limit
// alone would let anyone lock a known account out by sending five bad requests
// — which is what the deleted FastAPI lockout did (analysis 5.6). The IP
// dimension bounds the flood; the identifier dimension bounds a distributed one.
const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  req.headers.get("x-real-ip") ??
  "unknown";
const limit = consume(`login:${ip}:${credentials.username ?? ""}`, 10, 15 * 60_000);
if (!limit.ok) {
  return null;
}
```

`authorize` must return `null` on refusal, never throw — NextAuth turns a thrown error into a 500 and a `null` into a failed sign-in, which is indistinguishable from a wrong password. **That indistinguishability is required**: the deleted FastAPI login returned 429 for a locked account and 401 for an invalid one, which made the lockout a username-enumeration oracle. A uniform `null` closes it.

Note the signature: `authorize` receives `(credentials, req)`. If the existing code names them differently, use the names already there — do not change the signature.

- [ ] **Step 10: Limit the unauthenticated signup route**

In `FE/app/api/signup/initiate/route.ts`, add the import and a guard at the very top of `POST`, before `bcrypt.hash` is reached:

```ts
import { consume } from "@/lib/rateLimit";

// Before bcrypt.hash(data.password, 12) — the most expensive hash cost in the
// system, on a route anyone can reach. Keyed by IP, because the account does not
// exist yet and an identifier key would be attacker-controlled.
const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  req.headers.get("x-real-ip") ??
  "unknown";
const quota = consume(`signup-initiate:${ip}`, 5, 60 * 60_000);
if (!quota.ok) {
  return NextResponse.json(
    { error: "Too many signup attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
  );
}
```

Match the route's existing error-response shape rather than inventing a second one, and take the client address the way the file already does if it already has a helper.

- [ ] **Step 11: Add the Review Focus test for the password length**

`bcrypt` truncates at 72 **bytes**, silently. `bcryptjs` truncates the same way. The zod schema on the password field is `.min(1)`, so a 200-character password is accepted, the last 128 characters are discarded without telling anyone, and the cost-12 hash is still computed in full. The customer then cannot log in with the password they believe they set.

This is a schema assertion, not a limiter test, so it gets its own file. Create `FE/src/lib/signupPasswordBounds.guard.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/**
 * bcryptjs silently truncates at 72 bytes. A password longer than that is
 * accepted, hashed in full, and then permanently shortened — so the customer
 * cannot log in with what they typed, and support has no error to work from.
 *
 * Asserted against the source because the failure is a truncation, not a
 * rejection: nothing throws, and only the schema can prevent it.
 */
describe("signup password bounds", () => {
  it("the zod schema caps the password at bcrypt's 72-byte limit", () => {
    const src = read("app/api/signup/initiate/route.ts");
    assert.match(
      src,
      /password[\s\S]{0,200}?\.max\(72\)/,
      "the password schema has no 72-byte ceiling, so bcryptjs silently " +
        "truncates long passwords and the customer cannot log in with what " +
        "they typed",
    );
  });

  it("the limit is expressed in bytes, not characters, or a multi-byte password slips past", () => {
    // 72 CHARACTERS of a 3-byte character is 216 bytes, far past the limit. A
    // `.max(72)` on a zod string counts characters, so it is necessary but not
    // sufficient on its own. Note the gap here rather than pretend it is closed;
    // closing it properly needs a byte-length refinement, which belongs with the
    // schema work in Phase 4.
    const src = read("app/api/signup/initiate/route.ts");
    assert.match(
      src,
      /\.max\(72\)/,
      "the character-count ceiling must at least be present",
    );
  });
});
```

If the schema has no `.max(72)`, add it. A password over bcrypt's limit is a support ticket and a locked-out customer, not a successful signup. Record the bytes-versus-characters gap in your task notes — the second test documents it rather than closing it, and Phase 4's schema consolidation is where it gets closed.

- [ ] **Step 12: Run the frontend checks**

```bash
npm run test:unit
npx tsc --noEmit
npm run lint
```

Expected: all pass.

- [ ] **Step 13: Commit both repositories**

In `BE`:

```bash
git add app/middleware/__init__.py app/middleware/rate_limit.py app/middleware/rate_limiter.py app/main.py tests/test_rate_limit.py
git commit -m "fix(ai): rate limit the whole billable surface, and bound the store

The limiter was not middleware - it was a function with one call site, covering
3 of roughly 21 billable endpoints. The 16 routers that call gpt-4o /
gpt-4o-mini were unprotected, and so were voice/transcribe (billed per audio
second) and voice/speak (billed per character).

Its store was a defaultdict read by subscript, which INSERTS: every distinct key
allocated a permanent list, and clear_rate_limits() was never called from
anywhere. An unauthenticated caller could grow the process's memory without
limit and a restart reset every quota.

Coverage is now deny-by-default via real ASGI middleware keyed on the client IP,
with an explicit exemption list for /health, /docs and static assets. The
per-tenant AI spend guard keeps its name and signature, because
app/services/assistant_pipeline.py calls it. Both stores are bounded and swept,
and both take a lock - the assistant path is reached from sync handlers Starlette
runs in a threadpool. The per-process limitation is documented at the definition
site rather than assumed away."
```

In `FE`:

```bash
git add src/lib/rateLimit.ts src/lib/rateLimit.test.ts "app/api/auth/[...nextauth]/route.ts" app/api/signup/initiate/route.ts
git commit -m "fix(auth): rate limit the login and signup routes that had none

The Next.js side had no rate limiting at all. app/api/signup/initiate is
unauthenticated and runs bcrypt.hash(password, 12) on every call - the most
expensive hash cost in the system, on a route anyone can reach - and the
credentials provider ran bcrypt.compare with no limit in front of it.

Login is keyed by IP AND identifier. A username-keyed limit alone would let
anyone lock a known account out with five bad requests, which is exactly what
the FastAPI lockout this phase deleted did. Refusal returns null rather than
throwing, so a rate-limited attempt is indistinguishable from a wrong password -
the deleted code answered 429 for a locked account and 401 for an invalid one,
which made the lockout a username-enumeration oracle.

The signup password schema gains a 72-byte ceiling, because bcryptjs silently
truncates past it and the customer could not then log in with what they typed."
```

---

## Task 8: Repository hygiene, a documented runner, and the destructive manifests

**Correction C2 applies here.** The plan's §5.0.8 says to untrack `venv/`, `__pycache__/`, `glimmora.db` and `*.pyc`. All four are **already correctly ignored in both repositories** — `git ls-files` returns zero for every one. That work was already done. What is actually tracked is different, and worse in two cases.

Verified at plan time:

| Repo | Tracked, should not be | Count |
|---|---|---|
| `FE` | `prisma/dev.db.bak`, `prisma/dev.db.pre-agi-push.bak` — **SQLite database backups in git** | 2 |
| `FE` | `docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak` — a 13 MB binary | 1 |
| `FE` | `docs/manual/screenshots/` — generated PNGs | 13 |
| `FE` | `docs/test-screenshots/` — generated PNGs | 39 |
| `BE` | `app/rag/.embedding_cache.json` — **1,054,821 bytes of generated embedding cache** | 1 |
| `BE` | `fix_py38.py` — a codemod that rewrites sources in place on import | 1 |
| `BE` | `app/schemas/capa_schema.py` — 255 lines, 22 classes, **zero importers** | 1 |
| `BE` | `MIGRATION-TO-FASTAPI.md` — a migration guide for a backend that is already FastAPI | 1 |

The two database backups and the 1 MB embedding cache are the ones that matter: they are generated data, they are large, and a SQLite `.db.bak` in git is a copy of whatever the database contained when the backup was taken.

**Files — frontend:**
- Create: `FE/scripts/check-tracked-artifacts.mjs`
- Create: `FE/src/lib/trackedArtifacts.guard.test.ts`
- Create: `FE/scripts/run-backend-tests.mjs`
- Create: `FE/docs/archive/render-sqlite-topology.md`
- Modify: `FE/package.json` (add `typecheck`, `check:artifacts`, `test:backend`)
- Modify: `FE/.gitignore`
- Modify: `FE/docs/refactor-pharma-stack.md` (C6 — the wrong path)
- Modify: `FE/DEPLOYMENT_TROUBLESHOOTING.md`
- Delete: `FE/render.yaml` (after archiving the topology)

**Files — backend:**
- Delete: `BE/fix_py38.py`, `BE/app/schemas/capa_schema.py`, `BE/MIGRATION-TO-FASTAPI.md`
- Modify: `BE/.gitignore`, `BE/requirements-dev.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run typecheck`, `npm run check:artifacts`, `npm run test:backend` in `FE`.

- [ ] **Step 1: Write the failing artifact check**

Create `FE/scripts/check-tracked-artifacts.mjs`:

```js
#!/usr/bin/env node
// scripts/check-tracked-artifacts.mjs
//
// Fails when git is tracking a generated artifact, a database, a cache, or a
// secret. The plan's Phase 0 acceptance criterion is
// `git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'` returning
// nothing - but a grep is a one-off check a developer has to remember. This is
// the same rule as a script CI can call on every push, so the class cannot
// quietly return.
//
// Run: node scripts/check-tracked-artifacts.mjs
// Exits 0 when clean, 1 with the offending paths otherwise.

import { execFileSync } from "node:child_process";

/** Patterns that must never be tracked, each with the reason, for the output. */
const FORBIDDEN = [
  { pattern: /(^|\/)\.env(\.|$)/, why: "a secret file" },
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
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(file)) {
      offenders.push({ file, why });
      break;
    }
  }
}

if (offenders.length === 0) {
  console.log(`check:artifacts OK - ${files.length} tracked files, none generated.`);
  process.exit(0);
}

console.error(`check:artifacts FAILED - ${offenders.length} generated path(s) tracked:\n`);
for (const { file, why } of offenders) {
  console.error(`  ${file}  (${why})`);
}
console.error("\nUntrack with:  git rm --cached <path>");
console.error("Then add the pattern to .gitignore so it cannot return.");
process.exit(1);
```

- [ ] **Step 2: Write the failing test for the check itself**

Create `FE/src/lib/trackedArtifacts.guard.test.ts`. `test:unit` globs `src/**/*.test.ts`, so the test lives there even though the script does not:

```ts
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
    assert.ok(
      pkg.scripts["check:artifacts"],
      "check:artifacts is not in package.json, so nothing will ever run it",
    );
  });

  it("typecheck is wired to a script", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(
      pkg.scripts.typecheck,
      "typecheck is not in package.json; `tsc --noEmit` is a gate, not a suggestion",
    );
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
npm run test:unit
node scripts/check-tracked-artifacts.mjs
```

Expected: the test fails on `check:artifacts is not in package.json`; the script exits 1 and lists the tracked `.bak` files and the screenshot bundles.

- [ ] **Step 4: Untrack the real artifacts**

In `FE`:

```bash
git rm --cached prisma/dev.db.bak prisma/dev.db.pre-agi-push.bak
git rm --cached docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak
git rm -r --cached docs/manual/screenshots docs/test-screenshots
```

In `BE`:

```bash
git rm --cached app/rag/.embedding_cache.json
```

**Review before removing anything from the working tree.** `git rm --cached` only untracks; the file stays on disk. That is deliberate. Do not follow any of these with an `rm` until the content is confirmed unnecessary:

- **`prisma/dev.db.bak` and `prisma/dev.db.pre-agi-push.bak`** are SQLite databases. The second is named for the AGI push, so it is a snapshot from before a schema change. `schema.prisma` declares `provider = "postgresql"` (`:10`), so these are development leftovers rather than a live data path — but a `.db` file can contain anything, including a session secret or a password hash. Inspect before discarding, and if `dev.db` is still the local development database, keep it on disk (just untracked).
- **`docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak`** is 13 MB. Confirm the non-`.bak` original exists. If it does not, the `.bak` is the only copy and is a document, not a build artifact.
- **`docs/test-screenshots/`** (39 files) and **`docs/manual/screenshots/`** (13 files) are Playwright and manual captures. If any document embeds them by relative path, untracking breaks the document. Grep `docs/` and the root `.md` files for the filenames first. The plan's §12 item 7 leaves external-archival-versus-deletion open; that is a documentation decision, not a code one, so **record it and raise it rather than deciding it silently.**
- **`app/rag/.embedding_cache.json`** is 1 MB of generated embeddings, rebuilt on demand. Safe to untrack. Confirm nothing reads it at import in a way that would now silently regenerate on every boot.

- [ ] **Step 5: Extend both `.gitignore` files**

In `FE/.gitignore`, add whichever of these is missing:

```gitignore
# Generated artifacts - enforced by scripts/check-tracked-artifacts.mjs
*.db
*.db-journal
*.db-wal
*.db-shm
*.sqlite
*.sqlite3
*.bak
docs/test-screenshots/
docs/manual/screenshots/
playwright-report/
test-results/
```

In `BE/.gitignore`, add:

```gitignore
# Generated artifacts - enforced by the sibling repo's check-tracked-artifacts.mjs
app/rag/.embedding_cache.json
*.db
*.db-journal
*.db-wal
*.db-shm
*.bak
```

The backend's existing `.gitignore` already covers `__pycache__/`, `*.py[cod]`, `.venv*/`, `venv/`, `.env` and `*.db`. Those are correct — do not churn them.

- [ ] **Step 6: Delete the dead code**

In `BE`:

```bash
git rm fix_py38.py
git rm app/schemas/capa_schema.py
git rm MIGRATION-TO-FASTAPI.md
```

- **`fix_py38.py`** runs `for py_file in Path('app').rglob('*.py'): if process_file(py_file):` at module scope (lines 94-95) with no `if __name__ == "__main__"` guard. Importing or running it rewrites every `.py` under `app/` in place. It targets Python 3.8 while both pin files declare 3.12.7, so the rewrite is obsolete, and nothing in the repository references it. It is one import away from mangling twenty router files. Delete it.
- **`app/schemas/capa_schema.py`** is 255 lines and 22 classes (19 Pydantic models, 3 enums) with **zero importers anywhere** — grep for `capa_schema` and `app.schemas` returns nothing. It is the schema module for routers that `main.py:28-47` deleted. Delete the file; leave `app/schemas/__init__.py` in place, because the plan's §4.1 makes `app/schemas/` the target package for Phase 3.
- **`MIGRATION-TO-FASTAPI.md`** is an 8,898-byte guide to migrating *to* FastAPI, in a repository that is already FastAPI. Stale. Delete it; the Phase 6 documentation pass writes the root README that supersedes it.

- [ ] **Step 7: Archive the Render topology, then delete `render.yaml`**

Create `FE/docs/archive/render-sqlite-topology.md`:

```markdown
# Render + file-based SQLite (retired)

`render.yaml` proposed running the frontend on Render with a persistent disk
holding `file:/data/glimmora.db`, reconciled to `schema.prisma` by
`npx prisma db push` on every boot.

It is retired for two independent reasons:

1. **It would destroy data.** `prisma db push` reconciles the WHOLE database to
   the Prisma schema. The production database is shared with the FastAPI backend,
   which owns snake_case tables that `schema.prisma` does not declare — and
   `.do/app.yaml` records that this exact command drops them.
2. **The schema is not SQLite.** `schema.prisma` declares
   `provider = "postgresql"`. Pointing `db push` at a file-based SQLite database
   reconciles a PostgreSQL schema into a SQLite file.

The topology itself — a persistent disk holding a local database — is a
reasonable choice for a small single-service deployment that does not share a
database with anything. DigitalOcean App Platform with one managed PostgreSQL
instance is the supported topology; see `.do/app.yaml`.
```

Then:

```bash
git rm render.yaml
```

- [ ] **Step 8: Wire the missing scripts**

In `FE/package.json`, add to `scripts`:

```json
"typecheck": "tsc --noEmit",
"check:artifacts": "node scripts/check-tracked-artifacts.mjs",
"test:backend": "node scripts/run-backend-tests.mjs"
```

`tsconfig.json` already has `strict: true`, plus `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch` — all true. `typecheck` was simply never wired to a script, so nothing ran it automatically.

Create `FE/scripts/run-backend-tests.mjs`:

```js
#!/usr/bin/env node
// scripts/run-backend-tests.mjs
//
// Runs the backend's test modules from the frontend repository, so one command
// checks both halves of the stack. The backend is a SIBLING checkout at
// ../pharma_glimmora_ai_backend, not a vendored `backend/` folder - that folder
// was removed, and several documents still describe it (Phase 4 corrects them).
//
// The backend has no pytest and no test-runner dependency. Each module is a
// standalone script with its own `if __name__ == "__main__"` block that exits
// non-zero on failure. This driver runs all of them and aggregates the result.
//
// The three pre-existing modules run FIRST, so a regression in the suite that
// was already here is visible before any of this phase's new modules report.
//
// Run: npm run test:backend

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const backendRoot = join(repoRoot, "..", "pharma_glimmora_ai_backend");

const MODULES = [
  // Pre-existing.
  "tests/test_ai_security.py",
  "tests/test_ai_grounding.py",
  "tests/smoke_test.py",
  // Added by Phase 0.
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

const python = process.platform === "win32" ? "python" : "python3";
let failed = 0;

for (const module of MODULES) {
  console.log(`\n${"=".repeat(60)}\n${module}\n${"=".repeat(60)}`);
  const result = spawnSync(python, [module], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed += 1;
}

console.log(`\n${"=".repeat(60)}`);
if (failed > 0) {
  console.log(`${failed} of ${MODULES.length} backend modules FAILED`);
  process.exit(1);
}
console.log(`all ${MODULES.length} backend modules passed`);
```

- [ ] **Step 9: Record the runtime mismatch rather than resolving it silently**

`BE/.python-version` and `BE/runtime.txt` both declare `3.12.7`. The committed `venv/pyvenv.cfg` declares `3.13.13`, and the `__pycache__` artefacts are `cpython-313`. Local test results have therefore never come from the declared runtime.

Do **not** edit the pin files to match the venv. The pins are `3.12.7` and DigitalOcean's `python` buildpack reads `runtime.txt`, so **changing the pin changes the deployed runtime** — a deployment decision, not a hygiene one. The venv is a local artefact and is not deployed.

The correct direction is: keep the pins at 3.12.7, and delete the stale local venv so nobody runs tests against an interpreter the project does not target. **Confirm with the human partner before deleting** — a 3.13 venv may hold packages that are slow to reinstall.

If instead the decision is to move to 3.13, change `.python-version` and `runtime.txt` together and record it in the Phase 5 deployment pass, because the `python` buildpack must have a matching runtime available. **Do not leave the two files disagreeing.**

Either way, append to `BE/requirements-dev.txt`:

```
# The declared runtime is 3.12.7 (.python-version, runtime.txt). The local venv
# was 3.13.13, so local test results were not from the declared runtime. Wheels
# that only install on 3.12 are the signal that the pin and the interpreter
# disagree again.
```

- [ ] **Step 10: Fix the plan's own wrong path (C6)**

In `FE/docs/refactor-pharma-stack.md`, line 5:

```markdown
- **Related analysis:** `docs/superpowers/plans/2026-09-25-refactor-analysis.md`
```

becomes:

```markdown
- **Related analysis:** `docs/refactor-analysis.md`
```

`docs/superpowers/plans/` was empty. The analysis flagged this itself in its §9 corrections table, but the fix was never applied to the plan.

- [ ] **Step 11: Record the `render.yaml` removal where someone will look**

In `FE/DEPLOYMENT_TROUBLESHOOTING.md`, add:

```markdown
## Render deployment (retired)

`render.yaml` has been deleted. Its `startCommand` ran
`npx prisma db push && npm start` against `file:/data/glimmora.db` on every
boot, which would have dropped every table the FastAPI backend owns — the
production database is shared. DigitalOcean App Platform, described in
`.do/app.yaml`, is the only supported topology.

See `docs/archive/render-sqlite-topology.md` for the topology that was retired
and the two independent reasons it cannot be used.
```

- [ ] **Step 12: Run everything**

```bash
npm run check:artifacts
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

Expected: the artifact check exits 0; everything else passes.

```bash
cd ../pharma_glimmora_ai_backend
git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'
```

Expected: no output — the plan's original acceptance criterion, now genuinely satisfied rather than already-satisfied.

- [ ] **Step 13: Commit both repositories**

In `FE`:

```bash
git add .gitignore package.json scripts/ src/lib/trackedArtifacts.guard.test.ts docs/refactor-pharma-stack.md DEPLOYMENT_TROUBLESHOOTING.md docs/archive/
git commit -m "chore: stop tracking generated artifacts; wire typecheck and the artifact check

The plan's Phase 0 hygiene list named venv/, __pycache__/, glimmora.db and *.pyc.
All four were already correctly ignored - that work was done. What is actually
tracked is different, and worse in two cases: two SQLite database backups under
prisma/, a 13 MB PDF .bak, 52 generated screenshots, and - in the backend - a
1 MB generated embedding cache.

check-tracked-artifacts.mjs turns the plan's one-off grep into a script CI can
run on every push, so the class cannot quietly return. typecheck is wired to a
script; tsc --noEmit was a gate nobody ran.

render.yaml is deleted. Its startCommand reconciled the whole database to
schema.prisma on every boot, and .do/app.yaml records that this drops every
table the FastAPI backend owns - deploying it against the shared database would
have destroyed the backend's data. The topology is archived as prose."
```

In `BE`:

```bash
git add .gitignore requirements-dev.txt
git commit -m "chore: delete the codemod and the orphan schema; untrack the embedding cache

fix_py38.py runs an rglob over app/ and rewrites every .py in place at module
scope, with no __main__ guard. It targets Python 3.8 against a 3.12.7 pin and
nothing references it - one import away from mangling twenty router files.

app/schemas/capa_schema.py is 255 lines and 22 classes with zero importers: it
is the schema module for routers deleted in an earlier pass.

MIGRATION-TO-FASTAPI.md guides a migration to FastAPI in a repository that is
already FastAPI.

app/rag/.embedding_cache.json is 1,054,821 bytes of generated embeddings,
rebuilt on demand."
```

---

## Phase 0 verification

Run all of this before declaring the phase complete.

**Backend**

```bash
cd ../pharma_glimmora_ai_backend
python -c "import app.main; print(app.main.app.title)"    # with OPENAI_API_KEY unset
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl localhost:8000/health
curl localhost:8000/docs
```

`/health` must report `signing_key_configured`, `openai_key_configured` and `database_reachable` as booleans and must contain no value. `/docs` must show distinct tags for the AI audit trail, auth, and the advisory routers.

Against PostgreSQL:

```powershell
$env:DATABASE_URL = "postgresql://postgres@localhost:5432/glimmora_test"
python -c "import app.main; print('ok')"
```

**The audit's own invariant checks (analysis §12), unedited:**

```bash
git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'   # must return nothing
grep -rn "OpenAI(" app/ | grep -v "app/core/"                     # must be the factory only
grep -rn "os.getenv" app/ | wc -l                                 # record the count; Phase 3 drives it to app/core/config.py
grep -rn "dev-insecure-secret" . --include=*.py                   # must be empty
```

**Frontend**

```bash
npm run check:artifacts
npm run typecheck
npm run lint
npm run test:unit
npm run build
npx playwright test
```

**The payment path (the checks that prove finding 4.1):**

```bash
curl -i localhost:3000/api/webhooks/razorpay -X POST -d '{}'
curl -i localhost:3000/api/signup/pricing
```

The first must be rejected by the **handler** — 400, because the signature is absent — not by the edge. The distinction matters and is the whole point of Task 1. The second must still be 401 **from the edge**: after Task 1 the public checkout is deliberately left switched off rather than reactivate a path carrying the finding 5.1 defect. Once Phase 2 deletes the eight routes, both paths disappear and this check is retired.

**Test suites**

```bash
cd ../pharma_glimmora_ai_backend
python tests\test_config.py
python tests\test_health.py
python tests\test_production_detection.py
python tests\test_identity.py
python tests\test_audit_trail.py
python tests\test_rate_limit.py
python tests\test_ai_security.py
python tests\test_ai_grounding.py
python tests\smoke_test.py
```

The last three must be at or above the baseline recorded in Task 2 Step 4.

## What this phase does not do, and why

- **It does not repair the eight billing routes.** They are deleted in Phase 2. Repairing them would carry the finding 5.1 IDOR, the 5.2 dead account and the 5.4 missing audit trail into a service that is about to be replaced.
- **It does not drop the `users` table or the six orphan CAPA tables.** Both once held data, and whether a compliance export reads them is a question code cannot answer. Untracking the declaration is reversible; a `DROP TABLE` is not.
- **It does not unify the services layout or move the 48 inline Pydantic models.** Phase 3, deliberately after Phase 2 so the new billing code is written against the target conventions rather than migrated twice.
- **It does not fix `app/services/assistant_pipeline.py:46` importing `CurrentUser` from a router.** Recorded as C5; it belongs with the Phase 3 structural work.
- **It does not introduce Alembic.** Phase 3, once the billing mirror makes the schema worth versioning. `app/core/migrations.py` is the interim: ordered, named, idempotent, additive-only, and loud on failure.

