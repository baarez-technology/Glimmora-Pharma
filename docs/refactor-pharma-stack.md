# Glimmora Pharma Refactoring Plan

- **Date:** 25 September 2026
- **Revision:** 29 September 2026 - re-sequenced around verified blockers; repository
  ownership, per-phase frontend wiring and a per-phase confirmation gate added
- **Related analysis:** `docs/refactor-analysis.md`
- **Audience:** Developers implementing or reviewing the refactoring
- **Target state:** secure, deployable, conventionally structured, and correct on money

## 0. Where the code lives

Two sibling repositories. The separation is fixed and is not reopened in review.

| Concern | Repository | Local path | Deployed as |
|---|---|---|---|
| Frontend, interface, identity, session, Server Actions, Prisma schema, billing UI | `Glimmora-Pharma` | `.\Glimmora-Pharma` | DigitalOcean `web` service, and the `migrate` job |
| AI service, advisory endpoints, audit trail, billing service | `pharma_glimmora_ai_backend` | `.\pharma_glimmora_ai_backend` | DigitalOcean `api` service |
| Deployment topology for both | `Glimmora-Pharma` | `.do/app.yaml` | DigitalOcean App Platform |

Every phase below states which repository each change belongs in. A change that spans both
is two changes, in two commits, reviewed together.

- **There is no `backend/` folder inside `Glimmora-Pharma`, and this plan does not create
  one.** `.do/app.yaml:31-35` records what the last vendored snapshot cost: it drifted
  months behind `ai_develop`, carried 12 of 24 routers, and every newer AI endpoint 404'd
  in production while working locally. The backend is a sibling checkout and a separate
  deploy target, and that is the arrangement that works.
- **The backend is built from its own repository on its own branch**
  (`baarez-technology/pharma_glimmora_ai_backend`, branch `ai_develop`), never from a copy
  inside the frontend repository.
- **Backend changes modify existing files in place.** New modules appear only where a new
  responsibility requires one: `app/core/`, `app/models/audit_model.py`,
  `app/middleware/`. Nothing is renamed, split, or relocated for tidiness, and no service
  moves between the flat and `app/services/` conventions before the phase that decides which
  convention is correct.
- **Frontend integration uses the structures that already exist.** The AI
  backend-for-frontend at `app/api/ai-proxy/[...path]/route.ts`, the NextAuth session, and
  the Server Actions in `src/actions/` are the integration seams. A new frontend
  integration introduces no new client library, no new state pattern, and no new proxy.
- **The dependency direction is one-way.** Next.js calls FastAPI; FastAPI never calls
  Next.js. `BACKEND_URL` points at `${api.PRIVATE_URL}` (`.do/app.yaml:140-142`) so nothing
  leaves the private network.
- **Every phase ends by wiring the two together and asking for confirmation.** See section
  3, rules 14 and 15, and the closing block of each phase below.


## 1. Purpose

This plan turns the findings in the companion analysis into an ordered sequence of work.
It supersedes the previous version, which began with baseline capture and reached the
billing migration at Phase 3. That order was unsafe: the billing flow does not currently
execute, the backend cannot open the production database from its committed dependencies,
and six authorization or correctness defects would have been carried into the new service
rather than fixed by it.

The new sequence is:

```
Phase 0  Stabilize and Secure        <- new. Nothing else starts until green.
Phase 1  Converge the subscription model
Phase 2  Build the FastAPI billing service   <- the main migration
Phase 3  Backend structural consistency
Phase 4  Frontend cleanup
Phase 5  Deployment, CI and quality gates
Phase 6  Verification and documentation
```

Phase 0 exists so that every later phase is built on a system that starts, connects, and
rejects unauthorized callers. Phase 1 exists because Phase 2 cannot provision a working
customer account while Prisma models subscription twice with nothing joining the halves.

Each phase is a complete unit of work: it names the repository each change belongs in, ends
with the frontend wired to the backend, and stops for confirmation before the next phase
starts.


## 2. Decisions this plan implements

These were settled before sequencing and are not reopened in review.

| # | Decision | Consequence |
|---|---|---|
| 1 | **Converge on `Subscription`; retire `Plan`** | Add `maxUsers`, `maxSites`, `minRetentionYears` to `Subscription`. Repoint the login gate and `useTenantConfig` at `tenant.subscription`. Migrate live `Plan` rows. `SubscriptionPlan` remains the price catalogue. |
| 2 | **Build the billing service correctly in FastAPI; delete the eight Next.js routes in the same phase** | The old routes are already unreachable behind `proxy.ts`, so there is no working behaviour to preserve. The routes are read as a behavioural specification, not as code to port. |
| 3 | **NextAuth is the sole identity issuer; FastAPI verifies only** | Delete FastAPI's `/auth/signup` and `/auth/login` and the ghost `users` table. Remove the `User` / `users` collision and the arbitrary-`customer_id` token hole in one move. |
| 4 | **Two sibling repositories, one-way dependency, never vendored** | Backend code goes in `pharma_glimmora_ai_backend`; frontend code goes in `Glimmora-Pharma`. No `Glimmora-Pharma/backend/` folder, ever - see section 0. A change spanning both is two commits, reviewed together. |


## 3. Non-negotiable rules

These apply to every phase. A change that violates one does not merge.

**Security**

1. No secret in git, logs, error messages, or documentation. Only variable names appear
   in this repository's documents. `.env`, `.env.local`, `venv/`, `__pycache__/`,
   `*.db`, `*.bak` and generated screenshots stay untracked.
2. JWTs are minted only by NextAuth. FastAPI verifies. No endpoint may mint a token for a
   `customer_id` it has not validated against the database.
3. Every public write is validated, idempotent, transactional, and audited. A replay is a
   defined `409`, never a `500`.
4. Amount, plan and billing cycle are bound server-side to the Razorpay order before the
   client can influence them. The checkout signature covers only `orderId|paymentId`.
5. Signature comparison is constant-time and cannot raise on a malformed input. A missing
   or invalid signature is a `400` that changes no records.
6. A missing secret or key fails closed with a clear error. The application still starts and
   `/health` still answers, and the failing capability returns a configuration error rather
   than an import error.
7. Authorization is enforced at the resource, not at the edge. The edge gate is
   defense-in-depth and must not be the only check.

**Correctness**

8. Prisma owns the schema. SQLAlchemy mirrors it exactly - same columns, same
   nullability, same unique constraints, same `onDelete` behaviour. The refactoring
   introduces no schema change other than the `Plan` to `Subscription` migration in
   Phase 1.
9. `prisma db push` never runs against the shared database. Only `prisma migrate deploy`.
10. Money movement is atomic. Tenant, subscription and payment are created or updated in
    one transaction, and a failure leaves no partial state.

**Delivery**

11. Each task is small enough to review and revert on its own. No task mixes a behaviour
     change with a file move.
12. Each phase leaves both applications runnable and passing their own checks.
13. Existing API response shapes and field names are preserved unless a change is
     documented in this plan and in the OpenAPI description.
14. **The backend is never vendored into the frontend.** No `Glimmora-Pharma/backend/`
    directory is created at any point in this programme. The two repositories are siblings;
    the frontend deploys the `api` service from the backend repository, not from a copy of
    it.
15. **Every phase ends with the frontend wired to the backend, working end to end**, using
    the existing structures - the AI proxy at `app/api/ai-proxy/[...path]/route.ts`, the
    NextAuth session, and `src/actions/`. A phase that leaves the two unable to talk is not
    finished, however green its own tests are. "Both applications start" is not the same
    claim as "the frontend can still reach the backend", and only the second one is the
    exit criterion.
16. **Each phase is confirmed by a named human before the next phase begins.** The
    completion report states, in the client's terms: what a person can now do that they
    could not before, what is still broken on purpose and why, and what was verified
    against running code rather than inferred from a unit test. A phase that is not
    confirmed is not closed and the next phase does not start.


## 4. Coding standards

These are the conventions the refactoring enforces. They exist so that the result reads as
maintained code rather than accumulated code.

### 4.1 Backend

| Concern | Rule |
|---|---|
| Package layout | `app/routers/` HTTP only. `app/services/` business logic, one function per public entry point. `app/schemas/` Pydantic request and response models. `app/models/` SQLAlchemy models. `app/core/` configuration, security primitives, the OpenAI factory. |
| Router body | Parse the request, resolve dependencies, call one service function, set a status code. No `os.getenv`, no `db.query`, no business branching. |
| Schemas | Request and response models live in `app/schemas/`, grouped by domain (`auth_schema.py`, `ai_schema.py`, `billing_schema.py`, `advisory_schema.py`). Model-output validators that belong to a prompt stay with the prompt. |
| Configuration | One `Settings` object in `app/core/config.py` using `pydantic-settings`. No `os.getenv` outside that module. `load_dotenv()` is called once, there. |
| External clients | One factory per external service. The OpenAI client is created lazily on first use and cached. No module-scope client construction. |
| Models | Declared in `app/models/`, never in a router. `__tablename__` matches Prisma exactly. |
| Errors | Raise a typed domain error from the service; translate it to an HTTP status in the router. Never leak an internal message, a query, or a secret. |
| Transactions | The service owns the transaction boundary. Routers never open one. |
| Logging | Structured, via `app/observability/`. Log an identifier, not a payload. Never log a token, a password hash, a signature, or a full request body. |
| Tests | Every service function has a test. External services are mocked at the factory, never by monkeypatching a module attribute. |

### 4.2 Frontend

| Concern | Rule |
|---|---|
| Data access | Server-first. Server Actions and route handlers for reads and writes; Redux Toolkit for client UI state. One documented pattern. |
| Validation | Zod schemas in `src/schemas/`, one file per domain, imported by both the client form and the server action so a rule is defined once. |
| Types | `tsc --noEmit` is a gate, not a suggestion. No `any` in application code. No non-null assertion (`!`) on a value whose nullability has not been handled. |
| Route handlers | Validate with Zod at the boundary. Do not trust a client-supplied identifier, price, or plan. |
| Secrets | Anything prefixed `NEXT_PUBLIC_` is in the browser bundle. The AI signing key is server-only and must never gain that prefix. |
| Errors | Surface the application's normal error format. Never render a raw backend message, a stack, or an internal identifier. |
| Components | One component per file. A second variant is a decision with a reason recorded, not a stray file. |

### 4.3 Both

- Comments explain why, not what. Delete a comment that restates the code.
- Every public function and every route has a docstring or description that a new developer
  could act on.
- A file that documents itself as "deprecated" is either deleted or fixed in the same
  change. A comment that contradicts the code is a defect.

## 5. Phase 0: Stabilize and Secure

### Objective

Make the system start, connect, and reject unauthorized callers, and stop the two
destructive configurations. Nothing else begins until this phase is green.

This phase deliberately does **not** repair the eight billing routes. They are deleted in
Phase 2. The one exception is noted in task 0.1.

### 0.1 Stop the bleeding on live webhooks

`proxy.ts:101-104` 401s every anonymous request that is not `/login` or `/api/auth/*`.
Razorpay callbacks are currently being rejected, so payments are captured with no state
transition.

Add `api/webhooks` to the matcher exclusion so callbacks land. This is a one-line change
whose purpose is to stop losing money today; the handler it unblocks is replaced in Phase 2
and the exclusion is removed with it.

Do **not** add `api/signup` to the exclusion. That would reactivate a public payment path
carrying the `planId` IDOR from analysis 5.1, and it is a smaller change to leave the
checkout broken for the duration of this phase than to ship an exploitable one.

- **Files:** `proxy.ts` (`Glimmora-Pharma`)
- **Acceptance:** `POST /api/webhooks/razorpay` with a valid signature is no longer 401
  from the edge. `GET /api/signup/pricing` still 401s, and that is intended and recorded.

Extract the matcher into `src/lib/proxyMatcher.ts` rather than editing the pattern in place.
`proxy.ts` imports `next/server` and `next-auth/jwt`, neither of which loads under
`node --test`, so a security control edited in that file cannot be tested at all - which is
how the payment outage went unnoticed. One exported pattern string, one helper derived from
it, and a unit test that fails if `api/signup` is ever re-added to the exclusion list.

### 0.1b Close the proxy's silent fallback to localhost

`app/api/ai-proxy/[...path]/route.ts:9-12` falls back `BACKEND_URL` →
`NEXT_PUBLIC_API_URL` → `"http://localhost:8000"`. A production deploy missing
`BACKEND_URL` therefore proxies to localhost, silently. The missing-signing-secret path
twelve lines below correctly fails closed with 503; this one does not, and the two
disagreeing inside one file is the worst place for it.

Remove the fallback in a non-development environment: a missing `BACKEND_URL` returns 503
naming the variable, exactly as a missing signing key does. The development default stays,
because a local `npm run dev` with no backend URL should not require an env var.

- **Files:** `app/api/ai-proxy/[...path]/route.ts`, `src/lib/aiToken.server.ts` (the rule
  is identical, so the two belong together), and a unit test
- **Acceptance:** with `NODE_ENV=production` and no `BACKEND_URL`, the proxy returns 503
  naming `BACKEND_URL`. With `NODE_ENV=development`, it still falls back to
  `http://localhost:8000`. The test covers both.


### 0.2 Give the backend a PostgreSQL driver

`requirements.txt` has none, so the `postgresql://` `DATABASE_URL` that `.do/app.yaml:70`
declares cannot be opened (analysis 4.2).

Add `psycopg2-binary` with a pinned version. Confirm which driver the deployed image
actually uses, and make the manifest match reality rather than assuming.

Then add an import-time assertion in `app/core/config.py` that rejects a
`postgresql://` URL when no driver is importable, so this failure mode surfaces as a clear
message instead of a `ModuleNotFoundError` from inside SQLAlchemy.

- **Files:** `requirements.txt`, `app/core/config.py`
- **Acceptance:** with a PostgreSQL `DATABASE_URL`, `import app.main` succeeds and
  `/health` reports a successful database probe. Rebuilding the DigitalOcean `api` service
  from `requirements.txt` produces a service that starts.

### 0.3 Centralise configuration and stop the missing-key crash

Twenty-four module-scope `OpenAI(...)` constructions raise before `/health` exists
(analysis 4.3).

Create `app/core/config.py` with a single `Settings` object, and
`app/core/openai_client.py` with a lazily-invoked, cached client factory. Replace all
twenty-four sites. Move model names into settings so a rotation is a configuration change.

`/health` gains a real readiness block: configuration present, database reachable, OpenAI
key present - each a boolean, never a value.

- **Files:** `app/core/config.py` (new), `app/core/openai_client.py` (new),
  `app/main.py`, all 24 AI modules, `requirements.txt`
- **Acceptance:** `import app.main` succeeds with `OPENAI_API_KEY` unset. `/health`
  returns 200. An AI call without a key returns a configuration error naming the variable,
  not a traceback. `grep -rn "OpenAI(" app/` matches only the factory.

### 0.4 Make the production check host-independent

The JWT fallback is guarded by `ENV`, `ENVIRONMENT` or `RENDER`, so on any other host
every token is signed with a source-visible key (analysis 5.3).

Replace the three divergent checks at `auth_router.py:38-41`, `:199` and `:236-246` with
one helper in `app/core/config.py`. The rule is: the development default is permitted only
when an explicit `APP_ENV=development` is set. Absence of a value is not development. The
fallback key constant moves out of the source tree entirely.

A missing `SECRET_KEY` in a non-development environment must produce a
`/health` that reports `signing_key_configured: false` and refuses traffic, rather than a
`RuntimeError` at import. Crashing is not a security control; a readiness failure is.

Use timezone-aware datetimes. `datetime.utcnow()` at `auth_router.py:206` is deprecated on
the pinned runtime.

- **Files:** `app/core/config.py`, `app/routers/auth_router.py`, `app/main.py`,
  `tests/test_ai_security.py`
- **Acceptance:** with no `APP_ENV`, the app refuses to start and says why. With
  `APP_ENV=development` it starts and `/health` reports the insecure state explicitly.
  Tokens are 1 hour whenever `APP_ENV=production`, on any host. The test asserting the
  dev key is absent from the health payload still passes.

### 0.5 Close the FastAPI identity hole

NextAuth becomes the sole issuer (decision 3).

Delete `POST /api/v1/auth/signup` and `POST /api/v1/auth/login`. Remove the `User` model
from `app/models/capa_model.py` and the `users` table, which has zero rows and no reader
once login is gone. This resolves the `User` / `users` collision in one move and closes the
path where `req.customer_id` was accepted unvalidated into a signed token.

Retain token verification, `require_roles`, and the opaque decode error. Retain the
bcrypt helpers - Phase 2 needs them - but retarget them at Prisma's `Tenant.passwordHash`
once the billing service exists.

Also delete the orphan CAPA cluster declarations (`capas`, `rcas`, `action_plans`,
`monitoring`, `effectiveness_checks`, `capa_closures`) in `app/models/capa_model.py`. They
have no reader and no writer, and `create_all` recreates them on every boot, keeping the
`prisma db push` hazard live in both directions (`.do/app.yaml:14-18` warns that command
would drop the backend's snake_case tables).

**Drop the declarations, not the tables.** `app/main.py:28-47` asserts they are retained for
inspection, and whether a compliance export, an audit-history query or a regulatory report
reads them is a question code cannot answer. So:

- Empty `app/models/capa_model.py`, so `create_all` stops recreating the six tables. This is
  reversible.
- **No `DROP TABLE`.** The tables stay in the database. `app/main.py`'s comment is rewritten
  to say so, and to record that the irreversible action is deferred to a reviewed migration
  with a named owner.

Correct the acceptance criterion to match: *"the `users` model is gone and `create_all` no
longer creates it"* — not *"`SELECT * FROM users` fails"*. `users` once held rows, and
dropping a table that did is a migration and a decision this phase does not make. The same
applies to the six CAPA tables.

- **Files:** `pharma_glimmora_ai_backend/app/routers/auth_router.py`,
  `app/models/capa_model.py`, `app/main.py`
- **Acceptance:** no FastAPI route can mint a token. `SELECT * FROM users` still succeeds -
  the table is retained pending a reviewed migration, and `create_all` no longer creates it.
  Every FastAPI route that needs a caller requires a token that NextAuth issued. Existing
  AI tests pass. `hash_password`, `verify_password` and `validate_password_strength`
  survive with an explicit `BCRYPT_COST = 12`, because Phase 2 verifies the existing
  cost-10 and cost-12 hashes with them and without them every customer would need a forced
  password reset.


### 0.6 Restore the audit trail

`_backfill_audit_tenant` joins against the empty `users` table and marks every audit row
`'unattributed'`, after which the `_scoped` filter hides the trail from every tenant
(analysis 5.8).

Stop the backfill. Fix `_scoped` in `audit_router.py:119-130` so unattributed rows remain
visible to platform admins and are not silently assigned to a tenant. Replace
`create_all` at module scope with a lifespan handler. Convert the two `ALTER TABLE`
helpers into a single ordered, recorded, logged migration step that fails loudly. Add a
database probe to `/health`.

Move `AIAuditTrail` out of `audit_router.py:32` into `app/models/`, and update
`drift_detection_router.py:36` to import it from there. Give the AI audit and compliance
audit routes distinct paths, descriptions and OpenAPI tags.

- **Files:** `app/main.py`, `app/routers/audit_router.py`,
  `app/routers/drift_detection_router.py`, `app/models/` (new module)
- **Acceptance:** an audit row written for a real tenant is visible to that tenant through
  the API. A failed migration step produces a non-zero exit and a log line naming the
  step, not a swallowed exception. `/health` distinguishes "database unreachable" from
  "signing key missing".

### 0.7 Bound the rate limiter and cover the billable surface

The limiter is not a middleware, covers 3 of roughly 21 billable endpoints, and login has
none. Both stores grow without bound (analysis 5.6).

Convert it to real ASGI middleware so every route is covered by default, with per-route
exemptions declared explicitly rather than by omission. Move the store to Redis with a TTL,
or, if Redis is not available in this phase, bound the in-process store with a maximum key
count and a sweep, and document the per-process limitation at the definition site rather
than assuming it away.

Bound the existing per-tenant store too. `_rate_limit_store` is a `defaultdict(list)` read by
subscript at `rate_limiter.py:39`, which **inserts** — so merely looking at an unknown key
allocates a permanent list. `clear_rate_limits()` is never called from anywhere, and the
assistant path is reached from sync handlers Starlette runs in a threadpool, so the
read-modify-write needs a lock.

**Login limiting belongs in the frontend, not here.** Task 0.5 deletes
`POST /api/v1/auth/login`, so the only login surface left is the NextAuth credentials
provider at `app/api/auth/[...nextauth]/route.ts`, which has no limiting at all. Delete the
`FAILED_LOGINS` block here with its endpoint — it was a memory-growth vector, a
third-party lockout lever, and a username-enumeration oracle — and put a bounded limiter in
`Glimmora-Pharma` instead:

- Key on **IP and identifier together**. A username-keyed limit alone lets anyone lock a
  known account out with five bad requests, which is precisely the defect being removed
  here. The IP dimension bounds a flood; the identifier dimension bounds a distributed one.
- On refusal, `authorize` returns `null`, never throws. A rate-limited attempt must be
  indistinguishable from a wrong password. The deleted code answered 429 for a locked
  account and 401 for an invalid one, which is what made the lockout an oracle.

`app/api/signup/initiate/route.ts` is unauthenticated and calls `bcrypt.hash(password, 12)`
on every call, so it needs a limit before it is migrated. Bound the store there too, and add
a **72-byte ceiling to the password schema**: `bcryptjs` truncates silently past 72 bytes, so
a longer password is accepted, hashed in full, and then permanently shortened — the customer
cannot log in with what they typed and there is no error to work from.

- **Files:** `pharma_glimmora_ai_backend/app/middleware/rate_limiter.py`,
  `app/main.py`; `Glimmora-Pharma/src/lib/rateLimit.ts`,
  `app/api/auth/[...nextauth]/route.ts`, `app/api/signup/initiate/route.ts`
- **Acceptance:** every billable AI route returns 429 when exceeded, from the middleware
  rather than from a remembered call site. Both stores are bounded and swept. An
  unauthenticated login flood with random usernames grows memory by a bounded amount, and
  cannot lock a known account. A rate-limited attempt and a wrong password are
  indistinguishable from outside.


### 0.8 Repository hygiene

The list below is what the second verification pass found actually tracked. The original
list — untracking `venv/`, `__pycache__/`, `glimmora.db`, `*.pyc` — is **already done**;
all four are correctly ignored in both repositories and `git ls-files` returns zero for
every one. Do not spend a task re-confirming it. What is tracked is different, and two of
these are worse than a stale cache:

- `Glimmora-Pharma`: `prisma/dev.db.bak` and `prisma/dev.db.pre-agi-push.bak` — **SQLite
  database backups in git**, one of them a snapshot from before the AGI push. A `.db` file
  can contain a session secret or a password hash. Untrack both, and check the contents
  before discarding.
- `Glimmora-Pharma`: `docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak` (13 MB),
  `docs/manual/screenshots/` (13 files), `docs/test-screenshots/` (39 files). Confirm the
  non-`.bak` original exists and that no document embeds the screenshots by relative path
  before untracking. External archival versus deletion is the open question in section 12,
  item 7 — record it, do not decide it silently.
- `pharma_glimmora_ai_backend`: `app/rag/.embedding_cache.json` — **1,054,821 bytes of
  generated embeddings**, rebuilt on demand. Not in any previous pass.

Then:

- Delete `fix_py38.py`. It rewrites sources in place at module scope, on import, with no
  `__main__` guard (`fix_py38.py:94-95`), and nothing references it. One import away from
  mangling twenty router files.
- Delete `app/schemas/capa_schema.py` — 255 lines, 22 classes, zero importers. Keep
  `app/schemas/__init__.py`; Phase 3 moves models there.
- Delete `MIGRATION-TO-FASTAPI.md` — a migration guide for a backend that is already
  FastAPI. The root README written in Phase 6 supersedes it.
- Delete `render.yaml`. `npx prisma db push` on every boot, against `file:/data/glimmora.db`,
  against a schema whose provider is `postgresql`. `.do/app.yaml:14-18` records that this
  exact command drops the backend's tables. Archive the *topology* as prose in
  `docs/archive/` if the option is worth keeping on record; the file itself is not safe.
- Add `typecheck` to `package.json` and confirm `tsconfig.json` has `strict: true` — it does.
  `tsc --noEmit` was a gate nobody ran.
- Add `check:artifacts` and `test:backend` scripts, so the hygiene rules are a script CI can
  run rather than a grep a developer has to remember. `pytest` is not in
  `requirements.txt` and will not be: the three existing modules are standalone scripts with
  their own `__main__` blocks, and `requirements-dev.txt` records that as the runner.
- Reconcile `.python-version`, `runtime.txt` and the local interpreter. Both pin files say
  3.12.7; the committed venv is 3.13.13. **The pins are the truth** — DigitalOcean's
  `python` buildpack reads `runtime.txt`, so changing the pin changes the deployed runtime,
  which is a deployment decision. Delete the stale local venv instead, after confirming with
  whoever owns the machine. Record the reconciliation either way; do not leave the two files
  disagreeing.

- **Acceptance:** `git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'` returns
  nothing in either repository. `npm run typecheck` passes. `node scripts/check-tracked-artifacts.mjs`
  exits 0.

### Phase 0 exit criteria

- The backend starts with no `OPENAI_API_KEY` and against a PostgreSQL database, from
  `requirements.txt` alone.
- A token cannot be forged on any host, and no FastAPI route can mint one.
- Every billable endpoint is rate limited; login is not a memory-growth or lockout vector.
- The audit trail is visible to the tenants it belongs to.
- The AI proxy fails closed on a missing `BACKEND_URL` instead of proxying to localhost.
- `render.yaml` and the destructive DDL paths are gone.
- No build artifact, database, or secret is tracked.
- Both applications run, and both test suites are at or above the recorded baseline.

### Phase 0: frontend wiring, then confirmation

**Backend changes** — `pharma_glimmora_ai_backend`: the PostgreSQL driver, `app/core/`, the
OpenAI factory, the JWT rules, the identity-hole deletion, the audit-trail repair, the
rate-limit middleware.

**Frontend changes** — `Glimmora-Pharma`: the proxy matcher and its tests, the
`BACKEND_URL` fail-closed rule, the `src/lib/rateLimit.ts` limiter on the credentials
provider and on `signup/initiate`, the 72-byte password ceiling, and the repository hygiene.

**The wiring, verified against running code, not unit tests:**

1. Both applications start from their committed manifests: `pip install -r
   requirements.txt` then `uvicorn app.main:app`, and `npm ci && npm run dev`.
2. `curl localhost:8000/health` reports `signing_key_configured`,
   `openai_key_configured` and `database_reachable` as booleans, and contains no value.
3. `curl -i localhost:3000/api/webhooks/razorpay -X POST -d '{}'` answers **400 from the
   route's own signature check**, not 401 from the edge. The distinction is the point of
   task 0.1.
4. `curl -i localhost:3000/api/signup/pricing` answers **401 from the edge**. Intended, and
   recorded: the checkout carries the 5.1 defect until Phase 2 replaces it.
5. From a signed-in browser session, an advisory call through
   `/api/ai-proxy/api/v1/finding-triage/classify` returns 200. A 401 proves the request
   arrived and the token was rejected, which is the healthy result. A 404 or a connection
   error means `BACKEND_URL` is misconfigured — task 0.1b exists to make that a clear 503
   instead of a silent fallback.
6. A wrong AI token is rejected, `alg: none` is rejected, and an expired token is rejected —
   the four cases in `tests/test_ai_security.py`, still green.

**Then stop and report.** State what a person can now do that they could not before: a
Razorpay payment finally reaches its handler, and the backend boots at all. State what is
still broken on purpose: public checkout is 401'd at the edge, and `Plan` still has no join
to `Subscription`, so the customer who pays still cannot log in until Phase 1. State what was
verified against running code and what was only verified by a unit test. **Wait for
confirmation before starting Phase 1.**


## 6. Phase 1: Converge the subscription model

### Objective

Leave exactly one subscription model, so that a paid customer is a working account
(analysis 5.2).

### Work

1. Characterise every read of `Plan`. `route.ts:211` and `:412` gate login;
   `src/hooks/useTenantConfig.ts:42,59-60` derives caps;
   `SubscriptionTab.tsx:28-38` renders the settings view. Find the rest before changing
   anything.
2. Add `maxUsers`, `maxSites` and `minRetentionYears` to `Subscription` in
   `schema.prisma`. `durationMonths` is already represented by the interval between
   `startDate` and `expiryDate`.
3. Write the migration: copy live `Plan` rows into `Subscription` for every tenant that has
   one, preferring an existing Razorpay `Subscription` row and otherwise creating it from
   the `Plan` values. Record the row count in the migration comment.
4. Repoint every read site from `tenant.plan` to `tenant.subscription`.
5. Resolve the role vocabulary. Confirm `"customer_admin"` as canonical, correct
   `prisma/schema.prisma:23`, and data-fix any `"CustomerAdministrator"` row.
6. Remove the `Plan` model and its `PlanRoleLimit` relation, or fold `roleLimits` into
   `Subscription` first if it carries live data.
7. Align `src/lib/passwords.ts:12` so `BCRYPT_COST` is the single source of truth, or
   document the deliberate cost-12 exception.

### Acceptance criteria

- A tenant with an active `Subscription` and no `Plan` row can log in, sees correct
  `maxUsers` and `maxSites`, and is not blocked by `SUBSCRIPTION_INACTIVE`.
- No source file references `tenant.plan` or the `Plan` model.
- The migration is reversible and its row counts are recorded.
- No `Tenant.role` value outside the canonical set remains.

### Phase 1: frontend wiring, then confirmation

**Backend changes:** none. This phase is entirely `Glimmora-Pharma` — the Prisma schema, its
migration, and the read sites in `route.ts:211,412`, `useTenantConfig.ts:42,59-60` and
`SubscriptionTab.tsx`. The backend repository is untouched, which is worth stating: a schema
change with a mirror in `pharma_glimmora_ai_backend` must not leave the mirror stale, and
Phase 0's `AIAuditTrail` is the only table the backend declares, so nothing here invalidates
it.

**The wiring, verified against running code:**

1. Seed or migrate a tenant that has an active `Subscription` and **no `Plan` row** — the
   exact shape `verify-payment` produces today. Sign in as that tenant's `customer_admin`.
2. The login gate passes. No `SUBSCRIPTION_INACTIVE`, no redirect to `/login`.
3. The tenant's `maxUsers` and `maxSites` in the UI match the values on the `Subscription`
   row, and are non-zero.
4. `useTenantConfig` reports `isExpired === false` and both caps from `tenant.subscription`.
5. A tenant with a genuinely expired subscription is still refused, and still says why. The
   fix must not turn a locked-out paying customer into an unlimited one.
6. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` and `npm run build` pass, and
   `npx playwright test` is green on the login and dashboard specs.

**Then stop and report.** The headline: *a customer who has paid can now log in.* That is
the first phase in this programme whose output a customer would notice. State the recorded
`Plan`-row migration count, state which read sites moved, and state that public checkout is
still 401'd at the edge pending Phase 2. **Wait for confirmation before starting Phase 2.**


## 7. Phase 2: Build the FastAPI billing service

This is the main architectural change and a single coordinated migration across both
repositories (decision 2).

### 2.1 Lock the contracts

The eight Next.js routes are read as a specification. For each, record the request body,
validation, normalisation, defaults, error responses, database reads and writes, and state
transitions:

`app/api/signup/pricing/route.ts`, `initiate/route.ts`, `create-order/route.ts`,
`verify-payment/route.ts`, `app/api/subscriptions/status/route.ts`, `renew/route.ts`,
`verify-renewal/route.ts`, `app/api/webhooks/razorpay/route.ts`.

Correct the specification against the findings rather than transcribing it. The plan and
billing cycle in `verify-renewal` are client-supplied and unsigned (analysis 5.1); the
`CustomerAdministrator` role value and the missing `Plan` row (analysis 5.2) are defects,
not behaviour to preserve.

### 2.2 Add the SQLAlchemy mirror

Mirror `SubscriptionPlan`, `PendingSignup`, `Subscription` (with the Phase 1 columns) and
`Payment` from `schema.prisma`, plus `Tenant` because provisioning writes it.

Verify every column, nullability, default, unique constraint and `onDelete` action
against `prisma/migrations/20260716120000_reconcile_postgres_baseline/migration.sql` and
the live database. Reproduce `Payment.razorpayPaymentId @unique`,
`Subscription.tenantId @unique`, `PendingSignup.adminEmail` and `adminUsername` `@unique`,
and `Tenant.email` / `username` / `customerCode` `@unique`. Use real PostgreSQL enums where
the schema's `String` columns are documented as app-enforced enums, but note that the
stale "SQLite has no enums" comments in `schema.prisma` are no longer true.

Do not mirror `Plan`.

### 2.3 Add the Razorpay integration

One module for order creation, checkout signature verification, webhook signature
verification, and payment or order retrieval. `timingSafeEqual` guarded so a
length-mismatched signature returns `false` rather than raising. Missing configuration
raises a typed configuration error that names the variable and no value. Externally
mockable at one seam.

Bind the order to what it is for. Persist `razorpayOrderId`, `planId`, `billingCycle` and
`amount` together in `PendingSignup`, and require the order to exist and belong to the
signup or subscription before verification mutates anything. This is the control that
closes analysis 5.1: the signature covers only `orderId|paymentId`, so everything else
must come from the stored order.

### 2.4 Add the billing service

One service owning plan lookup, signup validation, order creation, payment verification,
tenant and subscription provisioning, status, renewal, webhook processing, idempotency,
transaction boundaries and audit.

- **Idempotency by construction.** A compare-and-swap guard on `PendingSignup`
  (`updateMany` where `id` and `status = "order_created"`, asserting one row updated) makes
  concurrent `verify-payment` calls safe without a lock. A unique constraint on
  `razorpayPaymentId` plus an explicit pre-check turns a replay into a defined `409`.
  Record webhook event identity so a retry is distinguishable from a first delivery.
- **One transaction.** Tenant, subscription and payment in a single
  `session.begin()`. No partial state, and the money-received-but-no-tenant case from
  analysis 5.4 disappears because the webhook also provisions, not just the browser.
- **Provision from the webhook.** The browser's `verify-payment` becomes a confirmation,
  not the only path. If the customer closes the tab, the webhook still creates the tenant.
- **Audit every transition.** Tenant created, subscription activated, payment captured,
  payment failed, subscription renewed, subscription cancelled. Each record carries the
  tenant, the object, the transition and the actor, and no secret or signature.
- **Hash with `bcrypt` cost 12**, `$2b$`, and verify the existing `Tenant.passwordHash`
  with `bcrypt.checkpw`. No re-hashing pass.
- **Purge or redact** the retained `PendingSignup.passwordHash` per the analysis' open
  decision.

### 2.5 Add the API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/v1/billing/plans` | Public | Active plans only |
| `POST /api/v1/billing/signup/initiate` | Public, rate limited | Validate and start onboarding |
| `POST /api/v1/billing/signup/create-order` | Public, rate limited | Create and store the Razorpay order |
| `POST /api/v1/billing/signup/verify-payment` | Public, strictly validated | Verify and provision |
| `POST /api/v1/billing/subscriptions/status` | Authenticated | Current subscription |
| `POST /api/v1/billing/subscriptions/renew` | Authenticated | Start a renewal |
| `POST /api/v1/billing/subscriptions/verify-renewal` | Authenticated | Verify and apply |
| `POST /api/webhooks/razorpay` | Signature verified | Process events |

Public onboarding and signed webhooks are anonymous by design and must validate their
input. Subscription operations require a NextAuth-issued token. Add a role check to
status and renew; today any tenant member, including `viewer`, can call them, and they
expose `gracePeriodDays`, `cancelledAt` and recent payment records.

Every documented failure has a defined response: validation error `400`, unknown record
`404`, expired record `410`, duplicate `409`, bad signature `400`, tenant mismatch `403`,
configuration error `503`. `CORS` allows the supported frontend origins with credentials.
A webhook failure returns a non-2xx so Razorpay retries, backed by a dead-letter path, so
a failure is never both invisible and unrecoverable.

### 2.6 Add the frontend client

One module for billing calls, so route strings and error mapping are defined once. Fetch
public plans and signup data, drive Razorpay checkout in the browser, send verification to
FastAPI, and send authenticated subscription calls through the secured proxy. Convert
non-success responses to the application's error format without exposing internals.

### 2.7 Test, then delete

Against a running frontend and backend:

- A valid signup creates exactly one `PendingSignup`.
- An invalid signup is rejected before an order is created.
- Verification creates tenant, subscription and payment atomically.
- Replaying verification returns `409` and creates no second tenant.
- A concurrent double-submit creates one tenant.
- An invalid signature changes no records and returns `400`, not `500`.
- A valid signed webhook provisions; an invalid one changes nothing.
- An order paid for one plan cannot provision a different plan - the regression test for
  analysis 5.1.
- A paid customer can log in and sees the correct caps - the regression test for
  analysis 5.2.
- An authenticated user reads and renews their own subscription; one tenant cannot touch
  another's.

Then delete, together with the now-unused helpers, tests, docs and env examples:

```
app/api/signup/initiate/route.ts
app/api/signup/pricing/route.ts
app/api/signup/create-order/route.ts
app/api/signup/verify-payment/route.ts
app/api/subscriptions/status/route.ts
app/api/subscriptions/renew/route.ts
app/api/subscriptions/verify-renewal/route.ts
app/api/webhooks/razorpay/route.ts
```

Remove the `api/webhooks` matcher exclusion added in task 0.1 in the same change.

### Phase 2 exit criteria

- FastAPI owns the entire public signup and billing lifecycle.
- Every write is transactional, idempotent and audited, with a `409` on replay.
- The eight legacy routes are gone and return not found.
- The Razorpay webhook URL in the Razorpay dashboard points at FastAPI, and the proxy no
  longer sits in that path.
- Frontend and backend suites pass together.

### Phase 2: frontend wiring, then confirmation

This is the phase where the two repositories stop being separable, so the wiring is the
deliverable, not a check on it.

**Backend changes** — `pharma_glimmora_ai_backend`: the SQLAlchemy mirror, the Razorpay
integration, the billing service, the eight new endpoints under `/api/v1/billing/` and
`/api/webhooks/razorpay`.

**Frontend changes** — `Glimmora-Pharma`: one billing client module, the signup wizard
repointed from `/api/signup/*` to `/api/v1/billing/*`, the subscription settings tab
repointed, and the deletion of the eight legacy routes together with the `api/webhooks`
matcher exclusion added in task 0.1.

**The wiring, verified end to end against running code — the only phase where a real
payment is required:**

1. The public plan list loads in the browser from FastAPI, with CORS allowing the supported
   origin. A prospect sees real prices on an unauthenticated page.
2. A prospect completes the signup wizard. One `PendingSignup` exists, and no Razorpay order
   is created for an invalid signup.
3. The Razorpay checkout opens. The order is created by FastAPI, and `razorpayOrderId`,
   `planId`, `billingCycle` and `amount` are all persisted together.
4. Payment completes. Tenant, subscription and payment are created atomically, and the
   browser's `verify-payment` is a confirmation rather than the only path.
5. **The webhook also provisions.** Send the capture twice — a duplicate delivery — and
   exactly one tenant exists. Then close the tab at step 3, capture the payment out of band,
   and confirm the tenant is still created, because the webhook does not depend on a browser.
6. The new customer signs in through NextAuth, sees the caps they bought, and lands in the
   app. This is the test that analysis 5.2 said could not pass.
7. Replay `verify-payment` and get a `409`, not a `500` and not a second tenant. Fire two
   concurrent submissions and get one tenant.
8. **The regression test for 5.1:** pay for the cheapest monthly plan, then replay the
   verification with the priciest `planId`. The signature verifies — it covers only
   `orderId|paymentId` — and the server must refuse, because the plan is bound to the stored
   order rather than to the request body.
9. An invalid signature returns `400` and changes no records. A length-mismatched signature
   returns `400`, not `500` (analysis 5.5).
10. `curl -i localhost:3000/api/signup/pricing` and the other seven legacy paths now return
    404. The `api/webhooks` exclusion is gone, so `POST localhost:3000/api/webhooks/razorpay`
    is 404 too — Razorpay points at FastAPI directly.
11. `npm run test:backend` and `npm run test:unit` pass in the same run, in both repositories.

**Then stop and report.** The headline: *a prospect can now pay and get a working account,
and the whole of signup and billing lives in one service.* State the payment-test evidence
for items 5, 7 and 8 explicitly, because those are the findings that made this phase
worth doing. State that the eight Next.js routes are gone and where the webhook URL now
points. **Wait for confirmation before starting Phase 3.**


## 8. Phase 3: Backend structural consistency

Do this after Phase 2 so the new billing code is written against the target conventions,
not migrated twice.

1. **Decide the services rule and write it down.** The real rule today is "`app/services/`"
   is shared by two or more routers, flat is single-consumer. Either adopt that and record
   it, or move the flat modules and accept that `assistant_pipeline` becomes a package
   member importing its own package. Do not leave it implied.
2. **Move services** to the chosen convention. Update imports. No behaviour change.
3. **Move the 48 inline Pydantic models** to `app/schemas/`, grouped by domain. Leave
   `_GroundedAnswer`, `_Bullets` and the model-output contracts with their prompts.
4. **Normalise the fallbacks import** - eleven routers use the package root,
   `rework_tasks_router.py:34` does not.
5. **Adopt Alembic**, now that the backend owns a mirror worth versioning. Baseline the
   current schema, then convert the remaining startup DDL into a reviewed migration. The
   backend never becomes the schema authority; it gains a reviewable history.
6. **Add `app/core/`** re-exports and ensure every package has an `__init__.py`.
   `app/security/` and `app/middleware/` currently have none.
7. **Add a backend README and `.env.example`** with names and safe defaults only.
8. **Pin dependencies** exactly, and move test dependencies to `requirements-dev.txt`.
9. **Split large routers.** `auth_router.py` is 527 lines and mixes routing, crypto and
   RBAC; `intelligent_assistant_service.py` is 524.

### Acceptance criteria

- One services convention, documented.
- No request or response model declared inside a router.
- `grep -rn "os.getenv" app/` matches only `app/core/config.py`.
- `grep -rn "OpenAI(" app/` matches only the factory.
- Every table declared in `app/models/`.
- Alembic can create the schema from an empty database and upgrade an existing one.
- A new developer can configure and start the backend from the README alone.

### Phase 3: frontend wiring, then confirmation

**Backend changes only** — `pharma_glimmora_ai_backend`: services moved to the chosen
convention, 48 Pydantic models relocated to `app/schemas/`, `AIAuditTrail` already relocated
in Phase 0, Alembic adopted, `auth_router.py` split, `__init__.py` files added. No
behaviour change is intended by any of it.

That last sentence is the whole risk of this phase, and it is a wiring risk, not a code
risk. A file move that breaks one import produces a 500 in an advisory endpoint, and no
backend unit test will tell you — the caller is the frontend, through the proxy.

**The wiring, verified against running code:**

1. **Diff the route table against the Phase 2 baseline and require it to be identical.** A
   moved service that silently drops a decorator is invisible to every other check. This is
   the single most valuable assertion in this phase:

   ```bash
   # before, in pharma_glimmora_ai_backend
   python -c "import app.main, json; print('\n'.join(sorted(
       f'{sorted(r.methods)[0]} {r.path}' for r in app.main.app.routes
       if hasattr(r,'methods'))))" > routes-before.txt
   # ... after the restructure ...
   python -c "import app.main; print('\n'.join(sorted(
       f'{sorted(r.methods)[0]} {r.path}' for r in app.main.app.routes
       if hasattr(r,'methods'))))" > routes-after.txt
   diff routes-before.txt routes-after.txt    # must be empty
   ```

2. `npm run test:backend` is green, and the three pre-existing modules are at or above their
   recorded baseline from Phase 0.
3. From a signed-in browser session, exercise one route from each billing shape: a text
   advisory call, a document upload, `voice/transcribe`, and `voice/speak`. All four are the
   routes most likely to have lost an import, and the last two are the ones the old limiter
   never covered, so a silent regression there has no other guard.
4. `curl localhost:8000/health` still reports all three readiness booleans, and now includes
   the Alembic revision level.
5. `npx tsc --noEmit` and `npm run build` in the frontend are unchanged and green.

**Then stop and report.** The headline should be that nothing a user can observe changed,
and that is the point. State the route-table diff as empty. State which convention was
adopted for services and why. State that `app/services/assistant_pipeline.py:46` — the
service importing `CurrentUser` from a router — is now fixed, since that inversion was
recorded but not scheduled until this phase. **Wait for confirmation before starting
Phase 4.**


## 9. Phase 4: Frontend cleanup

1. **Remove React Query.** Confirmed unused: the only reference is
   `src/components/Providers.tsx:6,56,60` and there are no `useQuery`, `useMutation` or
   `useQueryClient` consumers. Remove the provider and the dependency, keep Redux Toolkit
   and the server-first flow.
2. **Decide `CAPADetailPageV2`.** The previous analysis was wrong: `CAPADetailPage.tsx`
   owns the live route, and `CAPADetailPageV2.tsx:4-22` is a pending redesign that reuses
   it. Either adopt V2 and delete the original, or delete V2. Do not leave both. Record
   the decision in the file that survives.
3. **Consolidate Zod schemas** into `src/schemas/`, one file per domain, imported by both
   the client form and the server action.
4. **Remove generated and archived artifacts** from tracking and extend `.gitignore` to
   cover each recurring class.
5. **Fix the silent 500s**: `verify-renewal` should check `plan.isActive`; the guarded
   `timingSafeEqual` from analysis 5.5 moves to the shared helper;
   `pricing`'s unguarded `JSON.parse(plan.features)` should degrade to an empty feature
   list rather than failing the request.
6. **Correct the documentation.** `HANDOVER.md`, `PROJECT_AUDIT*.md`,
   `PROJECT_DETAILS.md`, `PROJECT_DOCS.md` and `PROJECT_OVERVIEW.md` describe a vendored
   `backend/` folder that no longer exists, an old route count, and `psycopg2` and
   `pinecone` in a dependency list that no longer matches `requirements.txt`. Add a root
   README covering setup, test, architecture and the sibling repository. Mark superseded
   documents archived.
7. **Move the Python document generators** out of the documentation tree into `scripts/`.

### Acceptance criteria

- One client-state pattern, documented.
- One CAPA detail component.
- `typecheck`, `lint`, `test:unit` and `build` all pass.
- No primary document describes a `backend/` folder inside the frontend repository.
- A new developer finds correct setup, environment and test instructions from the README.

### Phase 4: frontend wiring, then confirmation

**Frontend changes only** — `Glimmora-Pharma`: React Query removed, the `CAPADetailPageV2`
decision recorded, Zod schemas consolidated into `src/schemas/`, artifacts untracked, the
silent-500 fixes from analysis 5.5, and the documentation corrected to describe a sibling
repository rather than a vendored `backend/` folder.

`pharma_glimmora_ai_backend` is untouched. Item 7 below moves the Python document
generators out of the documentation tree, which is the one change that reaches across — and
it is a `docs/manual/` to `scripts/` move, not a code change, so confirm which repository
owns them before touching either.

**The wiring, verified against running code:**

1. Remove the `QueryClientProvider` from `Providers.tsx` and confirm the app renders. A dead
   provider whose removal takes a live component with it is the failure mode; the audit found
   zero `useQuery` / `useMutation` / `useQueryClient` consumers, so nothing should change.
2. `grep -rn "tanstack" src/ app/` returns nothing, and `@tanstack/react-query` is gone from
   `package.json`.
3. The CAPA detail route renders for a real record, through whichever component survived the
   decision. If V2 was adopted, the old component is gone; if V2 was deleted, its pending
   redesign is recorded as a decision rather than left as a stray file.
4. A signup submission and a subscription renewal still complete, end to end, through the
   Phase 2 FastAPI endpoints. Consolidating the Zod schemas touched the boundary validation
   on exactly those two flows, and a schema that moved and changed shape rejects valid input.
5. `pricing` no longer 500s on a plan with malformed `features` JSON — it returns the plans
   with an empty feature list.
6. `verify-renewal` checks `plan.isActive`, and a length-mismatched signature returns `400`
   rather than `500`.
7. `npm run test:backend` still passes, because the frontend's call shapes are unchanged.
8. `npx playwright test` green on signup, payment and subscription specs.
9. Read the corrected documents as a new developer would: no primary document claims a
   `backend/` folder exists inside the frontend repository.

**Then stop and report.** The headline: nothing a user can observe changed, deliberately —
this phase removes dead weight and corrects documentation. State which CAPA component won and
why, and state that the analysis was wrong about `SubscriptionTab` being `super_admin`-only
(it is gated on `SETTINGS_MANAGE_ROLES`, which includes `customer_admin`). **Wait for
confirmation before starting Phase 5.**


## 10. Phase 5: Deployment, CI and quality gates

This phase is what makes the result hold rather than drift.

### 10.1 One supported topology

DigitalOcean App Platform, as `.do/app.yaml` already describes: a `migrate` pre-deploy job,
an `api` service built from the backend repository on its own branch, and a `web` service
on the frontend repository. `vercel.json` is removed or reduced to the framework hint.
`render.yaml` is deleted.

Document: build and start commands, the full environment variable list with which are
secrets, health checks, the `preserve_path_prefix` requirement, the webhook URL, and the
PostgreSQL connection. Add the `psycopg2` driver to the documented image.

Retain the incident comments in `.do/app.yaml`. They are the most useful part of the file.

### 10.2 CI for both repositories

Every pull request runs, and a red pipeline blocks merge:

**Frontend** - `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`,
`npm run build`. Playwright against a preview build on the branches that change
user-facing flows.

**Backend** - install `requirements.txt` and `requirements-dev.txt`, `import app.main` with
`OPENAI_API_KEY` **unset** (this is the regression test for analysis 4.3), run the test
suite, and start the app against a PostgreSQL service container to verify the driver and
the model mirror.

**Both** - a secret scan, and a check that `git ls-files` contains no `.env`, database,
backup, cache or venv path.

### 10.3 Guardrails that prevent the recurrence

- A test that fails if an `OpenAI(` or `jwt.encode(` appears outside its factory.
- A test that fails if `os.getenv` appears outside `app/core/config.py`.
- A test that fails if `__tablename__` does not exist in `schema.prisma`.
- A route-signature test covering `alg: none`, wrong secret, expiry, missing tenant, and a
  wrong-tenant token.
- A dependency audit on both lockfiles.

### Acceptance criteria

- One documented deployment path, reproducible from the manifests.
- A failing check blocks a merge.
- The guardrail tests fail when deliberately violated.

### Phase 5: frontend wiring, then confirmation

**Both repositories.** `Glimmora-Pharma` owns `.do/app.yaml`, so it owns the topology and the
CI for the `web` service. `pharma_glimmora_ai_backend` owns the CI for the `api` service and
its own dependency manifests. The two CI workflows are separate files in separate
repositories and neither vendors the other.

The wiring for this phase is that the manifests and the code agree, in both directions:

1. **Every environment variable the backend reads is declared in `.do/app.yaml`**, and every
   variable the app declares is read by the code. `app/core/config.py` is the list; the
   manifest is the deployment of it. A variable in one and not the other is a defect, and it
   is exactly how the `ENV` incident at `.do/app.yaml:82-88` happened.
2. `APP_ENV=production` is set on the `api` service, replacing the `ENV` variable whose
   absence made the backend believe it was in development. The manifest comment recording
   that incident is **retained** — it is the most useful part of the file.
3. `BACKEND_URL` is `${api.PRIVATE_URL}`, and the task 0.1b rule means a missing value is a
   503 rather than a silent fallback to localhost.
4. `psycopg2-binary` is in the built image. Build the `api` service from
   `requirements.txt` alone, on a clean runner, and it starts. That is the acceptance
   criterion for analysis 4.2 and it is finally testable.
5. The `migrate` job runs `prisma migrate deploy`, never `db push`, and the warning comment
   at `.do/app.yaml:14-18` is intact.
6. **A green CI proves the guardrails bite.** Deliberately introduce each violation in a
   throwaway branch and confirm the corresponding test fails: an `OpenAI(` or `jwt.encode(`
   outside its factory; an `os.getenv` outside `app/core/config.py`; a `__tablename__` that
   is not in `schema.prisma`; a `.env` or database file added to the index. A guardrail that
   has never been observed failing is not a guardrail.
7. The backend CI runs `import app.main` with `OPENAI_API_KEY` **unset**, and starts the app
   against a PostgreSQL service container. That is the regression test for analysis 4.3.
8. Deploy to DigitalOcean and walk the cross-service block in analysis §12 by hand, on the
   real deployment, once. Automated checks do not prove the topology.

**Then stop and report.** The headline: the stack is now reproducible from its manifests,
and a regression cannot merge. State which guardrail was observed failing and how, because
item 6 is the only evidence that any of it works. State the deploy performed, or state
plainly that it was not and that the topology remains unverified on the real target. **Wait
for confirmation before starting Phase 6.**


## 11. Phase 6: Verification and documentation

**Backend** - starts via `app.main:app`; `/health` reports configuration, database and key
readiness without exposing values; `/docs` shows auth, audit, AI, advisory and billing;
imports contain no legacy paths; the mirror matches `schema.prisma`; Alembic upgrades from
the baseline; the test suite passes.

**Frontend** - `typecheck`, `lint`, `test:unit` and `build` pass; no reference to the
removed routes; the signup wizard, payment verification and subscription flows pass in
browser tests; no React Query wiring.

**Cross-service** - the frontend reaches authenticated FastAPI routes through the secured
proxy; public billing endpoints work from the supported origins; Razorpay delivery reaches
the FastAPI endpoint and nothing else; invalid and replayed requests create no duplicate or
partial records; a customer can pay, log in, and see the caps they bought.

**Repository** - only intended files changed; no `.env`, database, backup, cache,
screenshot or secret tracked; both READMEs current; the analysis records which findings are
resolved and which remain open.

### Phase 6: final wiring, then sign-off

Phase 6 is verification and documentation, so its wiring block is the whole cross-service
claim, run against a clean checkout of both repositories rather than against a working tree
with history in it.

1. `git clone` both repositories to fresh directories. `pip install -r requirements.txt` in
   the backend and `npm ci` in the frontend. Nothing is carried over from this machine, and
   a step that only works because of a local venv or an untracked `.env` fails here.
2. Both applications start from their committed manifests and nothing else.
3. The full cross-service block in analysis §12 passes: `/health` on the backend; the AI
   proxy reaching it; a signed-in advisory call round-tripping; an unauthenticated one
   rejected.
4. A prospect pays, gets a working account, signs in, and sees the caps they bought. The
   whole programme, end to end, on a clean checkout.
5. A duplicate webhook delivery and a replayed verification produce no second tenant and no
   `500`.
6. Both test suites pass in both repositories, from the clean checkout.
7. `git ls-files` in both repositories contains no `.env`, database, backup, cache,
   screenshot or secret path.
8. A new developer, given only the two READMEs, can configure, run, test and deploy both
   services. Then have a second person actually try it, because step 8 written down is a
   claim and step 8 performed is a fact.
9. The analysis is updated to record, finding by finding, what is resolved and what remains
   open with a named owner. A finding closed silently is indistinguishable from a finding
   forgotten.

**Then sign off.** This is the last gate. Report the whole programme in the client's terms,
name every finding that remains open and who owns it, and record the decisions that were
taken along the way — notably the two that were not obvious: the orphan CAPA tables were
kept rather than dropped, and the development signing key became ephemeral rather than a
second committed constant.


## 12. Open decisions

Carried from the analysis, to be answered during the phase that needs them.

1. Do any reporting or export paths read `Plan` directly? Blocks Phase 1.
2. Does `PlanRoleLimit` carry live data that must move to `Subscription`? Blocks Phase 1.
3. Should trial state move wholesale to the commerce model, or stay where it is?
4. `Payment.tenantId` - composite foreign key, or a service-level assertion? A schema
   change either way.
5. Are completed `PendingSignup` rows purged, given the password hash they retain?
6. Is Alembic adopted in Phase 3, or deferred to a follow-up?
7. External archival, or deletion, for the generated documents and screenshot bundles?

## 13. Definition of done

- Both applications start through their documented commands, from a clean checkout, using
  only committed dependency manifests.
- No P0 or P1 finding from the analysis remains open, or has a recorded, accepted
  exception with a named owner.
- Public signup, billing, renewal and webhook behaviour is owned by FastAPI, and the
  Next.js implementation no longer exists.
- Payment and provisioning are validated, idempotent, transactional and audited, and a
  replay is a defined `409`.
- A paying customer can log in and receives exactly the entitlement they paid for.
- Tokens cannot be forged on any host, and no endpoint mints one for an unvalidated tenant.
- Every billable endpoint is rate limited with bounded memory.
- Backend services, schemas, models and configuration follow one documented structure,
  enforced by the tests in 10.3.
- Deployment is reproducible from the manifests, and CI blocks a regression.
- Setup, environment, architecture and deployment documentation is current in both
  repositories.
