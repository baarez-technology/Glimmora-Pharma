# Glimmora Pharma Refactoring Plan

- **Date:** 25 September 2026
- **Revision:** 28 September 2026 - re-sequenced around verified blockers
- **Related analysis:** `docs/superpowers/plans/2026-09-25-refactor-analysis.md`
- **Audience:** Developers implementing or reviewing the refactoring
- **Target state:** secure, deployable, conventionally structured, and correct on money

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

## 2. Decisions this plan implements

These were settled before sequencing and are not reopened in review.

| # | Decision | Consequence |
|---|---|---|
| 1 | **Converge on `Subscription`; retire `Plan`** | Add `maxUsers`, `maxSites`, `minRetentionYears` to `Subscription`. Repoint the login gate and `useTenantConfig` at `tenant.subscription`. Migrate live `Plan` rows. `SubscriptionPlan` remains the price catalogue. |
| 2 | **Build the billing service correctly in FastAPI; delete the eight Next.js routes in the same phase** | The old routes are already unreachable behind `proxy.ts`, so there is no working behaviour to preserve. The routes are read as a behavioural specification, not as code to port. |
| 3 | **NextAuth is the sole identity issuer; FastAPI verifies only** | Delete FastAPI's `/auth/signup` and `/auth/login` and the ghost `users` table. Remove the `User` / `users` collision and the arbitrary-`customer_id` token hole in one move. |

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

- **Files:** `proxy.ts`
- **Acceptance:** `POST /api/webhooks/razorpay` with a valid signature is no longer 401
  from the edge. `GET /api/signup/pricing` still 401s, and that is intended and recorded.

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

Also delete the orphan CAPA cluster (`capas`, `rcas`, `action_plans`, `monitoring`,
`effectiveness_checks`, `capa_closures`). It has no reader and no writer, and
`create_all` recreates it on every boot, keeping the `prisma db push` hazard live in both
directions. Take a database backup first, and before deleting, confirm with whoever owns
compliance reporting that no export, audit-history query or regulatory report reads these
tables. `app/main.py:28-47` asserts they are retained for inspection, so that assertion
needs an owner's confirmation, not a code comment.

- **Files:** `app/routers/auth_router.py`, `app/models/capa_model.py`, `app/main.py`
- **Acceptance:** no FastAPI route can mint a token. `SELECT * FROM users` fails because the
  table no longer exists. Every FastAPI route that needs a caller requires a token that
  NextAuth issued. Existing AI tests pass.

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
count and a sweep, and document the limitation at the definition site.

Rate limit `POST /api/v1/auth/login` and the public billing routes. Stop `FAILED_LOGINS`
self-populating on unauthenticated input - use `get` semantics, not `defaultdict` indexing
- and add an IP dimension to the lockout key so an account cannot be locked by a third
party. Return a uniform 401 for unknown user and wrong password, and a uniform response
for locked and unlocked so the lockout is not an enumeration oracle.

Add rate limiting to the Next.js public routes. `app/api/signup/initiate/route.ts` is
unauthenticated and hashes at bcrypt cost 12 on every call; it needs a limit before it is
migrated.

- **Files:** `app/middleware/rate_limiter.py`, `app/routers/auth_router.py`,
  `app/main.py`, `app/api/signup/initiate/route.ts`
- **Acceptance:** every billable AI route returns 429 when exceeded. Login returns 401 for
  both unknown-user and wrong-password. A locked account and an unlocked one are
  indistinguishable from outside. A login flood with random usernames does not grow memory
  without bound.

### 0.8 Repository hygiene

- Untrack `venv/`, `__pycache__/`, `glimmora.db`, `*.pyc`.
- Delete `fix_py38.py`. It rewrites sources in place on import and would now mangle the
  current codebase (analysis 6.4).
- Delete `app/schemas/capa_schema.py` - 255 lines, eighteen models, zero importers.
- Delete `tests/test_audit_trail.cpython-313.pyc`.
- Remove `docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak`, `docs/manual/screenshots/` and
  `docs/test-screenshots/` from tracking. Review before deleting - see section 12,
  item 7.
- Delete `render.yaml` (analysis 5.7). Archive the SQLite-on-disk topology as
  `docs/archive/` prose if the option is worth keeping on record.
- Add `typecheck` to `package.json` and confirm `tsconfig.json` has `strict: true`.
- Add a `scripts/backend-tests` entry point so the runner is documented rather than
  assumed. `pytest` is not currently in `requirements.txt`; either add it to a
  `requirements-dev.txt` or record the actual runner.
- Confirm `.python-version`, `runtime.txt` and the local interpreter agree. `.python-version`
  and `runtime.txt` say 3.12.7; the committed venv is 3.13.13.

- **Acceptance:** `git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'` returns
  nothing. `npm run typecheck` passes.

### Phase 0 exit criteria

- The backend starts with no `OPENAI_API_KEY` and against a PostgreSQL database, from
  `requirements.txt` alone.
- A token cannot be forged on any host, and no FastAPI route can mint one.
- Every billable endpoint is rate limited; login is not a memory-growth or lockout vector.
- The audit trail is visible to the tenants it belongs to.
- `render.yaml` and the destructive DDL paths are gone.
- No build artifact, database, or secret is tracked.
- Both applications run, and both test suites are at or above the recorded baseline.

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
