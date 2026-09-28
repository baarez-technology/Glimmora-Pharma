# Glimmora Pharma Refactoring Analysis (Verified)

- **Date:** 25 September 2026
- **Revision:** 29 September 2026 - re-verified against source by static audit; repository
  ownership, the phase integration contract, and seven corrected claims added
- **Related plan:** `docs/refactor-pharma-stack.md` (same directory)
- **Audience:** Developers taking part in the refactoring work
- **Method:** Read-only static audit of both working trees. Every finding below cites
  `file:line`. No claim in this document is carried over from the previous pass without
  re-verification; section 9 lists the claims that changed.

## 0. Repository ownership

Two sibling repositories, one direction of dependency. This is fixed and is not reopened in
review.

| Concern | Repository | Local path | Deployed as |
|---|---|---|---|
| Frontend, interface, identity, session, Server Actions, Prisma schema, billing UI | `Glimmora-Pharma` | `.\Glimmora-Pharma` | DigitalOcean `web` service, and the `migrate` job |
| AI service, advisory endpoints, audit trail, billing service | `pharma_glimmora_ai_backend` | `.\pharma_glimmora_ai_backend` | DigitalOcean `api` service |
| Deployment topology for both | `Glimmora-Pharma` | `.do/app.yaml` | DigitalOcean App Platform |

Rules that follow from that separation, and that every finding and every phase must respect:

1. **A concern lives in exactly one repository.** Backend logic goes in
   `pharma_glimmora_ai_backend`. Frontend code goes in `Glimmora-Pharma`. A change that
   spans both is two changes, in two commits, reviewed together - not one change that
   half-lives in each.
2. **The backend is never vendored into the frontend.** There is no `backend/` folder
   inside `Glimmora-Pharma`, and one must not be created. `.do/app.yaml:31-35` records
   what happened last time: a `source_dir: /backend` snapshot drifted months behind
   `ai_develop` and carried 12 of 24 routers, so every newer AI endpoint 404'd in
   production while working locally. Several documents in the frontend repository still
   describe a vendored `backend/` folder; see section 9.
3. **Backend changes modify existing files in place.** New modules are created only where
   the plan calls for a new responsibility - `app/core/`, `app/models/audit_model.py`,
   `app/middleware/`. Files are not renamed, split, or relocated for tidiness, and no
   service is moved between the flat and `app/services/` conventions before the phase that
   decides which convention is correct. Restructuring is sequenced, never incidental.
4. **Frontend integration uses the existing structures.** The AI backend-for-frontend at
   `app/api/ai-proxy/[...path]/route.ts`, the NextAuth session, and the Server Actions in
   `src/actions/` are the integration seams. A new frontend integration does not introduce
   a new client library, a new state pattern, or a new proxy. Analysis 7.1 is the strongest
   engineering in the codebase and is the template.
5. **The dependency direction is one-way.** Next.js calls FastAPI. FastAPI never calls
   Next.js. `.do/app.yaml:140-142` points `BACKEND_URL` at `${api.PRIVATE_URL}` so browser
   and Next.js server reach the AI service over the private network and never over the
   public internet.
6. **Every phase ends by wiring the two together, and is confirmed before the next
   begins.** A phase that leaves the frontend unable to talk to the backend is not
   finished, regardless of how green its own tests are. See section 10, invariants 11 and
   12.


## 1. Purpose

This document states the verified condition of the Glimmora Pharma stack and identifies
what must change before, and during, the migration of public signup and billing into
FastAPI.

The previous pass concluded that the stack was broadly sound and that the work was a
boundary cleanup. That conclusion was wrong. Re-verification found that the public
payment flow does not currently execute at all, that the deployed backend cannot connect
to the production database from the committed dependency set, and that three separate
authorization defects exist. The architecture is fine; the delivered state is not.

This document replaces the previous analysis. It is the findings record, not the work
plan - sequencing, acceptance criteria and standards live in the companion plan.

## 2. Executive summary

The technology choices remain sound and should not change:

- Next.js 16 (App Router, `proxy` edge convention), React 19, Prisma 6, NextAuth 4,
  Redux Toolkit, Server Actions, Zod 4.
- FastAPI 0.115, SQLAlchemy 2, Pydantic 2, PyJWT, `bcrypt` 4.2, OpenAI SDK 1.30.
- Two repositories, clean dependency direction, DigitalOcean App Platform as the
  documented deployment target.
- The AI boundary is the strongest engineering in the codebase and should be the
  template for everything else. See section 7.1.

What is wrong is the delivered state:

1. **The payment flow is dead.** The edge gate in `proxy.ts` returns 401 to anonymous
   requests for all four public signup routes and for the Razorpay webhook. Signature
   verification in the webhook is unreachable.
2. **The backend cannot start against production.** `requirements.txt` contains no
   PostgreSQL driver, so the `postgresql://` `DATABASE_URL` that `.do/app.yaml` declares
   as a secret cannot be opened.
3. **The backend cannot start without an OpenAI key.** Twenty-four module-scope client
   constructions raise before `/health` exists.
4. **Three authorization defects permit privilege escalation**, two of them by
   construction and one by a source-visible secret.
5. **The subscription domain is modelled twice** and the two halves are never joined, so
   a customer who pays receives a locked-out account.

The recommended target boundary - public signup, billing and webhooks owned by FastAPI;
Next.js retaining the interface, the session and the AI backend-for-frontend - is correct
and is unchanged from the previous pass. The plan that implements it is re-sequenced to
put remediation first.

## 3. Severity model

| Level | Meaning | Gate |
|---|---|---|
| **P0** | The application cannot perform a core function, or cannot start in its documented configuration | Must be fixed before any other work |
| **P1** | Exploitable, or a correctness defect that can lose money, data or entitlement | Fixed before the affected flow is migrated |
| **P2** | Maintains a defect class, blocks review, or misleads developers | Fixed in sequence, before the area is extended |
| **P3** | Hygiene, drift, documentation accuracy | Fixed in sequence |

## 4. P0 findings - release blockers

### 4.1 The edge gate 401s every public billing route and every webhook

`proxy.ts` is the Next.js 16 edge gate. Its matcher excludes only `login`, `api/auth`,
`/_next/*` and static assets:

```ts
// proxy.ts:101-104
export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|txt|xml)$).*)",
  ],
};
```

`api/signup`, `api/subscriptions` and `api/webhooks` are not excluded, so they are
matched, and the anonymous branch is:

```ts
// proxy.ts:55-61
const token = await getToken({ req, secret });
if (!token) {
  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

Consequences:

- `GET /api/signup/pricing`, `POST /api/signup/initiate`, `POST /api/signup/create-order`
  and `POST /api/signup/verify-payment` all answer 401 to an unauthenticated prospect.
- `POST /api/webhooks/razorpay` answers 401 to every Razorpay callback. Razorpay sends no
  NextAuth cookie, so the HMAC check at `app/api/webhooks/razorpay/route.ts:80` is
  unreachable in production. Payments are being captured with no state transition.
- `/api/subscriptions/*` requires a session by design, so its 401 is correct.

Each of the four affected route files carries a header comment asserting it is public
(`app/api/signup/initiate/route.ts:6`, `create-order/route.ts:5`). The code and the edge
gate disagree.

### 4.2 The backend cannot open the production database

`app/database/db.py:16-21` passes `DATABASE_URL` straight to `create_engine`:

```python
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./glimmora.db")
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
```

`requirements.txt` declares twelve packages and none of them is a PostgreSQL driver:

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.36
openai==1.30.0
httpx==0.27.2
pydantic==2.8.2
python-dotenv==1.0.1
pypdf==4.0.0
python-docx==1.1.0
PyJWT==2.8.0
python-multipart==0.0.9
bcrypt==4.2.0
```

`prisma/schema.prisma:5` sets `provider = "postgresql"`, and `.do/app.yaml:70-71` declares
`DATABASE_URL` as a `SECRET` for the `api` service, built with `pip install -r
requirements.txt`. With a `postgresql://` URL, `create_engine` raises `ModuleNotFoundError`
at import of `app.database.db`, which is reached from `app/main.py:23`, before any route is
registered.

The deployed image is therefore not reproducible from the committed manifest. Either the
running image was patched by hand outside the repository, or the `api` service cannot
start. This must be resolved from source, not from the running environment.

### 4.3 The backend cannot start without `OPENAI_API_KEY`

Twenty-four `OpenAI(...)` constructions exist, every one at module scope, none with a
fallback value, none inside a function. Representative sites:

- `app/ai_service.py:33`, `app/help_service.py:34`, `app/search_service.py:32`
- `app/rag/rag_service.py:45`, `app/security/hallucination_prevention.py:13`
- `app/routers/voice_router.py:41`, and eighteen routers in the range
  `ai_router.py` to `rework_tasks_router.py`

The SDK raises when the key resolves to `None`
(`openai/_client.py:101-105`). Because `app/main.py:27-65` imports those modules eagerly,
`import app.main` raises `OpenAIError` before `app = FastAPI(...)` at `app/main.py:72`
executes. There is no `/health`, so the DigitalOcean probe reports the component down
rather than a degraded-but-live service.

`app/regulatory_assistant_service.py:393-395` already defends against this with a lazy
import and a comment explaining why, but the defence is defeated by the module-scope
construction in `app/ai_service.py:33`.

Model names are hardcoded string literals, not configuration. `gpt-3.5-turbo` is still in
the intent-classifier hot path at `app/intelligent_assistant_service.py:83`, inline, with
no constant.

### 4.4 The FastAPI auth surface authenticates against an empty table

`app/routers/auth_router.py:20` imports `User` from `app/models/capa_model.py`, which maps
to the table `users` (`app/models/capa_model.py:7`). `auth_router.py:472-477` and `:508`
query it for every login.

Prisma owns a different table, `User` (`prisma/schema.prisma:359`), and holds the real
`username` / `passwordHash` for both `Tenant` and `User`. The two tables share a database
and collide by case only. Reading the checked-in `glimmora.db` confirms the collision is
real rather than theoretical: it holds `User` and `users`, `CAPA` and `capas`, `Tenant`
with no FastAPI counterpart, and `AuditLog` alongside `ai_audit_trail` - and `users` has
zero rows.

The `users` and `User` schemas share three column names. Everything else differs
(`user_id`/`id`, `hashed_password`/`passwordHash`, `customer_id`/`tenantId`).

The FastAPI `/auth/login` endpoint cannot authenticate a real user, and
`/api/v1/auth/signup` inserts a row into a table nothing reads while minting a JWT whose
`customer_id` is the caller-supplied, unvalidated `req.customer_id`
(`auth_router.py:109`). That claim is the only thing scoping every downstream query
(`_payload` to `resolve_tenant` to the `AIAuditTrail.customer_id` filter), so a successful
signup yields a token scoped to an arbitrary tenant string.

The orphan CAPA cluster is part of the same problem. `capas`, `rcas`, `action_plans`,
`monitoring`, `effectiveness_checks` and `capa_closures` have no reader and no writer - the
only `db.add` / `db.commit` calls in the tree are `audit_router.py:114-115` and
`auth_router.py:487-488` - yet `app/main.py:28-47` states they are retained
intentionally, and `create_all` recreates them on every boot. `.do/app.yaml:14-16` warns
that `prisma db push` would drop the SQLAlchemy tables; those tables keep being
(re)created, so the hazard is live in both directions.

## 5. P1 findings - security and correctness

### 5.1 Renewal accepts a client-supplied plan that the signature does not cover

The Razorpay checkout signature covers only `orderId|paymentId`:

```ts
// src/lib/razorpay.ts:130-142
const body = `${razorpayOrderId}|${razorpayPaymentId}`;
const expectedSignature = crypto
  .createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
  .update(body)
  .digest("hex");
return crypto.timingSafeEqual(
  Buffer.from(expectedSignature),
  Buffer.from(razorpaySignature),
);
```

`planId` and `billingCycle` are required request-body fields in
`app/api/subscriptions/verify-renewal/route.ts:14-21`, and both are used to mutate the
subscription:

```ts
// app/api/subscriptions/verify-renewal/route.ts:128-138
const updatedSubscription = await tx.subscription.update({
  where: { id: subscriptionId },
  data: { planId, maxAccounts: plan.maxAccounts, ... currentYear: subscription.currentYear + 1 },
});
```

`app/api/subscriptions/renew/route.ts:80-93` creates the Razorpay order but persists the
order id nowhere in the database - only into Razorpay `notes` and a `receipt` string. The
server therefore holds no record binding `razorpayOrderId` to `planId`, `billingCycle` or
amount.

Attack: pay the cheapest plan's order once, then replay
`(orderId, paymentId, signature)` with `planId` set to the most expensive tier and
`billingCycle: "yearly"`. The signature still verifies because it does not mention
`planId`, and the subscription is upgraded for one monthly payment.

`verify-renewal` also does not check `plan.isActive`, unlike
`app/api/subscriptions/renew/route.ts:57`.

### 5.2 A paying customer receives a locked-out account

`app/api/signup/verify-payment/route.ts:99-162` creates `Tenant`, `Subscription`, `Payment`
and marks the pending signup complete, all inside one `prisma.$transaction`. The
transaction is correct. The problem is what it does not create, and what it writes.

**It never creates a `Plan` row.** Prisma models subscription twice:

| Model | `schema.prisma` | Role |
|---|---|---|
| `SubscriptionPlan` | `:215-244` | Price catalogue: `priceMonthly`, `priceYearly`, `maxAccounts`, `maxSites`, `trialDays` |
| `Subscription` | `:180-213` | The Razorpay record: `tenantId @unique`, `planId`, `maxAccounts`, trial fields, `gracePeriodDays`, `payments` |
| `Plan` | `:124-146` | The enforcement record: `tenantId @unique`, `tier`, `maxUsers`, `maxSites`, `minRetentionYears`, `durationMonths`, `expiryDate` |

Nothing bridges them. The runtime reads `Plan`, not `Subscription`:

```ts
// app/api/auth/[...nextauth]/route.ts:411-416
const plan = user.tenant?.plan;
const hasActiveSub =
  !!plan &&
  new Date(plan.expiryDate) > new Date();
if (!hasActiveSub) { ... }
```

and `src/hooks/useTenantConfig.ts:42,59-60` derives `maxUsers` and `maxSites` from the
same `tenant.plan`. A tenant provisioned by `verify-payment` has
`Subscription.status = "Active"` and a valid `expiryDate`, but `Plan = null`, so
`useTenantConfig` computes `isExpired = true` and both caps as `0`.

**It writes a role value that matches nothing.**

```ts
// app/api/signup/verify-payment/route.ts:108
role: "CustomerAdministrator",
```

`Tenant.role` defaults to `"customer_admin"` (`prisma/schema.prisma:23`) and every constant
in `src/lib/permissions/roleSets.ts` is snake_case - `super_admin` at `roleSets.ts:39`,
`customer_admin`, `qa_head`. `"CustomerAdministrator"` is PascalCase and matches no role
set, no exemption and no navigation branch. The exemption that would otherwise let the
paying customer in is at `route.ts:209`:

```ts
const planExempt = tenant.role === "super_admin" || tenant.role === "customer_admin";
```

With no `Plan` row and a role that matches neither exemption, the customer who just paid
cannot log in. The only path back is a `super_admin` creating a `Plan` row by hand from
`/admin`, which `src/modules/settings/tabs/SubscriptionTab.tsx:22-25` restricts to
`super_admin`.

Both `Tenant.plan` and `Tenant.subscription` relations are optional 1:1
(`schema.prisma:50-51`), so no constraint forces the second to exist.

### 5.3 JWT signing falls back to a source-visible key on any non-Recognised host

```python
# app/routers/auth_router.py:34-51
def _load_secret_key() -> str:
    key = os.getenv("SECRET_KEY")
    if key:
        return key
    is_production = (
        os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower() == "production"
        or os.getenv("RENDER") is not None
    )
    if is_production:
        raise RuntimeError(
            "SECRET_KEY environment variable must be set in production "
            "(no hardcoded fallback is permitted)."
        )
    logger.warning("SECRET_KEY is not set - using an INSECURE development default. ...")
    return "dev-insecure-secret-do-not-use-in-production"
```

The guard is opt-in. It fires only when `SECRET_KEY` is absent **and** one of `ENV`,
`ENVIRONMENT`, `RENDER` is set. On any host that sets none of them, every JWT in the
system is signed with a key that is committed to the repository, and `role` is an ordinary
string claim. `resolve_tenant` (`auth_router.py:430-463`) grants `super_admin`
unrestricted cross-tenant access at `:451-455`. A readable key plus a forgeable role
string yields a `super_admin` token for any tenant.

`.do/app.yaml:80-88` records that this already happened once on DigitalOcean: `ENV` was not
set, so the backend believed it was in development and token verification was fail-open.
The mitigation was adding `ENV=production` to the manifest at `:86-88`. That fix is
host-specific.

The same production test is written three times with three different rules:

| Location | Rule |
|---|---|
| `auth_router.py:38-41` | `ENV` or `ENVIRONMENT` equals production, or `RENDER` present |
| `auth_router.py:199` | `ENV` equals production only |
| `auth_router.py:236-246` | three-way, plus `AI_AUTH_STRICT` |

`create_token` at `:199` therefore mints 8-hour tokens where `_auth_strict` reports
`production_mode: true`. `datetime.utcnow()` at `:206` is deprecated on the pinned 3.12
runtime and produces a naive datetime.

### 5.4 The webhook acknowledges failures and provisions nothing

```ts
// app/api/webhooks/razorpay/route.ts:116-120
} catch (error) {
  console.error(...);
  return NextResponse.json({ success: true, warning: "Error processing" });
}
```

Every error path returns 200. Razorpay will not retry, there is no dead-letter, and no
alert fires. A transient database failure is a permanently lost event.

Provisioning depends on the browser completing:

```ts
// app/api/webhooks/razorpay/route.ts:155-159
if (pendingSignup) {
  console.log(`[webhook/razorpay] Payment captured for pending signup: ${pendingSignup.id}`);
  // The verify-payment endpoint will handle tenant creation
  // This is just a backup/confirmation
}
```

The comment calls this a backup. It is the only other code path that observes the
capture, and it does nothing. If the customer closes the tab after paying, money is
captured and no tenant is ever created.

The route also has no event-id dedupe and no raw-payload table, so there is no way to
answer "did Razorpay report this payment?" for a 21 CFR Part 11 evidence trail, in a
product that otherwise maintains `AuditLog` and `SignedRecord` tables.

### 5.5 Signature comparison can raise instead of returning false

`verifyPaymentSignature` (`src/lib/razorpay.ts:127-143`) calls `crypto.timingSafeEqual`
with no guard. A `razorpaySignature` whose byte length differs from the expected digest
raises `RangeError` instead of returning `false`. The exception escapes into the route
`catch` and yields `500 "Failed to verify payment"` where `400` is correct. The webhook
variant (`src/lib/razorpay.ts:154-176`) does guard, with the reasoning spelled out at
`:167`, and `requireEnv` is deliberately placed
outside its `try` so a configuration error is not reported as an invalid signature - that
reasoning is sound and should be preserved.

### 5.6 Rate limiting covers a quarter of the billable surface, and login has none

`app/middleware/rate_limiter.py` is not a middleware. It is a function with one call site:

```python
# app/services/assistant_pipeline.py:115-116
# 1. Rate limit - raises 429 before anything is spent.
rate_limit_middleware(user.customer_id)
```

That covers `POST /api/ai/assistant`, `/api/ai/help` and `/api/ai/voice/chat`. The
fifteen advisory routers that call `gpt-4o` or `gpt-4o-mini`, plus `voice/transcribe`
(billed per audio second) and `voice/speak` (billed per character), are unprotected. The
file's own header states its purpose as preventing "abuse and cost explosion".

The store is a module-level `defaultdict(list)` (`rate_limiter.py:13`) with limits of
20/minute and 100/hour. It is per-process, unlocked - the assistant path is reached from
sync handlers that Starlette runs in a threadpool - and unbounded: keys are removed only
for the key being checked, and `clear_rate_limits()` is never called. A restart resets
every quota, and any move to multiple workers multiplies the effective limit.

Login has no rate limit at all, and its lockout is a second `defaultdict`:

```python
# app/routers/auth_router.py:61-63
FAILED_LOGINS: dict = defaultdict(lambda: {"count": 0, "locked_until": 0})
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION = 900
```

`check_account_lockout` reads `FAILED_LOGINS[username]` at `:68`, and a `defaultdict` read
inserts the key. Every login POST with an arbitrary username allocates an entry that is
never removed, so the table is an unauthenticated memory-growth vector. The key is the
caller-supplied username, so five bogus requests lock a known account for fifteen minutes
with no IP dimension, no attempt budget and no administrative unlock. Because a valid
username eventually returns 429 and an invalid one never does, the lockout is also a
username-enumeration oracle.

The Next.js side has no rate limiting at all. A repository-wide search for
`rate.?limit` outside documentation and error strings returns nothing.
`app/api/signup/initiate/route.ts` is unauthenticated and calls
`bcrypt.hash(data.password, 12)` at `:116` on every call, which is an unpaid
CPU-amplification lever.

### 5.7 `render.yaml` will destroy the backend's tables

Three deployment configurations exist. `.do/app.yaml` is current, detailed and correct.
`vercel.json` is a three-line framework hint. `render.yaml` is stale and unsafe:

```yaml
# render.yaml:20-21
    # `prisma db push` runs every boot (idempotent) so the schema on the
    # mounted disk is always in sync. Seed once manually via the Shell.
    startCommand: npx prisma db push && npm start
```

It targets `file:/data/glimmora.db` (`render.yaml:22-23`) - file-based SQLite, against a
schema whose provider is `postgresql` - and it reconciles the whole database to
`schema.prisma` on every boot (`render.yaml:14`). `.do/app.yaml:14-16` states that this
exact command would drop the SQLAlchemy tables because the Neon database is shared.
Deploying the Render blueprint against a shared database would destroy the backend's data.

### 5.8 Startup DDL mutates a shared database and hides its own failures

`app/main.py:174` calls `Base.metadata.create_all(bind=engine)` at module scope - not in a
lifespan handler, not in a startup event. There is no `lifespan=` and no `@app.on_event`
anywhere in the tree. It runs in every process that imports `app.main`, including all
three test modules, and it runs before uvicorn binds a socket.

Three hand-rolled helpers follow at `app/main.py:300-302`, unconditionally on every boot:
`_ensure_audit_tenant_column()` (`:177-198`), `_ensure_audit_observability_columns()`
(`:264-297`) and `_backfill_audit_tenant()` (`:201-261`). They `ALTER TABLE` a database
that Prisma also owns, interpolate identifiers from a `wanted` dict into DDL at `:293`,
and wrap every failure in `except Exception` with a `print`. A migration that fails leaves
no trace and raises no alert.

`_backfill_audit_tenant` joins `ai_audit_trail.username` to `users.customer_id`
(`:234-249`). `users` is the dead FastAPI table from section 4.4 and has zero rows, so in
any deployment the backfill marks every audit row `'unattributed'` (`:250-255`). The
`_scoped` filter in `audit_router.py:119-130` matches on `customer_id`, and only
`is_platform_admin` bypasses it - so the audit trail becomes invisible to every tenant. The
comment at `:206-208` describes the bug this function was written to fix; on the current
schema it recreates that bug.

`/health` (`app/main.py:330-345`) checks only `bool(os.getenv("SECRET_KEY"))` and performs
no database probe, so a reachable-but-wrong database still reports healthy.

## 6. P2 findings - structure and maintainability

### 6.1 Services follow two conventions, and the documented rule is not the real one

Flat modules in `app/`: `ai_service.py`, `assistant_service.py`, `draft_service.py`,
`help_service.py`, `intelligent_assistant_service.py`, `regulatory_assistant_service.py`,
`search_service.py`, `summary_service.py`.

Nested in `app/services/`: `assistant_pipeline.py` (211 lines), `document_text.py`
(97 lines).

The previous analysis described this as "flat versus nested". The real rule is different:
eleven routers import a flat `app.*_service.py` for business logic, while three import
from `app/services/` for plumbing shared by two or more routers (`ai_router.py:42-46` and
`voice_router.py:38` for the assistant pipeline, `capa_recurrence_router.py:59` for
document text). `app/services/assistant_pipeline.py:39-43` depends on five of the flat
modules.

Moving the flat modules into `app/services/` inverts that dependency - a package importing
its own members - and is a real change, not a mechanical one. A third convention also
exists: `app/fallbacks/`, which eleven routers import from the package root and one imports
directly (`rework_tasks_router.py:34`).

`app/services/assistant_pipeline.py` is the best-engineered module in the backend and
should not be disturbed. It enforces one policy for the assistant regardless of modality
because, as its header records, the voice route previously used a different ungrounded
pipeline. `app/services/document_text.py` encodes the same lesson: two copies of the
extraction logic produced two failure behaviours, one of which returned its error string
in the text position so the model reviewed an error message and emitted findings about a
document it had never seen.

### 6.2 Request and response models are declared inside routers

Forty-eight Pydantic `BaseModel` classes across fifteen router files. `ai_router.py` alone
holds eighteen, which is 37.5% of the total. `app/schemas/` contains only
`capa_schema.py` - 255 lines, eighteen model classes, and **zero importers anywhere in the
repository**. It is the schema module for routers that `app/main.py:28-47` deleted.

Three models should not move: `_GroundedAnswer` (`app/help_service.py:43`),
`_Bullets` (`app/summary_service.py:133`) and the model-output contracts in
`regulatory_intelligence_router.py` are not HTTP contracts. They validate a model's output
and belong beside the prompt that produces it.

### 6.3 The audit trail's own model lives in a router

`AIAuditTrail` is declared at `app/routers/audit_router.py:32` with
`__tablename__ = "ai_audit_trail"`. It is the most security-relevant table in the service
and it is created only because `app/main.py:50` imports the router before `:174` runs
`create_all`. `app/routers/drift_detection_router.py:36` imports it from there - a service
depending on another router's internals.

The AI audit and compliance audit routes are genuinely separate datasets, which the
previous pass got right, but their OpenAPI tags do not distinguish them.

### 6.4 Configuration is read ad hoc, and the declared runtime does not match the venv

There is no `pydantic-settings` `BaseSettings` object. Environment variables are read
through scattered `os.getenv` calls. The database module calls `load_dotenv()` at
`app/database/db.py:14`; `app/routers/voice_router.py:40` calls it again; the security
key is loaded by a bespoke function at `auth_router.py:34`.

`.python-version` and `runtime.txt` both declare 3.12.7. The committed `venv/pyvenv.cfg`
declares 3.13.13. Local test results are therefore not from the declared runtime.
`venv/`, `__pycache__/` and `glimmora.db` are all present in the working tree.

`fix_py38.py` is a source-rewriting codemod that executes on import and writes files in
place:

```python
# fix_py38.py:94-95
for py_file in Path('app').rglob('*.py'):
    if process_file(py_file):
```

Nothing references it. It corresponds to commit `f517ca4` and would now rewrite the current
`from __future__ import annotations` codebase. Running it from the wrong directory would
mangle twenty router files.

### 6.5 Test coverage is thin and the runner assumption is wrong

Frontend: two unit tests (`src/actions/frameworks.guard.test.ts`,
`src/lib/permissions/agiPolicy.test.ts`) and thirteen Playwright specs under `tests/`.
There is no unit test for any billing route.

Backend: three modules - `tests/smoke_test.py`, `tests/test_ai_grounding.py`,
`tests/test_ai_security.py` - and `pytest` is not in `requirements.txt`. `tests/` also
contains `test_audit_trail.cpython-313.pyc` with no corresponding `.py`, confirming both a
committed build artifact and a deleted test.

`package.json` has no `typecheck` script, and no `test:integration`. `test:unit` runs
`node --test` over `src/**/*.test.ts`; `test` and `test:smoke` are both `playwright test`.

## 7. What is already correct

These are the assets the refactoring must preserve. Regressing any of them is a failure
equivalent to the P0 findings.

### 7.1 The AI boundary

`app/api/ai-proxy/[...path]/route.ts` mints a 300-second HS256 token server-side per
request (`src/lib/aiToken.server.ts:86-113`, `TTL_SECONDS` at `:42`) and forwards it in an
`auth` header. The browser never holds an AI credential.

`auth` is explicitly excluded from the forwarded header set
(`FORWARD_REQUEST_HEADERS = ["content-type", "accept"]` at `:48`), so a caller cannot
spoof upstream identity. Only `content-type` and `accept` are forwarded (`:96-100`), so
cookies, `host` and `x-forwarded-for` cannot leak to the AI service. A missing secret
fails closed with 503 (`:109-112`). `runtime = "nodejs"` (`:15`) is required for
`node:crypto` and is set.

Forwarding is allowlisted rather than open:

```ts
// :30-36
const ALLOWED_PREFIXES = ["api/ai/", "api/v1/"];
const BLOCKED_PATHS = [/^api\/v1\/auth\//i];
```

There is one flaw, and it is a **P1 fail-open** rather than a footnote: `BACKEND_URL` falls
back to `NEXT_PUBLIC_API_URL` and then to `"http://localhost:8000"` (`:9-12`). A production
deploy missing `BACKEND_URL` proxies to localhost silently. The 503-on-missing-secret path
fails closed; this one does not, and the two sit twelve lines apart in the same file, which
is the worst place for them to disagree. `safeEqual` is exported at `:119-123` for inbound
service-token validation and has no callers; it is the correct primitive and is unused.

Fix it in the stabilise phase, alongside the webhook unblock: in a non-development
environment, a missing `BACKEND_URL` must return 503 naming the variable, exactly as the
missing signing key does. The same rule, the same failure mode, the same answer.


`safeEqual` is exported from `aiToken.server.ts:119-123` for callers validating inbound
service tokens. It has no callers.

### 7.2 JWT verification

`auth_router.py:274-285` pins `algorithms=["HS256"]`, which blocks `alg: none` and RS256
confusion, requires `["exp", "sub", "customer_id"]`, and returns an opaque error that
never echoes the decode failure. `tests/test_ai_security.py:135-161` covers `alg: none`,
wrong secret, expiry and missing tenant.

### 7.3 Payment hashing is portable

Signup uses `bcryptjs` at cost 12 (`app/api/signup/initiate/route.ts:116`); login uses
`bcrypt.compare` (`app/api/auth/[...nextauth]/route.ts:179` and `:373`). `bcrypt.compare`
reads the cost from the stored `$2b$<cost>$...` string, so the mixed cost-10 and cost-12
hashes in the database all verify. The format is standard Modular Crypt Format bcrypt and
Python `bcrypt==4.2.0` reads and writes it natively, so a FastAPI implementation can
verify these hashes with `bcrypt.checkpw`. No re-hashing pass is required.

One drift: `src/lib/passwords.ts:12` declares `BCRYPT_COST = 10` as the single source of
truth, and `initiate` hardcodes `12` without importing it. The comment at that line says
"bump to 12 once average login latency budget allows", so the constant is now behind its
own callers.

Note that `PendingSignup.passwordHash` (`prisma/schema.prisma:258`) is a pre-computed
bcrypt hash of a not-yet-purchased account, held for 24 hours and then copied verbatim into
`Tenant.passwordHash` at `verify-payment:107`. The row is never deleted - `initiate:100`
deletes only a superseded row, and the completed row is status-updated - so the hash
persists indefinitely after the tenant exists.

### 7.4 The money-moving transaction is already correct

`app/api/signup/verify-payment/route.ts:99-162` wraps all four writes in one
`prisma.$transaction`. Partial failure rolls back completely. The same is true of
`verify-renewal` at `:104`. Replay of the same `signupId` is caught by the status check at
`:52-57`, and `Payment.razorpayPaymentId` is `@unique` (`prisma/schema.prisma:289`,
materialised as a unique index in
`prisma/migrations/20260716120000_reconcile_postgres_baseline/migration.sql:509`).

What is missing is the atomic guard between the pre-transaction read and the write: two
concurrent `verify-payment` calls both observe `status: "order_created"` before either
commits. The loser fails on a unique constraint and receives 500 instead of a clean 409.
`Payment.tenantId` (`schema.prisma:286`) is a denormalised scalar with no foreign key, so
nothing prevents it disagreeing with `subscription.tenantId`.

`app/api/subscriptions/renew/route.ts:52` correctly reuses a stored order when
`status === "order_created"`, and `create-order` derives the amount from the plan row
(`:73-76`) so the client cannot set a price.

### 7.5 Deployment configuration on DigitalOcean is well documented

`.do/app.yaml` records two real incidents in comments and their fixes: the missing `ENV`
variable that made auth fail open (`:80-88`), and the missing `preserve_path_prefix` that
made every route 404 (`:48-59`). It uses `prisma migrate deploy` rather than `db push` for
precisely the reason in section 5.7, declares the backend from its own repository with an
explicit warning against re-vendoring (`:42-50`), and points `BACKEND_URL` at
`${api.PRIVATE_URL}` so Next.js and FastAPI never leave the private network.

## 8. Target architecture

Unchanged in intent from the previous pass, and the plan implements it in this order.

### Next.js retains

- The interface, client state, and Server Actions already in `src/actions/`.
- NextAuth as the sole identity issuer (section 9, decision 3).
- The AI backend-for-frontend proxy (section 7.1), unchanged.
- Read models in `src/lib/queries/`.
- File and evidence downloads, which are storage concerns.

### FastAPI owns

- Public onboarding, plan catalogue, Razorpay order creation, payment verification,
  renewal and webhook processing.
- The Razorpay integration behind one interface.
- Billing validation, transactions, idempotency and audit.
- All AI, advisory and audit APIs, with `app/services/` and `app/schemas/` conventions
  applied to new code before existing code is moved.

### Data ownership

- Prisma remains the schema authority. SQLAlchemy mirrors, it does not define.
- The billing mirror covers `SubscriptionPlan`, `Subscription`, `Payment` and
  `PendingSignup`, plus `Tenant` because provisioning writes it.
- The mirror must reproduce the existing DDL exactly, including
  `Payment.razorpayPaymentId @unique`, `Subscription.tenantId @unique` and the
  `onDelete` behaviours in the baseline migration. No schema change is introduced by the
  refactoring.
- `Plan` is retired in favour of `Subscription` (section 9, decision 1), so the mirror
  does not need it, and the runtime read sites move to `tenant.subscription`.

## 9. Corrections to the previous analysis

| Previous claim | Verified position |
|---|---|
| "The stack is broadly sound; the issue is a missing boundary" | Understated. Six P0 blockers, including a payment flow that cannot execute |
| "Delete the unused CAPA detail component" | **Wrong.** `CAPADetailPage.tsx` owns the live route. `CAPADetailPageV2.tsx` is a pending redesign that reuses it, and its header at `CAPADetailPageV2.tsx:22` says so correctly. This is a decision, not a deletion |
| "Remove React Query if unused" | **Confirmed true.** Only `src/components/Providers.tsx` references it; zero `useQuery`/`useMutation`/`QueryClientProvider` consumers |
| "Backend test suite: pytest" | **Wrong.** `pytest` is not in `requirements.txt`. The three test modules are not runner-pinned in the repo |
| "Related analysis: `docs/refactor-analysis.md`" (plan line 4) | **Wrong path.** The file is at `docs/superpowers/plans/2026-09-25-refactor-analysis.md` |
| "Schema changes use startup `create_all` and manual `ALTER TABLE`" | **Confirmed and worse.** `create_all` runs at module scope, not in a startup event, and one of the three helpers actively hides the audit trail |
| "Local environment files contain sensitive values" | Partly stale. Only `.env.example` is tracked in the frontend; `.env` and `.env.local` are correctly untracked. The backend `venv/` and `glimmora.db` are the real tracked-artifact problem |
| "Rate limiting and login lockout are kept in process memory" | **Confirmed and understated.** It also covers 3 of roughly 21 billable endpoints, login has no rate limit, and both stores grow without bound |
| "Plan to move billing into FastAPI" | Direction correct. The previous phase order was not - it migrated a flow that could not run, which would have carried the IDOR, the dead account and the missing audit trail into the new service |

### 9.1 Second-pass corrections, 29 September 2026

A second verification pass, again against source in both working trees, changed seven
further claims. The plan in the same directory implements the corrected position.

| Previous claim | Verified position |
|---|---|
| Plan §5.0.7 "Rate limit `POST /api/v1/auth/login`" | **Contradicts plan §5.0.5**, which deletes that endpoint in the same phase. After the deletion the only login surface is NextAuth's credentials provider at `app/api/auth/[...nextauth]/route.ts`, which has **no rate limiting at all**. Login limiting belongs there, and keyed by IP as well as identifier - a username-keyed limit alone reproduces the third-party lockout that 5.6 describes |
| Plan §5.0.8 untracks `venv/`, `__pycache__/`, `glimmora.db`, `*.pyc` | **Already done.** All four are correctly ignored in both repositories; `git ls-files` returns zero for every one. What is actually tracked is different: `prisma/dev.db.bak` and `prisma/dev.db.pre-agi-push.bak` (SQLite database backups), `docs/manual/Glimmora-Docs-REVIEW-COPY.pdf.bak` (13 MB), 52 generated screenshots, and - in the backend - `app/rag/.embedding_cache.json` at 1,054,821 bytes |
| 5.1: the replay attack sets `planId` **and** `billingCycle: "yearly"` | **Narrower.** `billingCycle` is never persisted; it only computes `expiryDate` at `verify-renewal/route.ts:94`. Only `planId` mutates the subscription (`:131`). The attack is "pay the cheapest monthly, replay with the priciest `planId`" - one wrong `maxAccounts` and the wrong expiry, for one monthly payment. Still P1, still closed by binding the order server-side |
| 5.2: `SubscriptionTab.tsx:22-25` restricts the settings view to `super_admin` | **Wrong line, wrong conclusion.** `:22-25` is a doc comment, not a guard. The real gate is `SettingsPage.tsx:137` on `SETTINGS_MANAGE_ROLES` = `["super_admin", "customer_admin"]` (`roleSets.ts:347`). The core finding stands regardless: the login gate at `route.ts:412-415` and `useTenantConfig.ts:42,59-60` both read `tenant.plan`, so a tenant with no `Plan` row cannot log in |
| - | **New finding, not in any prior pass.** `app/services/assistant_pipeline.py:46` does `from app.routers.auth_router import CurrentUser` - a service importing from a router, the same inversion the AI audit trail has at `drift_detection_router.py:36`. Belongs to the structural phase, not to a security one |
| `.do/app.yaml` cited throughout as if it were backend configuration | It lives in the **frontend** repository (191 lines), not the backend. Every line citation in this document is correct. It deploys the frontend from `main` and the backend from `ai_develop`; local branches are `dinkar-frontend` and `dinkar-backend`. The branch mismatch is a real deployment risk and belongs to the delivery phase |
| The plan's related-analysis path, `docs/superpowers/plans/2026-09-25-refactor-analysis.md` | Does not exist; that directory is empty. This file is `docs/refactor-analysis.md`. The first pass flagged this and the fix was never applied to the plan |


## 10. Constraints and invariants

1. **Prisma is the schema authority.** SQLAlchemy changes must not alter the shared
   database. The backend is a client of the schema, never a second owner of it.
2. **One database, one migration path.** The DDL and the unique indexes in
   `prisma/migrations/20260716120000_reconcile_postgres_baseline/migration.sql` are the
   reference. `prisma db push` must never run against the shared database.
3. **NextAuth is the only token issuer.** FastAPI verifies. No FastAPI endpoint mints a
   token for an unvalidated `customer_id`.
4. **Amount and entitlement come from the server.** The Razorpay signature covers
   `orderId|paymentId`; everything else the subscription needs is bound server-side to the
   order before the client can influence it.
5. **Every public write is idempotent and audited.** Tenant, subscription and payment
   transitions produce an audit record, and a replay is a defined 409, not a 500.
6. **Password compatibility is preserved.** `bcrypt` `$2b$` at cost 10 or 12, verified by
   Python `bcrypt.checkpw`.
7. **Secrets never enter git, logs, or documentation.** Only variable names appear in this
   document. `.env` files stay untracked. `venv/`, `__pycache__/` and `glimmora.db` are
   untracked.
8. **Each phase leaves both applications runnable** and is independently reviewable and
   revertible.
9. **Deployment is DigitalOcean App Platform only**, with the `api` service built from the
   backend repository on its own branch, and `.do/app.yaml` owned by the frontend
   repository.
10. **The backend is never vendored into the frontend.** No `Glimmora-Pharma/backend/`
    directory, ever. The two repositories are siblings and the dependency is one-way.
11. **Every phase ends with the frontend wired to the backend, working end to end.** A
    phase that leaves the two unable to talk is not finished, however green its own tests
    are. For a backend-only phase that means the frontend's existing calls are verified
    unchanged against the new backend; for a frontend-only phase, the same in reverse; for
    the billing migration, that a prospect can pay and reach a working account. The wiring
    uses the existing structures - the AI proxy at `app/api/ai-proxy/[...path]/route.ts`,
    the NextAuth session, and `src/actions/` - and introduces no new client, state pattern
    or proxy.
12. **Each phase is confirmed by a named human before the next begins.** The phase
    completion report states, in the client's terms: what a person can now do that they
    could not before, what is still broken on purpose, and what was verified rather than
    assumed. Confirmation is per phase, not at the end of the programme. A phase that is
    not confirmed is not closed, and the next phase does not start.
13. **Backend work modifies existing files in place.** New modules appear only where a new
    responsibility requires one. No file is renamed, split or relocated for tidiness, and
    no service moves between the flat and `app/services/` conventions before the phase that
    decides which convention is correct.


## 11. Open decisions

1. **Existing `Plan` rows.** Retiring `Plan` requires migrating live `Plan` data into
   `Subscription`, including `maxUsers`, `maxSites`, `minRetentionYears` and
   `durationMonths`, which `Subscription` does not currently carry. Confirm the row count
   and whether any reporting reads `Plan` directly.
2. **Trial handling.** `Subscription` has trial fields and `Plan` has
   `minRetentionYears`. Decide whether trial state moves wholesale or stays in the
   commerce model only.
3. **`Payment.tenantId` integrity.** Add a composite foreign key, or assert consistency in
   the billing service. A schema change is required for the former.
4. **Pending-signup retention.** Decide whether completed `PendingSignup` rows are purged
   after a period, given the password hash they retain.
5. **Alembic adoption.** Recommended once the billing mirror lands, since the backend
   would otherwise own no reviewable schema history. Sequence it after Phase 2.
6. **Role vocabulary.** `Tenant.role` mixes snake_case and one PascalCase writer. Confirm
   `"customer_admin"` as the canonical value and whether `CustomerAdministrator` appears in
   any deployed row.

## 12. Verification

Reproduce these before starting Phase 0 and re-run them at each phase exit. The backend
commands run in `pharma_glimmora_ai_backend`; the frontend commands run in
`Glimmora-Pharma`. The cross-service block is not optional - see invariant 11.

**Backend** — from `pharma_glimmora_ai_backend`

```bash
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python -c "import app.main; print(app.main.app.title)"
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl localhost:8000/health
curl localhost:8000/docs
```

The import must succeed with `OPENAI_API_KEY` unset, and `DATABASE_URL` must resolve
against a PostgreSQL server. Run the existing three test modules and record the result
rather than assuming it passes.

**Frontend** — from `Glimmora-Pharma`

```bash
npm ci
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
npx playwright test
```

**Payment path (the checks that prove finding 4.1)**

```bash
curl -i localhost:3000/api/webhooks/razorpay -X POST -d '{}'   # expect 401 from the
                                                               # route's own signature
                                                               # check, NOT from proxy.ts
curl -i localhost:3000/api/signup/pricing                      # expect 401 from proxy.ts
```

The distinction matters. The first must be rejected by the handler because the signature is
absent, not by the edge because there is no session. The second must still be rejected by
the edge - after Phase 0 task 0.1 the public checkout is deliberately left switched off
rather than reactivate a path with the finding 5.1 defect. Once Phase 2 deletes the eight
routes, both paths disappear and the check is retired.

**Audit the invariants**

```bash
git ls-files | grep -E '\.(env|db|bak|pyc)$|venv/|__pycache__/'
grep -rn "OpenAI(" app/ | grep -v "app/core/"
grep -rn "os.getenv" app/ | wc -l
```

The first must return nothing. The second must return only the centralised factory. The
third is the count the `BaseSettings` migration is measured against.

**Cross-service — the wiring check, and the one most easily skipped**

Both applications running is not the same as the frontend reaching the backend. Start both,
then:

```bash
# 1. The backend is actually up and reporting readiness.
curl localhost:8000/health

# 2. The frontend's proxy reaches it through the private-network path, not a
#    fallback. A 401 proves the request ARRIVED and the token was rejected.
#    A 404 or a connection error means the proxy could not route, which is the
#    BACKEND_URL fail-open of 7.1 and must be fixed, not ignored.
curl -i localhost:3000/api/ai-proxy/api/ai/health

# 3. An authenticated advisory call round-trips end to end.
#    Needs a session cookie; run from a browser devtools console on a signed-in page.
#    fetch('/api/ai-proxy/api/v1/finding-triage/classify', {method:'POST',
#      headers:{'content-type':'application/json'},
#      body:JSON.stringify({requirement:'Batch records are not reviewed by QA.',
#        activeFrameworks:['p210']})})
```

A phase is not complete until this block passes on the real code, not only in unit tests.
Report the result to the human partner and wait for confirmation before starting the next
phase (invariant 12).

