# Glimmora Pharma — Refactoring Architecture

**Status:** analysis only. No code changed.
**Date:** 2026-09-30
**Scope:** the two-repository topology — `Glimmora-Pharma` (Next.js + Prisma) and `pharma_glimmora_ai_backend` (FastAPI analysis service).

This document is the ownership map. It answers one question per responsibility:
**where should this live, and what evidence says so today?**

It is not a bug list. Findings that are defects are listed only where they change a
migration decision — a bug that makes a rule untestable blocks its move. Bug-level
enumeration stays in [`refactor-analysis.md`](./refactor-analysis.md); the phased
delivery plan stays in [`refactor-pharma-stack.md`](./refactor-pharma-stack.md).

---

## 0. How to read this

| Section | Answers |
|---|---|
| §1 | What the two repos are, and the confirmed one-database decision (§1.1) |
| §2 | What the system actually does today, with verified numbers |
| §3 | The data model and the seven state machines encoded in `String` columns |
| §4 | The ownership matrix — the core of the document |
| §5 | The eight migration seams, ordered by regulatory risk |
| §6 | The target API contracts |
| §7 | The invariants that must survive any move |
| §8 | What must be fixed before migrating anything |
| §9 | What remains undecided |

**Path convention — read this first.** The two repos are sibling directories and
**both contain an `app/`**, so an unqualified path is ambiguous by construction:

| Prefix | Repo | Directory | Local folder |
|---|---|---|---|
| `fe:` | `Glimmora-Pharma` | frontend | `Glimmora-Pharma/` |
| `be:` | `pharma_glimmora_ai_backend` | backend | `pharma_glimmora_ai_backend/` |

Every path in this document carries one of these prefixes. `fe:app/api/...` is the
Next.js App Router; `be:app/...` is the Python package. Do not drop the prefix — a
dropped `be:` turns `app/main.py` into a file that does not exist in the frontend, and
`fe:app/api/ai-proxy/...` into one that does not exist in the backend.

**Evidence standard.** Line counts, endpoint counts and grep counts were measured
directly. Claims about *behaviour* are cited `file:line`. Where a source asserted
something I could not re-verify, it is marked **[unverified]** and must be confirmed
before it justifies a code change.

> **One correction, recorded deliberately.** This document's first draft cited
> `app/api/capas/route.ts:41` as a location in the frontend. **That file does not
> exist.** The claim originated in a TODO at `fe:src/constants/statusTaxonomy.ts:210`
> that references a route file that has since been deleted — the codebase's own
> comment had gone stale, and the stale comment was then copied into this document.
> See §3.3 for the corrected finding. It is left here because a document that hides
> its own errors cannot be audited, and because it demonstrates a failure mode that
> applies to the other `file:line` citations in this repo: **a line citation whose
> referent has moved is worse than no citation.** Every citation in this document was
> re-verified against the tree after the first draft; the check is cheap and it caught
> one.

---

## 1. Repository ownership

Two repos, one deployable. The split is already correct in principle and must not be
undone: the AI service is an *analysis* service, not a second system of record.

```
fe: Glimmora-Pharma/                            baarez-technology/Glimmora-Pharma
    → .do/app.yaml: service `web`   (instance_count: 1)
    Next.js 16 App Router · React 19 · Prisma 6 · PostgreSQL (Neon)
    fe:src/   514 files  121,551 lines
    fe:app/    81 files    4,352 lines   ← Next.js App Router
    fe:prisma/schema.prisma  2,837 lines / 64 models / 0 enums

be: pharma_glimmora_ai_backend/                 baarez-technology/pharma_glimmora_ai_backend
    → .do/app.yaml: service `api`   (instance_count: 1)
    FastAPI · SQLAlchemy 2 · uvicorn :8080
    be:app/    60 files  11,612 lines           ← Python package
    be:tests/   9 files   3,029 lines
    Owns exactly ONE table: ai_audit_trail
```

`.do/app.yaml` in the **frontend** repo is the topology owner. The backend repo has no
`.do/` directory, yet nine backend modules cite `.do/app.yaml:NN` by line number in
their docstrings — those references resolve against the frontend file. That is a live
coupling with no mechanism enforcing it.

**Shared database.** Both services point at the same Neon Postgres instance. The Prisma
schema header states this. Two consequences that constrain everything below:

1. `prisma db push` is forbidden — it reconciles the whole database to `schema.prisma`
   and drops `ai_audit_trail`. `migrate deploy` only. This is enforced in
   `.do/app.yaml` as a `PRE_DEPLOY` job and in the CI comment at
   `Glimmora-Pharma/.github/workflows/ci.yml:21-23`.
2. A new FastAPI service in this topology will share the migration story with Prisma.
   The backend currently runs its own additive `ALTER TABLE` DDL at startup
   (`be:app/core/migrations.py:141`) against the same database. Any extraction that adds
   tables must decide who owns those migrations before the first one is written.

**Git state at time of analysis.**

| Repo | Branch | HEAD | State |
|---|---|---|---|
| Glimmora-Pharma | `dinkar-frontend` | `2e6b221` | ahead 1 of `origin/dinkar-frontend` |
| pharma_glimmora_ai_backend | `dinkar-backend` | `b07f69a` | ahead 1 of `origin/dinkar-backend` |
| Glimmora-Pharma | `devAI` | `a7ede62` | — |
| pharma_glimmora_ai_backend | `ai_develop` | `ee84a69` | **this is the deployed branch** |

`.do/app.yaml:54` deploys `ai_develop`; `.do/app.yaml:40-50` carries a comment stating
`ai_develop` is 9 commits behind. Both work branches are unpushed. **The working
branches are not the deployed branches.** Any decision to migrate a rule into the
backend is a decision about `ai_develop`, not `dinkar-backend`.

### 1.1 Confirmed: one database, and SQLAlchemy owns the schema

**Decision 1 (2026-09-30):** a single PostgreSQL instance is the system of record for
both repositories, permanently. Resolved §9.1 #1 (one FastAPI application, not
services) and §9.1 #3 (one database, no second datastore).

**Decision 2 (2026-09-30), superseding the earlier text of this section:** the schema
migrates from Prisma to SQLAlchemy + Alembic, and **Prisma is removed**. This is the
reverse of what this section originally said. The consequences, restated so they cannot
be re-litigated:

1. **Alembic becomes the sole schema authority.** Every table, column, index and
   constraint is owned by an Alembic revision. `migrate deploy` is retired; `db push` is
   forbidden throughout the transition. Full plan, ordering and the migration-history
   strategy are in **§10**.
2. **Prisma is a transitional mirror, then deleted.** During the transition both ORMs
   see the same tables. Only one may *write* a given table at a time, and the handover
   is per domain — see §10.3. The end state has zero Prisma models.
3. **`create_all` still does not come back.** `be:app/main.py:52-63` records why the
   previous mirror was deleted: `Base.metadata.create_all` on every boot kept the
   `prisma db push` hazard live in *both* directions. Alembic replaces it; it is not a
   licence to reintroduce it.
4. **The migration history is preserved, not replayed.** The 14 active Prisma
   migrations are **not replayable** — see §10.2 for the evidence. They are retained
   verbatim as a read-only provenance archive. This is the correct reading of "port all
   14": the history is retained and readable, and a fresh database is reproducible, but
   the history is not pretended to be re-executable when it cannot be.

#### The one thing standing between "one database" and "proper"

One database is already true. **One schema authority is not.** Verified against the
tree:

| Fact | Evidence |
|---|---|
| `ai_audit_trail` is **absent** from `fe:prisma/schema.prisma` | no match for `ai_audit` anywhere in the 2,837-line schema |
| It is **absent from every Prisma migration** | no `ai_audit_trail` in any `fe:prisma/migrations/*/*.sql` |
| Its table is created by SQLAlchemy at boot | `be:app/main.py` lifespan → `Base.metadata.create_all(bind=engine)` |
| Its columns are evolved by hand-written DDL at boot | `be:app/core/migrations.py:69,94-123` — **8** literal `ALTER TABLE … ADD COLUMN` statements (a 9th `ADD COLUMN` match in that file is the word inside a comment, not a statement) |
| `prisma db push` would drop it | documented at `fe:.do/app.yaml` and `be:app/main.py:55-57` |

So today: the **existence** of a compliance table is owned by the Python service's
boot sequence, its **shape** by hand-written SQL, and neither is in the migration
history. That is two schema authorities on one database — precisely the hazard §1.1
removes everywhere else. It also means the single most audit-sensitive table in the
system has no migration record.

**This is fix-early and it is Seam 0 work, not seam 7 work.** Fold `ai_audit_trail`
into `fe:prisma/schema.prisma` as a model, express its 8 added columns as one Prisma
migration, then reduce `be:app/core/migrations.py` to nothing and delete it. Do this
*before* the mirror grows, because every table added to the mirror multiplies the
number of places the schema can be wrong.

Note this does **not** move AI-audit ownership to the frontend. The table still belongs
to the AI service functionally — `be:app/observability/ai_trace.py` writes it and
nothing else should. What moves is *schema authorship*: Prisma records the shape, the
Python service reads and writes it. The service keeps its table and loses its
authority over it.

#### Drift guard, required from day one

A hand-maintained mirror of a 64-model schema will drift, and nothing in the toolchain
currently notices. Minimum viable guard, in both repos' CI:

- a test that every SQLAlchemy model maps to a Prisma model of the same name, with no
  column in one and not the other;
- a test that the live database's column set for each mirrored table matches both
  declarations (this catches a migration applied to one service's knowledge only);
- `prisma migrate diff` in CI to detect schema drift against the committed
  `schema.prisma`.

This is cheap, and it is the difference between a mirror and a second source of truth.

---

## 2. What the system is

A multi-tenant GxP compliance platform for pharmaceutical manufacturing. It manages
the record lifecycle that 21 CFR Part 11 makes legally defensible: deviations, CAPAs,
gap-assessment findings, FDA 483 responses, computer-system validation, change control,
and the electronic signatures over all of them.

**The consequence that shapes the whole refactor:** the system of record is a
relational database that auditors will inspect, and every lifecycle transition on a
regulated record must be defensible years later. That is not a preference for the
backend over the frontend. It is the reason the ownership boundaries below are the
boundaries they are.

### 2.1 Frontend — measured surface

| Layer | Location | Size | Nature |
|---|---|---|---|
| Server actions | `src/actions/` | 45 `"use server"` modules, ~680 KB | **The domain.** See §2.2 |
| Route handlers | `fe:app/api/` | 18 files, 2,551 lines | BFF: auth, AI proxy, billing, file download |
| Read layer | `src/lib/queries/` | 22 files, 3,609 lines | `React.cache()`-wrapped Prisma |
| Permission model | `src/lib/permissions/roleSets.ts` | 855 lines, ~90 exports | The authorization policy |
| E-signature | `src/lib/signing.ts` | 789 lines, 14 canonicalisers | Part 11 cryptographic evidence |
| KPI/scoring | `src/lib/kpi/` | 1,526 lines, 9 files | Business calculations |
| UI modules | `src/modules/` | 17 modules, 62,336 lines | Presentation |
| E2E | `tests/` | 13 Playwright specs, 1,549 lines | Smoke journeys |

Largest UI modules: `capa` (38 files / 11,464 lines), `fda-483` (20 / 11,001),
`admin` (43 / 6,888), `csv-csa` (20 / 5,495), `dashboard` (39 / 5,445).

### 2.2 The server actions layer is the finding

This is the single most important fact in the document.

**`src/actions/` is not a BFF layer.** It is a domain monolith that happens to be
addressed over the Next.js Server Actions transport. Measured across the 45 modules:

| Signal | Count | Meaning |
|---|---|---|
| `resolveUserFk(` | 206 | FK-safety resolution on nearly every path |
| `revalidatePath(` | 285 | cache invalidation after writes |
| `prisma.auditLog.create(` + `tx.auditLog.create(` | 315 | hand-written Part 11 §11.10(e) trail |
| `prisma.$transaction` | 83 | multi-table atomicity |
| `.safeParse(` (zod) | 122 | request validation |
| `notify(` / `notifyMany(` | 28 | side-effect fan-out |
| role-set references | 154 | inline authorization |

Server Actions are an RPC mechanism, not an architecture. The business rules,
transaction boundaries, e-signature pipeline, separation-of-duties engine, and state
machines all live inside it. **That is the thing to change.** The transport is
incidental.

The five largest modules:

| File | Lines | Owns |
|---|---|---|
| `actions/systems.ts` | 2,484 | CSV/CSA validation: stage state machine, 4-gate sign-off, Part 11 signature, drift verification, RTM coverage, CSA stage template |
| `actions/capas/lifecycle.ts` | 2,016 | CAPA create saga, status machine, DI gate, submit/reject/reopen |
| `actions/fda483.ts` | 2,098 | 483 events, observations, commitments, bulk AI import, signed submit, outcome |
| `actions/findings.ts` | 1,757 | Gap finding lifecycle, close gates, SoD, evidence, RCA authorship |
| `actions/deviations.ts` | 1,363 | Deviation lifecycle, 3-way SoD, signed close, CAPA decision |
| `actions/capas/action-items.ts` | 1,442 | Action plan CRUD, per-person QA review, auto-invalidation |

Six functions exceed what should be a single unit of work. `createCAPA`
(`capas/lifecycle.ts:411`) mixes seven concerns; `signValidation`
(`systems.ts:1997`) mixes nine; `signAndCloseCAPA` (`capas/closure.ts:69`) mixes ten.
These are the seams the extraction cuts along.

### 2.3 Backend — the analysis service

| Property | Value |
|---|---|
| Routers registered | 19 `include_router` calls in `be:app/main.py` |
| Route handlers | 45 decorated, of which **17 are `GET /health`** → 28 functional |
| Models | 1 (`ai_audit_trail`) |
| Business tables | 0 — correct by design |
| Auth | HS256 JWT minted by the Next.js BFF; tenant scope read only from the signed claim |
| Exception handlers | **none** (`be:app/main.py` registers no `@app.exception_handler`) |
| Lint/type checks | configured in `pyproject.toml`, **not installed, never run** |
| Test runner | no pytest; 9 standalone scripts in a bash loop |

The backend's discipline is genuinely good in places — `test_identity.py` asserts the
AI service owns no identity, `test_ai_security.py` asserts RBAC and tenant isolation,
`prompt_guard.py` fences untrusted input, and every AI call is audited with the real
username. The failures are specific and listed in §8.

**Health endpoints outnumber business endpoints 17:11.** Every router exposes an
unauthenticated `GET /health`. That is a deliberate, documented convention
(`be:app/routers/_advisory.py`) but it is worth naming: the endpoint count in any tooling
overstates the API surface by ~60%.

---

## 3. Data model and the state machines

`prisma/schema.prisma`, 2,837 lines, **64 models, 0 enums**. Every enumeration is a
`String` column validated by zod in TypeScript. This is a deliberate convention
(traceable to the SQLite era, `schema.prisma:113-116`) and it is the single largest
structural obstacle to moving rules into a second service.

### 3.1 Why "no enums" blocks the migration

A state machine is currently *the union of*:

1. the value list in TypeScript — e.g. `src/types/capa.ts:9-22`
2. the label map — `src/types/capa.ts:26-33`
3. the display definition — `src/constants/statusTaxonomy.ts:94-101`
4. the transition map inside a server action — e.g. `capas/lifecycle.ts:1052-1060`
5. a zod enum, sometimes
6. a pre-condition function — e.g. `RCA_REVIEW_VALID_STATUS` at `capas/rca-review.ts:75`
7. a client-side interpreter — e.g. `modules/capa/modals/helpers/getNextStep.ts`

A Python service cannot enforce a rule whose vocabulary it cannot read. Every
migration seam below assumes the vocabulary moves to the database first. This is the
highest-leverage change in the whole plan, and it is backwards compatible — promoting
a `String` to an enum in Postgres with a `CHECK`-backed migration is additive.

### 3.2 The state machines (seven, all in `String`)

| Machine | Vocabulary | Definition | Transitions |
|---|---|---|---|
| **CAPA** | `open → in_progress → pending_qa_review → pending_verification → closed`, `+ rejected` | `types/capa.ts:9-22` | `capas/lifecycle.ts:1052-1060` |
| **Finding** | `Open, In Progress, Submitted, Rework, Closed` | `constants/statusTaxonomy.ts:44-50` | `actions/findings.ts` |
| **Deviation** | `open, under_investigation, pending_qa_review, capa_pending, closed, rejected` | `constants/statusTaxonomy.ts:163-170` | `actions/deviations.ts` |
| **ValidationStage** | `not_started, draft, in_progress, in_review, approved, rejected, skipped` (+3 legacy) | `types/csv-csa.ts:52-65` | `actions/systems.ts:168-1852` |
| **ChangeControl** | `Draft, In Review, Approved, In Implementation, Implemented, Closed, Rejected` | `schema.prisma:2423-2424` | `actions/change-control.ts:581` |
| **Ticket** | `New …` | `lib/support/constants.ts:35-47` | `actions/support.ts` |
| **FDA483** | 9 statuses **+ a separate 5-stage `currentStage` axis** | `types/fda483.ts:34-55` | `actions/fda483.ts:1065-1070` |

Two of these already carry the *consequence* of being invisible to the database:

- `status` was deliberately **removed** from `UpdateCAPASchema` (`capas/lifecycle.ts:96-97`)
  and `validationStatus` from `SystemWritableSchema` (`systems.ts:96-100`) to close a
  Part 11 bypass. The API layer had to be the thing that made a field unwritable. That
  is a workaround for the missing constraint, and it is the correct one to keep until
  the constraint exists.
- The Finding status machine **splits authority**: `Submitted` and `Rework` are
  server-only, never client-settable (`constants/statusTaxonomy.ts:71-75`). Any
  migration must preserve that split exactly.

### 3.3 Data integrity the database does *not* currently own

These are business rules living in TypeScript that belong in constraints:

| Rule | Where it lives today | Consequence of the gap |
|---|---|---|
| Reference format + global uniqueness | `@@unique` on 9 models; allocation in TS with a 5-retry `P2002` loop | Cross-tenant collision is a runtime retry, not a constraint |
| `Finding.status` must reach `Closed` only via a signed path | removed from the zod schema | An API client bypassing the UI could still close a finding |
| Stage completion vocabulary | `systems.ts:1852` `COMPLETE_STAGE_STATUSES` | **Already leaked** — see §8.1 |
| `CAPA.diGateStatus` | no canonical list; `fe:src/constants/statusTaxonomy.ts:199-213` flags this as debt | 3 write vocabularies in production: `"pending"` (`fe:src/actions/capas/lifecycle.ts:643`), `"cleared"` (`:1361`), legacy `"open"` (Edit modal). Reader cast accepts all 3 — `fe:src/lib/mappers/capaMapper.ts:161`. **Corrected finding — see note.** |
| `AuditLog` — **zero indexes** | `schema.prisma:2011` | `tenantId`, `module`, `recordId`, `createdAt` all unindexed on the compliance trail's only filter surface |

`AuditLog` having no indexes is the most consequential item in this table. It is the
Part 11 §11.10(d) access trail, the audit-trail screen reads it with filters on all
four columns, and it is the table that grows without bound. Add indexes before, not
after, adding more write volume to it.

> **Correction on `CAPA.diGateStatus` — what the debt actually is.**
>
> The TODO at `fe:src/constants/statusTaxonomy.ts:210-213` claims a *third* read-side
> vocabulary `"Pending" | "Cleared" | "Failed"` at `app/api/capas/route.ts:41`, and
> calls `Failed` "a phantom that NOTHING writes." **Both halves of that comment are
> now wrong, and the file it names has been deleted.** Verified against the tree:
> no `"Failed"` value exists anywhere in `diGateStatus` handling, and the only
> Title-case cast the comment describes is gone with the route.
>
> The real, narrower debt — and it still justifies Seam 0 — is a **three-way write
> split with no canonical list**: `"pending"` on create, `"cleared"` on gate clear,
> legacy `"open"` surviving in the Edit modal's zod enum. The reader cast at
> `capaMapper.ts:161` tolerates all three, so a bad value does not fail loudly; it
> flows through. `capa-readiness.ts:132` treats the DI gate as met only when the value
> is exactly `"cleared"`, so legacy `"open"` correctly reads as not-met — the
> *behaviour* is safe today. The defect is that safety depends on a reader cast being
> permissive about a vocabulary nobody owns.
>
> This is a weaker finding than the original citation implied, and it is recorded as
> such rather than carried forward at the original severity. What survives unchanged
> is the conclusion: `diGateStatus` has no single source of truth, which is the same
> root cause as the `Finding` lowercase-`"closed"` bug the TODO itself references.

### 3.4 The tenancy model

`Tenant` is the root of 51 of 64 models. `Tenant` **doubles as the platform-admin
identity row** — a `super_admin` is a `Tenant` with `role = "super_admin"`, not a
`User`. This single design decision causes a chain of nullability workarounds
throughout the schema: `EmailOTP.tenantId` is nullable, `Ticket.requesterId` "may be a
User.id or a Tenant.id", and `ValidationStage.submittedById` is a bare string with no
FK. It also produces the load-bearing `resolveUserFk` (`src/lib/auth.ts:184-222`), which
is called 206 times in the actions layer to prevent writing a `Tenant.id` into a
`createdById` column that expects a `User.id`.

`resolveUserFk` is not incidental glue. It is the mechanism by which the dual-identity
model is made safe, and it runs 206 times. Any extraction must either carry this
resolution or fix the dual identity first.

**Site scoping is an application convention, not a boundary.** Only one enforcement
point exists: `resolveCreateSiteId` (`src/lib/auth.ts:82-107`) forces non-privileged
roles to their own site **at create time**. There is no read-side site filter. A
site-bound QA Head sees every finding in their tenant. The one enforced site rule is
assignment (`src/lib/queries/findings.ts:60-83`).

**Record visibility is defined but unwired.** `src/lib/permissions/recordVisibility.ts:22-24`
states it verbatim: *"DEFINED but WIRED TO NOTHING."* `Risk`, `ManagementDecision`,
`ChangeControl` and `Ticket` have no visibility filter at all.

---

## 4. Ownership matrix

The core of the document. One row per responsibility class.

| # | Responsibility | Today | Target | Why |
|---|---|---|---|---|
| 1 | Pages, components, UI state, navigation, a11y | Next.js | **Next.js** | Presentation. Correct today. |
| 2 | Display formatting, optimistic UI, UI-level validation | Next.js | **Next.js** | User feedback, not integrity. |
| 3 | AI proxying, AI-token minting, AGI policy enforcement | Next.js | **Next.js (keep)** | Only this app holds the session. The backend has no identity store — this is its correct boundary. |
| 4 | E-signature canonicalisation + content hash | `lib/signing.ts` (789 L) | **Backend (Move)** | Regulated cryptographic evidence. Must be byte-identical forever; see §7.1. |
| 5 | Separation-of-duties evaluation | `capas/sod-override.ts` + 3 variants | **Backend (Move)** | 3 parallel copies of one policy engine with a Critical floor. |
| 6 | The 7 state machines | 7× inside server actions | **Backend (Move)** | Business rules. The DB cannot enforce transitions alone. |
| 7 | Readiness / gate evaluation | `capa-readiness.ts`, `finding-close.ts`, `systems.ts:1934-1972`, `kpi/*` | **Backend (Move)** | Already pure functions — ideal migration payloads. |
| 8 | Reference allocation | 4 independent implementations | **Backend (Consolidate)** | 4 implementations of one sequence algorithm, each with a bespoke retry loop. |
| 9 | Role sets + capability model | `roleSets.ts` (855 L) | **Backend (Move as data)** | Currently enforced per-call-site; a policy service enforces once. |
| 10 | Domain vocabulary (statuses, severities, RCA methods, GAMP 5) | ~12 files under `constants/` + `types/` | **Database → backend → frontend** | §3.1. The prerequisite for 6 and 7. |
| 11 | Authorization enforcement | 154 inline role checks | **Backend (authoritative)** + frontend (UX hint) | Frontend checks are never a security boundary. |
| 12 | Transactions across regulated records | 83 `$transaction` blocks | **Backend (Move)** | Atomicity belongs with the rule that requires it. |
| 13 | Part 11 audit-trail writes | 315 inline `auditLog.create` calls | **Backend (Move)** | Compliance evidence. Moves in the final slice — see §10.3. |
| 14 | Per-record business queries | `src/lib/queries/` | **Backend (Move)** | The frontend must not shape regulated data reads. Now **mandatory per domain**, not deferrable — §10.3. |
| 15 | **Schema definition + migrations** | Prisma (`schema.prisma`, 14 migrations) | **Alembic (Move)** | §9.1 #4/#5. Prisma is removed; the 14 migrations are retained as a non-replayable provenance archive (§10.2). |
| 16 | Reference/display data (regions, frameworks, labels) | `constants/`, `labels/` | **Database** | Shared taxonomy, not code. |
| 17 | AI prompt assembly, RAG, fallbacks | backend | **Backend (keep)** | Already correct. |
| 18 | AI audit trail *data* (`ai_audit_trail`) | backend | **Backend (keep)** | Its own table. Correct. |
| 17b | AI audit trail *schema* | backend startup DDL | **Prisma (move)** | See §1.1. The table's shape is in 9 hand-written `ALTER`s with no migration record. Functional ownership stays; schema authorship moves. |
| 19 | Billing (Razorpay) | Next.js routes | **Backend (Move)** | Money movement, webhook verification, idempotency. Already sequenced in `refactor-pharma-stack.md` Phase 2. |
| 20 | Notification fan-out | `lib/notify.ts` | **Backend (Move)** | Side effect; fault-isolated by contract already. |
| 21 | File storage (S3/local) | Next.js | **Backend (Move)** | Long-term regulated evidence. |
| 22 | **Client-side duplicate of a server rule** | ~15 sites | **Remove after parity** | §8.1. Each is a latent divergence. |
| 23 | Unbounded read queries | `queries/` | **Backend (fix in place)** | §8.2. Not a migration; a fix. |
| 24 | Two "paying customer" models (`Plan` / `SubscriptionPlan`) | `schema.prisma:124` / `:215` | **Backend (Converge)** | Already `refactor-pharma-stack.md` Phase 1. |
| 25 | Session / NextAuth | Next.js | **Next.js (keep)** | The backend has no identity store. Do not move. |

### 4.1 Keep-in-Next.js, stated positively

Rows 1–3 and 25 are not concessions. The AI boundary is genuinely well designed: the
browser holds no credential, `ai-proxy/[...path]/route.ts:125-130` fails closed without
a mintable token, client-supplied `auth` headers are dropped, and `AI_JWT_SECRET` is
never `NEXT_PUBLIC_`. Row 25 is likewise correct — moving NextAuth to a service that
has no user store would be a regression, not an improvement.

The refactoring target is a **three-tier** system, not a two-tier one:

```
Next.js  →  presentation, session, AI proxy, upload/download signing
FastAPI  →  all business rules, all regulated writes, all calculations
Postgres →  vocabulary, constraints, referential integrity
```

### 4.2 Move-as-data vs move-as-code

Rows 9 and 10 are the ones that need care.

- **Row 9 (role sets)** should move as *data* — a table or a declarative config the
  backend serves — not as re-implemented predicates. 855 lines of permission logic
  rewritten in Python is a rewrite of the security model, not a move of it.
- **Row 10 (vocabulary)** should move to the *database* first, then be projected into
  both languages. This is the prerequisite, and §5.0 sequences it first.

---

## 5. Migration seams

Ordered by regulatory risk, cheapest-first. Each is independently shippable and
reversible.

### 5.0 Seam 0 — Foundations *(prerequisite, no behaviour change)*

Three jobs, all of which unblock later seams. Order within the seam matters: the
schema work first, because everything else projects from it.

**(a) Promote the vocabulary.** The 7 state machines and the enumerations that gate
them move from TypeScript `String` arrays into PostgreSQL enums or `CHECK`
constraints, with the TS constants projected from the DB and a guard test asserting
they match.

- **Moves:** nothing yet. Makes seams 1–4 possible.
- **Risk:** low — additive, and the `20260716120000_reconcile_postgres_baseline`
  migration already performs an in-place `enum → TEXT` conversion on `Plan.tier`, so
  the team has done this dance once and the precedent is in the tree.
- **Guard:** the existing `statusTaxonomy.ts` label/display maps stay in the frontend.
  Presentation is not moving.

**(b) Close the second schema authority (§1.1).** Fold `ai_audit_trail` into
`fe:prisma/schema.prisma`, express its 8 added columns plus `audit_id`/`action_type`/
`feature_id`/`record_id`/`username`/`input_data`/`output_data`/`status`/`timestamp`/
`ip_address` as one Prisma migration, reduce `be:app/core/migrations.py` to nothing,
delete it, and remove `Base.metadata.create_all` from the backend lifespan once the
migration has been applied everywhere.

- **Why it is in Seam 0 and not Seam 7:** the most audit-sensitive table in the system
  currently has no migration record, its shape lives in 8 hand-written `ALTER`
  statements, and `prisma db push` would drop it. Every table added to the SQLAlchemy
  mirror multiplies the number of places the schema can be wrong. Fixing this after
  the mirror exists is materially harder than fixing it now.
- **Ordering constraint:** apply the Prisma migration to every environment *before*
  removing the backend DDL, or the backend breaks on boot in the environment that has
  not been migrated. Read-only, additive, reversible.

**(c) Index the audit trail.** Add the four missing `AuditLog` indexes (§3.3)
(`tenantId`, `module`, `recordId`, `createdAt`) before any seam increases write volume
against it.

### 5.1 Seam 1 — E-signature pipeline *(highest regulatory risk)*

`lib/signing.ts` (789 lines, 14 canonicalisers) plus the 6 actions that mint
`SignedRecord` rows.

- **Why first:** it is the most constrained code in the system and the most
  irreversible if it is wrong. Extracting it proves the whole approach on the hardest
  case.
- **Why it is a good first migration:** it is nearly pure. `canonicalize*` is a pure
  function over a small input; `computeContentHash` is SHA-256. No tenant scoping, no
  Prisma dependency in the canonicalisers.
- **The hard part, and it must not be lost:** `signing.ts:479-518` has **three CSV
  sign-off content shapes coexisting under one `recordType`**, distinguished
  structurally by which optional keys are present. Both extra keys are
  *conditionally spread* because `canonicalJson` walks `Object.keys()`, which includes
  explicitly-`undefined` keys and would serialise them as the bare token `undefined` —
  silently changing every historical hash. Any port must reproduce this exactly and
  prove byte-equality against the existing rows.
- **Carried debt to resolve, not inherit:** `verifyFindingClosure` (`signing.ts:661`)
  is marked **⚠️ UNVERIFIED** twice (`:550`, `:643`) — built without DB access, "MUST
  be verified against Postgres before deploy" — and is wired to nothing. It is also
  the drift-verification counterpart to `verifyCSVSignOff`, which *is* wired. Resolve
  it as part of this seam or explicitly defer it with a written decision.
- **Parity test:** for every existing `SignedRecord` row, recompute the hash under the
  Python implementation and assert equality. This is the acceptance criterion, and it
  is checkable because the rows already exist.

### 5.2 Seam 2 — Separation of duties

`capas/sod-override.ts` (515 lines) and its 3 parallel variants (CAPA / Deviation /
Finding). Pure functions over a small input shape, with a tenant flag gate, a
non-waivable Critical floor, a reason code, and a justification length rule. The
result is a `*SODOverride` row plus an audit row.

- **Why:** three copies of one policy already exist. A fourth language makes four.
- **Note:** all four SoD-override tables in the schema are marked ⚠️ UNVERIFIED
  (`schema.prisma:89`, `:532-535`, `:895-899`, `:928-931`).
- **Parity test:** table-driven over the full control × severity × flag matrix,
  asserting the message the gate returns — not just allow/deny. The tenant flag is
  checked *first* specifically so a tenant without the feature never learns it exists
  (`sod-override.ts:69-94`); that ordering is a privacy property, not an
  implementation detail.

### 5.3 Seam 3 — State machines and readiness gates

The 7 machines plus `capa-readiness.ts`, `finding-close.ts`, `systems.ts:1934-1972`
(readiness), `rtm.ts` (`deriveRtmCoverage`).

- **Why:** these are already pure functions. The migration payload is clean, and it
  removes the client-side duplicates listed in §8.1 at the same time.
- **Highest-value single item:** the CSV sign-off's 4 gates
  (`systems.ts:2028-2078`), of which gate 4 (RTM coverage) is *overridable* with a
  ≥20-char reason that is bound into the content hash. That interaction — a waiver
  that changes the signed artifact — is exactly the kind of rule that must live in
  one place.
- **Subtlety to preserve:** `untracedRtmCount` (`systems.ts:1887`) deliberately uses
  the **raw count**, not the rounded percentage, because 199/200 rounds to 100 and
  would slip an untraced requirement. `systems.ts:1883-1886` documents this. A port
  that "cleans it up" reintroduces a regulatory defect.
- **Parity test:** assert the *computed readiness object* from the server, not the
  booleans. `computeReadiness` distinguishes `hardBlockersClear` from `readyToSign`;
  a boolean-equality test would pass while the distinction was lost.

### 5.4 Seam 4 — Read layer

`src/lib/queries/` (3,609 lines) moves behind the backend API. This is the largest
surface and the lowest regulatory risk, but it is **not** the right first move: it
converts a fast in-process call into a network hop on every page, and the read layer
currently has real performance defects (§8.2) that would get harder to diagnose
through a network boundary. Fix those first.

### 5.5 Seam 5 — Write layer (server actions)

The 45 action modules, in domain order: CAPA → Deviation → Finding → CSV/CSA → FDA 483
→ ChangeControl. Per seam, per domain, per action — never all at once.

Recommended order within a domain: read paths → readiness computation → lifecycle
transitions → signing surfaces. Each step is shippable and independently reversible by
reverting the frontend call site to the server action.

### 5.6 Seam 6 — Billing

Already planned in `refactor-pharma-stack.md` Phase 2. This document adds: it must
land *after* seam 0, because money movement needs the DB to enforce its own
invariants, and after seam 1, because the plan is to reuse the canonicalisation
discipline.

### 5.7 Seam 7 — Notifications and file storage

Side-effect surfaces. `notify.ts` is already fault-isolated by contract
(`notify.ts:70-74`), so a partial migration degrades rather than corrupts. File
storage last: it is the longest-lived regulated artifact and the current implementation
already has a documented limitation — `fileStorage.delete()` is a **no-op in both
backends** (`fileStorage.ts:42-45, 124-127`), which is correct for ALCOA+ but must be
preserved deliberately, not accidentally.

### 5.8 Execution order, gates and rollback

§5.0–5.7 says *what* moves. This says *when it may stop*. Every row ships
independently and every row's rollback is a revert of one call site, not a data
restore — that property is the whole reason for cutting along seams instead of
rewriting by module.

| Order | Seam | Ships when | Gate before starting the next | Rollback |
|---|---|---|---|---|
| 1 | **Seam 0a** vocabulary → DB enums | Prisma migration applied in dev + CI | Guard test asserts TS constants match the DB | Revert migration; additive, no data at risk |
| 2 | **Seam 0b** `ai_audit_trail` → Prisma | Migration applied to *every* env **before** backend DDL is removed | `SELECT` on the table succeeds via Prisma in all envs; backend boots with `migrations.py` deleted | Restore backend DDL; revert migration |
| 3 | **Seam 0c** `AuditLog` indexes | Migration applied | `EXPLAIN` on the audit-trail query uses an index | Drop indexes; online, reversible |
| 4 | **§8.1** client-side duplicate fixes | Server values already exist | The three defects in §8.1 have a regression test each | Revert the fix; server was already correct |
| 5 | **§8.3** the two dead AI paths | Import arity fixed | Each endpoint reaches the model **or** reports why not, verified by a test that fails on the `TypeError`/`ImportError` path | Revert |
| 6 | **§8.5** install + run `ruff`/`mypy` | `requirements-dev.txt` updated | Baseline green, or existing debt recorded explicitly | Revert; nothing behavioural |
| 7 | **Seam 1a** canonicalisers only, no endpoint | Parity job over existing `SignedRecord` rows | **100% hash equality.** Any mismatch stops the migration. | Delete the module; nothing called it yet |
| 8 | **Seam 1b** signing endpoint + first call site | 1a parity green | New signatures byte-identical to old; audit rows written | Revert one call site; old code still present |
| 9 | **Seam 2** SoD engine | Seam 1b stable | Full control × severity × flag matrix green, including the flag-off message | Revert call sites |
| 10 | **Seam 3** state machines + readiness | Seam 2 stable | Parity on the **computed readiness object**, not booleans; both sign-off gates 1–4 match | Revert call sites per domain |
| 11 | **Seam 5** write layer, per domain | Seam 3 stable | Per domain: happy path, authz denial, gate refusal, concurrent-conflict (`409`) | Revert call sites per domain |
| 12 | **§8.1b** delete the client duplicates | Seam 5 for that module | UI parity confirmed against the server value | Restore the client expression |
| 13 | **Seam 6** billing | Seams 0–3 done | Plan convergence landed first (§9); money paths tested in a real Postgres | Revert; Razorpay state is external |
| 14 | **§10** ORM handover, per domain, in slice order (§10.3) | Seams 1–3 done for that domain | `fe:prisma/schema.prisma` models for that domain deleted, CI green, §10.5 checklist met | Revert the slice's call sites; model reinstated |

**Two rules that make the table above real:**

1. **No seam advances on a partial parity result.** A hash mismatch in step 7, a gate
   divergence in step 10 — stop. These are regulated records; a "mostly matching"
   result is not a result.
2. **Delete nothing until the replacement has been running.** Steps 7–8 are split
   deliberately: prove the canonicaliser produces identical hashes *before* routing a
   single signature through it. The reverse order is unrecoverable, because
   regenerating a signed record is not a thing you can do.

**The tempting wrong order** is Seam 5 before Seam 3 — "move the actions, then fix the
gates inside them." That produces a faithful copy of a rule that is already wrong in
three places (§8.1), in a new language, with new tests asserting the wrong values. Fix
the rule, then move it.

---

## 6. Target API contracts

Shape, not a full specification. Illustrative Pydantic, following the seam that owns
it.

```python
# Seam 1 — signing
class SignRequest(BaseModel):
    record_id: UUID
    record_type: SignedRecordType
    content: dict           # the *source* content, not a pre-hashed blob
    signature_meaning: str
    override: SodOverrideIn | None = None

class SignResponse(BaseModel):
    signed_record_id: UUID
    content_hash: str       # hex sha256, byte-identical to the TS implementation
    signed_at: datetime

# Seam 3 — readiness. Return the computed object, never a bare boolean.
class SignOffReadiness(BaseModel):
    hard_blockers_clear: bool
    ready_to_sign: bool
    gates: list[GateResult]     # gate id, passed, blocking reason, overridable
    override_available: bool
```

**Rules for every contract in this migration:**

- Explicit request/response models. No `Any` in a response schema — the backend
  currently has 126 `Any` occurrences; the new services should add none.
- `401` unauthenticated · `403` authenticated-but-unauthorized · `404` not found ·
  `409` state conflict · `422` validation. The frontend must be able to distinguish
  "not allowed" from "not ready" — collapsing these is how the current UI ends up with
  a client-side gate that disagrees with the server.
- Every regulated write returns the audit row it wrote, so the client can display the
  trail it just created rather than re-querying for it.
- Optimistic concurrency: `systems.ts:1504-1513` and
  `change-control.ts:760-768` both use `updateMany({status: fromStatus})` as an
  optimistic lock, and the latter throws `STATE_CONFLICT` from *inside* the transaction
  to roll back an already-minted signature. That pattern is correct and non-obvious —
  it must be specified in the contract (`409 Conflict`), not reimplemented per service.

---

## 7. Invariants that must survive any move

These are the properties that make the system defensible. Each is currently enforced
somewhere, sometimes in a comment, sometimes in a test. They become the acceptance
criteria for every seam.

### 7.1 Signature byte-equality

For every `SignedRecord` row, the Python canonicaliser must produce the same hash.
Non-negotiable. Any change to a canonicaliser is a new `recordType`, never an in-place
edit — the code says so at each of the 14 canonicalisers.

### 7.2 Server-only fields stay server-only

`status` on CAPA, `validationStatus` on GxPSystem, `Submitted`/`Rework` on Finding were
removed from their input schemas on purpose. A migration that re-adds them, even to a
service boundary, reintroduces the Part 11 bypass the removal closed.

### 7.3 Authorization is enforced in the backend, and the frontend keeps its hints

Frontend checks stay for UX. They become non-authoritative. The current code already
does this correctly in one place and should be the model: `roleSets.ts:268-270` states
the client permission matrix is "deliberately not the authority because a user can
edit localStorage."

### 7.4 Tenant scope comes from the token, never the body

The AI service already enforces this — `resolve_tenant` reads only the signed claim,
and `test_ai_security.py` asserts a body `customer_id` cannot override it. The
extracted services must inherit this rule exactly.

### 7.5 Transactional integrity of a signed write

A signature and the state change it authorises commit together or not at all. The
`STATE_CONFLICT`-inside-the-transaction pattern (§6) exists precisely to protect this.

### 7.6 Audit on every regulated mutation, including failures

Part 11 §11.10(e) requires the audit record to survive the operation. `ai_trace.py`
already writes on the failure path (`finally`); the compliance trail must match.

### 7.7 No tenant-visible feature without server enforcement

The AGI policy is the worked example: a localStorage Redux slice disabled nothing, so
it became `TenantAgiPolicy` + server enforcement in the proxy. A new agent endpoint
must be added to `AGENT_PATHS` (`permissions/agiPolicy.ts:63-79`) or it is ungoverned.
The same test applies to every new service: *can a client disable or bypass this by
editing localStorage?*

### 7.8 Reference allocation stays globally unique

`reference` is `@@unique` on 9 models and deliberately **global**, not per-tenant.
`capas/lifecycle.ts:572-580` documents why: the uniqueness is global, so allocation
reads globally. Preserve this or you get collisions, not a design improvement.

---

## 8. Prerequisite work

Defects that must be fixed *before* the corresponding seam migrates. Each blocks a
specific move, which is why they are here and not in a bug list.

### 8.1 The vocabulary has already leaked into the client *(blocks seam 3)*

Because the stage-status vocabulary lives only in TypeScript, the client re-derived it
wrongly in three places:

| Site | Expression | Status |
|---|---|---|
| `actions/systems.ts:1852` | `{approved, skipped}` | canonical |
| `modules/csv-csa/SystemDetailPage.tsx:82` | inline equivalent | correct, duplicated |
| `modules/csv-csa/modals/AddActivityModal.tsx:59` | `complete \|\| skipped` | **wrong literal** |
| `modules/csv-csa/tabs/SystemInventoryTab.tsx:48` | `s.status === "complete"` | **dead — `"complete"` is not a `ValidationStageStatus`.** Verified against `types/csv-csa.ts:52-65`. The filter can never match, so the completed-stage KPI is permanently 0. |

`InspectionReadinessCard.tsx:43` recomputes the server's sign-off gate 2 with
`.toLowerCase() !== "closed"` while the server compares case-sensitively against
`"Closed"`. These agree only because `capas/closure.ts:517` currently writes Title
Case. A legacy lowercase value reads as open to the server and closed to the client.

`modules/capa/CAPADetailPage.tsx:132` (the V1 page, still shipping) uses
`complete || skipped` where the canonical set is `{complete, accepted, skipped,
cancelled}` — it drops `accepted`, so a QA-rejected CAPA bounces back to
`in_progress` and renders "Actions 1/2" while `readiness.allMet` is true and Submit is
live. `CAPADetailPageV2.tsx:216-221` documents this exact bug in its own comment.

**This is the empirical case for the entire plan.** These are not hypothetical drift
risks; they are three live divergences, one of them a KPI that can never be non-zero,
all caused by a rule whose home is a TypeScript array. Seam 0 removes the cause.

### 8.2 The read layer has real defects *(fix before seam 4, not during)*

No N+1 remains — every list-to-child resolution is batched. The remaining issues are
unbounded reads:

| Query | Problem |
|---|---|
| `queries/governance.ts:12` `getDocuments` | **entire tenant document table, every column, no `take`**, on every evidence-library load. Worst in the layer. |
| `queries/capas.ts:114` `getCAPAs` | unbounded 3-level include; `getCAPAStats` (`:442`) then filters it 4× in memory |
| `queries/findings.ts:37` `getFindings` | unbounded + full `edits` relation; called twice per dashboard render |
| `queries/dashboard.ts:32-40` | unbounded `fDA483Event` + `inspection.actions` — **on the AI assistant's per-turn path** |
| `queries/evidenceLibrary.ts:97` | 4 unbounded reads **and uncached** |
| `queries/notifications.ts:186` | 9 parallel full-table `count`s per page load |
| `queries/worklist.ts:191` | ~11 round trips, 4 on the same table |

Plus one Prisma read per authenticated request from the NextAuth JWT callback
(`api/auth/[...nextauth]/route.ts:591-592`), which fails **open** on DB error
(`:616-620`) — deliberate, and worth re-confirming as a conscious decision.

### 8.3 Two AI endpoints cannot reach their model *(blocks any claim about AI coverage)*

Both are masked by a broad `except`, so both look healthy in the audit trail.

- `/api/ai/regulatory-assistant`: `regulatory_assistant_service.py:395` imports
  `chat_with_intent` from `app.services.ai_service`. **Verified: `ai_service.py`
  defines only `resolve_with_context`.** The `ImportError` is caught at `:416` and
  falls through to the hardcoded 9-framework table, with `source: "fallback"`.
  `test_ai_grounding.py:147` asserts `not hasattr(ai_service, "chat_with_intent")` —
  **the test passes and the feature is broken.**
- `/api/v1/deviation-intelligence/analyze`: `_ai_cluster` is declared
  `(deviations, trace)` at `deviation_intelligence_router.py:107` and called with one
  argument at `:275`. **`TypeError`, caught at `:276`, deterministic fallback forever.**

This matters for the refactor because it invalidates any test-coverage argument built
on "the AI service degrades gracefully." The degradation is real; two of the paths
never attempt the model.

### 8.4 Provenance is inconsistently stamped *(blocks AI contract design)*

`mark_fallback` is called on the fallback path in **7 of 19 routers**. The other 12
write `status="success"` into the Part 11 AI trail for a deterministic answer.
`document_review_router` and `fda483_extraction_router` never stamp `source` on the
live path at all, and the 7 `/api/ai/*` response models have no `source` field. Three
`source` vocabularies coexist: `"backend"`, `"fallback"`, and `"live"`
(`regulatory_assistant_service.py:413` only).

Consequence: `GET /api/v1/audit/all?status=fallback` is not a reliable census of
degradations, and `<AIBadge>` cannot grey out every non-live answer. Any new AI
contract must fix this — and it must be fixed before the AI surface grows.

### 8.5 Backend quality gates are configured and never run

`pyproject.toml` configures `ruff` and `mypy`. Neither is in `requirements-dev.txt`
and neither is invoked in `.github/workflows/ci.yml`. Both configs are aspirational.
The test runner is a bash loop over 9 standalone scripts — functional, but it means
there is no per-test reporting, no fixture sharing, and no coverage measurement.

Related: the backend registers **zero exception handlers** (`be:app/main.py`). Every
handler raises bare `HTTPException`, so there is no error taxonomy and
`ConfigurationError` / `ServiceUnavailableError` surface as untyped 500s.
`support_triage_router.py:192` does `raise HTTPException(502, f"AI error: {e}")` —
**the raw exception string reaches the client.** `be:app/core/errors.py` defines
`ServiceUnavailableError` and it is raised nowhere.

### 8.6 Signature parity — verified, with one residual *(run 2026-09-30)*

`fe:scripts/verify-signature-parity.ts` answers the question §9.2 #4 was blocking: **does
the current canonicaliser reproduce its own stored hashes?** It reads rows directly via
`node:sqlite` rather than through Prisma, so it survives the ORM's removal and the same
inputs can later be fed to a SQLAlchemy implementation for comparison. It writes
nothing — there is no `INSERT`/`UPDATE`/`DELETE` in the file.

```
npx tsx scripts/verify-signature-parity.ts --db prisma/dev.db.bak
```

Result against the dev database dump:

| Verdict | Count | Attribution |
|---|---|---|
| `MATCH` | **3** | 2 × `DEVIATION_CLOSURE`, 1 × `FDA483_RESPONSE` — computed hashes, reproduced byte-exactly |
| `DRIFT` | 1 | `seed.ts:588` hardcoded literal `9f2c1a7b…` — **fixture, not a signature** |
| `ORPHANED` | 3 | signature attests to a record that does not exist; 2 also carry the seed literal |

**Conclusion: the `DEVIATION_CLOSURE` and `FDA483_RESPONSE` canonicalisers are
self-consistent.** Every genuinely-computed signature reproduces its stored hash, so
"port it faithfully" is a well-defined instruction for both. Blocker §9.2 #4 is
resolved for the Deviation slice.

Three things this run established that a code read could not:

1. **The reconstructibility precondition holds.** `deviations.ts` writes
   `closedDate: closedAt` and `closureNotes` using the *same* values passed to the
   canonicaliser, and `fda483.ts` likewise writes `responseDraft`, `submittedAt` and
   `signatureMeaning` in the signing transaction. That equality is the only reason a
   drift check is possible at all; it is not documented anywhere as a requirement, and
   a future edit that re-derives either value would silently disable verification.
2. **Date round-trip is millisecond-exact.** Prisma stores `DateTime` to SQLite as
   INTEGER unix ms, and `Deviation.closedDate` holds the identical integer to
   `SignedRecord.passwordVerifiedAt`. Had precision been lost, every hash would report
   DRIFT and the check would be unusable.
3. **The harness can actually fail.** It reported 4 non-reproducing rows and was able
   to attribute every one. A checker that returns MATCH unconditionally is worthless;
   this one is demonstrably sensitive.

**Two residuals — both must be closed against a production-shaped export before the
move, not this dump:**

- The run used `prisma/dev.db.bak`, a **dev SQLite backup**. The conclusion is evidence
  about the *code*; it is not a production data attestation. Re-run against a Postgres
  export of the real `SignedRecord` set.
- **One orphaned signature carries a genuinely computed hash** (`83af9422…`) whose
  parent `FDA483Event` is absent. In a dev dump that is likely fixture residue, but the
  same shape against production is a Part 11 retention question: a signature that
  attests to a record nobody can produce. Check it.

**Coverage gap that remains:** `CSV_VALIDATION_SIGNOFF` has **zero rows** in this dump,
so the three-content-versioned canonicaliser at `fe:src/lib/signing.ts:479-518` — the
subtlest code in the file (§7.1) — is **unverified**. It cannot be verified until a
signed CSV system exists. Do not let a green run on this dump be read as covering it.


### 8.7 Separation-of-duties override — decision half verified *(run 2026-09-30)*

`fe:src/actions/capas/sod-override.policy.test.ts` pins the **decision** half of the
single-QA SoD override: the pure `evaluateSodOverride` (CAPA) and
`evaluateDeviationSodOverride` (Deviation) transforms every waivable gate calls. 11
assertions, all passing, now part of `npm run test:unit`.

Verified behaviour:

| Property | Result |
|---|---|
| Flag-OFF returns the gate's **original** message verbatim | confirmed, and it **pre-empts** the Critical/Major ceiling — feature existence is not leaked to tenants without the feature |
| CAPA ceiling = `Critical`, any casing | refused |
| Deviation ceiling = `Critical` **or** `Major`, any casing | refused |
| Justification minimum | 19 chars refused, exactly 20 accepted, **and it is trimmed first** so padding cannot manufacture length |
| Reason code must be one of the three declared | unknown codes refused |

**One finding, recorded as characterisation rather than fixed:** both ceilings are
**fail-open on an unrecognised severity**. `normalizeSeverityForDisplay`
(`fe:src/lib/severity.ts:78-86`) returns `null` for anything outside its taxonomy, and
both engines test equality against a known label, so `null` is not "Critical" and the
block is skipped. Concretely, and asserted by the test:

- the Deviation engine **waives a severity of `"High"`** — not a valid FDA token;
- the CAPA engine **waives a risk of `"Major"`** — not a valid generic token;
- `null`, `""` and whitespace-only also bypass the ceiling.

The two engines use **disjoint vocabularies** (FDA `Critical|Major|Minor` vs generic
`Critical|High|Medium|Low`), so a cross-taxonomy write is the realistic path to
reaching it. This is current behaviour and a port must reproduce it — but it is a
fail-open in a security control, and it is precisely the kind of thing a reviewer
"fixes" silently during a rewrite, converting a documented behaviour into an
undocumented one. **Decision needed: harden, or accept and document.**

**Write half — now also verified, against the local dev database.** `fe:scripts/verify-sod-write-path.ts`
exercises `writeDeviationSodOverride` inside a real Prisma transaction on
`prisma/dev.db`. 6/6 checks pass. The load-bearing two:

```
PASS  ROLLBACK leaves no orphan waiver row    before=0    after=0
PASS  ROLLBACK leaves no orphan audit row      before=853  after=853
```

That is the Part 11 property: a waiver cannot exist without the close it authorises,
and a rolled-back close leaves no trace of it. Every assertion runs inside a
transaction that is rolled back, so the script is re-runnable and leaves the database
byte-for-byte unchanged.

**Two things that had to be true before this could run, and were not:**

1. **The four SoD tables did not exist locally.** `prisma/dev.db` predates the
   migrations that added `CAPASODOverride`, `DeviationSODOverride`,
   `FindingSODOverride` and `SystemStageSODOverride` — all four were ABSENT. The
   single-QA override write path had therefore **never executed against the dev
   database**, which is a large part of why it shipped marked UNVERIFIED.
   `fe:scripts/ensure-sod-tables.mjs` now creates them, additively.
2. **`prisma db push` was not an option.** `migrate diff` against the dev database is
   *not* additive: it would drop `CAPADocument` and `ReadinessCard`, and **rebuild
   `Tenant`, `Site`, `Finding` and `Notification`** — SQLite's copy-and-swap path for
   altering a table, which re-inserts every row. Prisma's `--accept-data-loss` gate was
   correct to refuse. `ensure-sod-tables.mjs` applies only the four `CREATE TABLE`
   statements using Prisma's own generated DDL, and asserts nothing pre-existing moved.

**Also worth knowing for anyone scripting against a server-only module:**
`sod-override.ts`, `aiToken.server.ts`, `mailer.ts` and `otp.ts` all
`import "server-only"`, whose default export **throws** outside a React Server
Component. Any script or test importing one needs `--conditions=react-server`, which
is what makes the package resolve to its no-op entry. The existing `test:unit` runner
does not pass that flag, which is why these modules needed `mock.module` instead.

**Still unverified in §8.8:** `verifyFindingClosure` (unwired), the
`Finding.closureSignatureId` + `FindingSODOverride` migrations, and
`Tenant.sodSingleQAOverride`'s flag-read path. The Deviation SoD path is now the one
fully verified surface.

**A real gap this surfaced, now fixed:** `sod-override.ts`, `aiToken.server.ts`,
`mailer.ts` and `otp.ts` all `import "server-only"`, but **`server-only` was not a
declared dependency** — it resolved only because Next's bundler aliases its internal
copy. The practical cost was that those modules could not be imported outside the
build, which is why they had no unit tests. `server-only@0.0.1` (zero dependencies)
is now a devDependency, so the barrier is gone for every server-only module.

### 8.8 The backend test suite is not hermetic *(pre-existing, found 2026-09-30)*

`be:tests/test_ai_security.py` fails locally on **"drift reports an unrun scan"** —
exit 1, 30/31 pass. **This failure is pre-existing**: proven by moving the new
Deviation files aside and re-running, which reproduced it identically.

Root cause is **local database state, not a code defect**:

| Evidence | Finding |
|---|---|
| `be:glimmora.db` holds 110 `ai_audit_trail` rows | accumulated across previous local runs — it is a persistent file, unlike CI's fresh Postgres |
| 14 of those rows have `customer_id = 'TENANT_WITH_NO_SIGNALS_AT_ALL'` | the exact tenant the failing test asserts is **empty** |
| Re-pointing `DATABASE_URL` at a brand-new empty file fails differently — `no such table: ai_audit_trail` | the test needs the table to exist **and** to be empty for that tenant |

The test mints a token for a sentinel tenant precisely so the scan has nothing to
analyse, and asserts the response carries a `note` rather than presenting an empty
result as clean. That is a good test. It just cannot pass twice against a database
that remembers the first run — and in the polluted state the endpoint returns seeded
`alice@acme.test` alerts instead of the expected empty-plus-note.

**CI is unaffected**: it provisions a fresh Postgres and runs `test_ai_security`
*first* in the module loop, so no other module has written audit rows yet. Locally the
ordering does not save you because the SQLite file persists between runs.

**Consequence for this refactor, and it is not a small one:** the backend suite's
green/red state depends on database state, so a local run is **not** a faithful
simulation of CI. Every future claim of the form "the suite passes" must state which
database it ran against. Fixing this properly means giving each module its own
isolated database, which is a real change to the runner — tracked, not done here.

### 8.9 Mojibake in 19 user-facing strings *(found 2026-09-30)*

While comparing the ported error strings byte-for-byte against the TypeScript
literals, one did not match — and the cause was not the port. The TypeScript source
contains **mojibake**: UTF-8 decoded as CP1252 and re-encoded, producing `â€"` where
an em-dash `—` should be.

Scope, measured:

| Location | Runs | In string literals? |
|---|---|---|
| `fe:src/**` (16 files) | **347** | 328 in comments, **19 in string literals** |
| `fe:app/**` | 0 | — |
| `be:app/**` | 0 | — |

Worst files: `actions/change-control.ts` (49), `actions/capa-comments.ts` (43),
`actions/evidence.ts` (41), `actions/capas/rca-review.ts` (32).

**Why it matters here specifically:** these strings are the user-facing refusal
messages that the Deviation port must reproduce exactly. `CAPA_DEVIATION_LINK_INCONSISTENT`
is one of the four, and the Python port deliberately carries the correct `—` while the
TypeScript carries three mojibake codepoints. Three of the four matched byte-for-byte;
this one differs by exactly that.

**Decision required before the Deviation slice ships:** either
(a) fix the 19 literals in TypeScript first, as its own reviewable change — the
message text is not a regulated artifact, so the risk is cosmetic and the diff is
obvious; or (b) reproduce the mojibake verbatim in Python, which is absurd but is
byte-parity. **Recommendation: (a).** Do not let a port silently normalise user-facing
text, and do not let it silently preserve corruption either — pick one deliberately.

**Not fixed here.** 328 of the 347 are in comments and can be swept in one
encoding-normalisation pass whenever someone wants it; that is a separate change with
its own diff.

### 8.10 Deviation module — moved, tested, wired *(run 2026-09-30)*

The first regulated record is now a working FastAPI module. This is the §5.8
"prove the rule, then move it" sequence, executed in full.

**Backend — `be:app/`**

| Layer | File | What |
|---|---|---|
| Rules | `services/deviation/rules.py` | pure gates, ported from `deviations.ts` |
| Signing | `services/signing.py` | canonical JSON + SHA-256, byte-identical to `signing.ts` |
| Types | `database/types.py` | `PrismaDateTime` — Prisma/SQLAlchemy interop |
| Models | `models/deviation_model.py`, `models/identity_model.py` | SQLAlchemy projection of Prisma's tables |
| Schemas | `schemas/deviation.py` | Pydantic contracts; `status` absent from every write |
| Service | `services/deviation/service.py` | use cases, gate order, one transaction |
| Router | `routers/deviation_router.py` | 5 endpoints, registered in `main.py` |

**Endpoints** (all token-authenticated, tenant scoped from the claim):
`GET /api/v1/deviations` · `GET /{id}` · `POST /{id}/investigation` ·
`POST /{id}/close` · `POST /{id}/reject`

**Frontend — `fe/`**

| File | Role |
|---|---|
| `app/api/deviation/[...path]/route.ts` | BFF: `auth()` gate, mints the service token, drops any client auth header, fails closed 503, validates path segments |
| `src/lib/api/deviation.ts` | the only place the browser talks to the service |

The browser holds **no service credential**. The BFF mints a short-lived token from
the *session* — never from the request body — so a caller cannot escalate by editing
a claim. Verified by `test_ai_security.py`'s existing body-override assertions, which
this path inherits by using the same `get_current_user` dependency.

**Tests — 3 modules, 42 checks, all green**

| Module | Checks | Proves |
|---|---|---|
| `test_deviation_rules.py` | 20 | the gates, incl. the stranded-`capa_pending` recovery and the fail-open ceiling |
| `test_signing_parity.py` | 8 | **the Python canonicaliser reproduces the two real stored `contentHash` values byte-for-byte** |
| `test_deviation_api.py` | 14 | tenant isolation, authz, gate order, atomicity, the hash, SoD, soft delete |

The atomicity check is the one that matters most and is only observable end-to-end: a
closure with a **wrong password writes nothing** — no `SignedRecord` row, no status
flip, no `closedDate`. Same for a refused SoD closure.

**Three bugs the tests caught during the move, all of which would have shipped:**

1. **Column names.** The models were first written with snake_case attributes and
   no explicit names, so SQLAlchemy derived `linked_capa_id` while Prisma created
   `linkedCAPAId`. The test failed on `no such column`, then a scripted comparison
   against `schema.prisma` found two acronym cases a mechanical snake→camel transform
   gets wrong: `sodSingleQAOverride`, `linkedCAPAId`, `previousCAPAId`. All 64 columns
   are now verified against the Prisma schema.
2. **The `Base` was the wrong one.** `create_all` on `app.database.db.Base` creates
   only `ai_audit_trail` — the domain models are on their own `Base` precisely so a
   boot sequence cannot create them (§1.1). The API test creates from the *domain*
   base, which is test scaffolding, not a migration.
3. **`PrismaDateTime`.** Prisma stores SQLite `DateTime` as INTEGER unix ms; raw
   `sqlite3` returns an `int`, and `int.replace(tzinfo=...)` raises. The type decorator
   handles both dialects and reads legacy ISO rows too.

**Not yet done, and deliberately so:** the Next.js `closeDeviation` action is still the
live path. The module is complete and proven behind the BFF, but the frontend call
sites have not been switched over — that is the next unit, and it is the one that
needs a decision about `resolveUserFk`'s 206 call sites, since the service now owns
the FK resolution for this domain.

The gate-by-gate detail, the exact source line for each rule, and the two
deliberately-preserved fail-open behaviours are covered by the module's own
docstrings and asserted in `test_deviation_rules.py`. The signing pipeline is
covered in `test_signing_parity.py`.

### 8.11 Unverified Part 11 machinery - still open

Marked ⚠️ UNVERIFIED in the code, built without DB access:

- `verifyFindingClosure` (`signing.ts:661`) — unwired, "MUST be verified against
  Postgres before deploy"
- all four SoD-override tables (`schema.prisma:89, 532-535, 895-899, 928-931`)
- `Finding.closureSignatureId` + `FindingSODOverride` — migrations
  `20260809140000_add_finding_closure_signature` and
  `20260809160000_add_finding_sod_override` are both marked unapplied/unverified
- `Tenant.sodSingleQAOverride` — the Phase 0 migration notes "no gate reads the flag yet"

**Decision needed:** verify against a real Postgres instance, or explicitly defer
with a written record. Silently carrying these into a new service is the worst
outcome — it makes unverified regulated machinery look migrated.

---

## 9. Decision register

### 9.1 Resolved

| # | Decision | Resolution | Recorded |
|---|---|---|---|
| 1 | Monolith or services? | **One FastAPI application**, internal modules per domain. Not seven services. Both existing services are `instance_count: 1` on one database; services would add network hops without isolation. | 2026-09-30 |
| 2 | Who owns migrations? | **Alembic.** Superseded the same day — see decision 4. During the transition, `prisma migrate deploy` still owns anything not yet handed over. | 2026-09-30 |
| 3 | One database? | **Yes — permanently.** Confirmed. One instance, both repos, no second datastore. | 2026-09-30 |
| 4 | Migrate the Prisma schema to the FastAPI backend? | **Yes. SQLAlchemy models + Alembic own the schema; Prisma is removed entirely.** Supersedes decision 2. See §10. | 2026-09-30 |
| 5 | How is the 14-migration Prisma history carried into Alembic? | **Retain all 14 `.sql` files verbatim as a read-only provenance archive, plus a Postgres-native Alembic baseline; `stamp head` on production; prove replayability in CI by building a fresh database from Alembic and diffing it against production.** The chain cannot be *replayed* — see §10.2. This preserves the history the decision was protecting. | 2026-09-30 |
| 6 | How are historical signature hashes validated? | **Technically resolved; process still owed.** The `DEVIATION_CLOSURE` and `FDA483_RESPONSE` canonicalisers are verified self-consistent — 3/3 genuinely-computed signatures reproduce byte-exactly (§8.6). Two residuals remain and are **not** optional: re-run against a **production-shaped Postgres export**, and adjudicate the one **orphaned** signature carrying a computed hash. `CSV_VALIDATION_SIGNOFF` has no rows anywhere yet, so it stays unverified by definition. **Still owed: a named individual who owns a mismatch**, and the policy that a mismatch stops the migration rather than being patched. | 2026-09-30 (partial) |

### 9.2 Open — recommendation stated, needs a yes before execution

These are recorded so nothing is discovered mid-migration. Each is a yes/no on a
recommendation, not open research.

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| 4 | ~~How are historical signature hashes validated?~~ | Moved to §9.1 #6 — technically resolved, two residuals open. | — |
| 5 | ~~Does the read layer move at all?~~ | **Superseded by §9.1 #4.** It moves, and per-domain alongside the writes — see §10.3. Seam 4 is no longer deferrable. | — |
| 6 | Where does the UI get its capability map? | The backend serves it; the frontend fetches once per session and caches. `roleSets.ts:663-716` already computes a clean module→capabilities shape, so this is a transport change, not a design one. | Seam 3 |
| 7 | One state-machine implementation or seven? | **One generic implementation, seven transition tables as data.** Uniform enough today to justify it, and it makes "add a state" a data change rather than a code change. | Seam 3 |
| 8 | Read-layer definition of "done"? | **Aggregations and readiness-shaped reads only.** Raw list reads stay in Next.js. Removes most of the leak surface at a fraction of the cost. | Seam 4 |
| 9 | Verify or explicitly defer the ⚠️ UNVERIFIED Part 11 machinery? | **Verify before its seam, against a real Postgres instance.** Specifically `verifyFindingClosure` (`fe:src/lib/signing.ts:661`, currently unwired) and the four SoD-override tables. Silently carrying these into a new service is the worst available outcome. | Seams 1–2 |
| 10 | Order of the four `AuditLog` indexes? | Not open, just late — add them in Seam 0, before any seam adds write volume to the trail. | Seam 0 |

### 9.3 Not a decision, but will be asked

- **Do the client-side duplicates (§8.1) get deleted in the same change that fixes
  them, or after?** After. The fix is a server-supplied value; the deletion is a
  cleanup. Same PR as the parity test, different PR from the fix.
- **Who signs off on a parity failure?** Named individual, not a team, because the
  answer is "a regulated record's hash changed" and that needs a person accountable.
- **Does the V1 `CAPADetailPage.tsx` get fixed or deleted?** §8.1 shows it shipping a
  stale done-set. If it is dead, deleting it is the fix; if it is live, it is a bug in
  production. **Answer needed before Seam 0 closes.**

---

## 10. ORM handover: Prisma → SQLAlchemy

**Decision (§9.1 #4):** the schema migrates from Prisma to SQLAlchemy + Alembic and
Prisma is removed. This section is the plan. It supersedes any earlier statement in
this document that Prisma stays.

### 10.1 What is actually being moved

| | |
|---|---|
| `prisma.*` references | **1,047** |
| Call sites | **852** |
| Distinct models touched | **55** of 64 |
| `$transaction` blocks | **90** |
| Files importing `@prisma/client` | **42** |
| Raw SQL (`$queryRaw` / `$executeRaw`) | **0** |

Distribution: 770 references in `fe:src/actions/`, 187 in `fe:src/lib/queries/`, 32 in
`fe:app/api/`, the rest in components and helpers.

Two facts from that table drive everything:

- **Zero raw SQL.** There is no escape hatch today. Every one of the 852 call sites
  depends on the Prisma client DSL, so this is a real ORM-to-ORM port with no place to
  hide difficult queries.
- **770 of 1,047 are in `src/actions/`** — the same code seams 1–5 already move. The
  handover is therefore **not a separate project running in parallel**. It is the
  database half of the same work, and running it *before* the logic moves would put
  two ORMs on the same tables for no benefit.

### 10.2 The migration history cannot be replayed — and what replaces it

You asked for all 14 migrations to be ported into an Alembic chain. Verified against
the tree, that is not executable as stated, and pretending otherwise would put a false
record in a GxP system:

| Fact | Evidence |
|---|---|
| The active chain has **no init** | the 14 folders in `fe:prisma/migrations/` begin at `20260716120000_reconcile_postgres_baseline` |
| Its first statement assumes tables exist | `ALTER TABLE "CAPADocument" DROP CONSTRAINT "CAPADocument_capaId_fkey"` |
| The only `init` is **archived, not in the path** | `fe:prisma/migrations_archive/20260629054845_init` — 8 folders there, all outside the active chain |
| That `init` is **SQLite-flavoured** | 43 `CREATE TABLE`, 46 `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`, 13 `BOOLEAN NOT NULL` |
| The reconcile step exists *because* of that | 20 `CREATE TABLE`, 3 `DROP TABLE`, 24 `ADD COLUMN`, 1 in-place `enum → TEXT` |

A replay of the active chain against an empty Postgres database fails on its first
statement. Recovering the archived `init` does not fix it: replaying SQLite-authored
DDL would reconstruct a *different history* from the one that actually happened. The
reconcile step is the physical record of a SQLite-created schema being transformed to
Postgres, and that cannot be re-executed — it can only be reported.

**What replaces it — both halves of what "faithful" was protecting:**

1. **Provenance (what happened).** All 14 active `.sql` files, plus the 8 archived
   ones, move to a read-only archive — e.g. `fe:prisma/migrations_archive/` with a
   `README` stating they are historical records, are never applied, and why. Untouched,
   in order, with their original names and timestamps.
2. **Reproducibility (how to rebuild).** Alembic gets one Postgres-native baseline
   revision that declares the current schema from the 64 SQLAlchemy models. Production
   is brought onto it with `alembic stamp head` — it is already in that state, so
   nothing executes.
3. **Proof that (1) and (2) agree.** CI builds a **fresh, empty** database from the
   Alembic chain and diffs the result against production's schema. Green means a new
   environment is reproducible from code alone. This is the property the Prisma chain
   never had, and it is worth more than a replay that cannot run.
4. **Forward history is real.** Migrations 2–14 are purely additive and *could* be
   transcribed as real Alembic revisions above the baseline. Recommended only if the
   audit value of a replayable incremental chain is judged to outweigh the risk of
   hand-transcribing 1,047 lines of SQL by hand. **Recommendation: skip.** Once the
   baseline exists, new changes are authored natively in Alembic and are replayable by
   construction.

### 10.3 Ordering — the handover is per-domain, inside the seams

The dangerous version of this plan ports the ORM first and the logic second. That puts
SQLAlchemy writing tables whose reads and rules still live in Next.js, and produces
exactly the two-authority condition §1.1 exists to prevent.

**The rule: a table changes writer when — and only when — its business logic has
already moved.** A vertical slice is the unit:

```
per domain:
  1. business logic + rules  →  FastAPI (seams 1–3)
  2. the writes for it       →  SQLAlchemy
  3. the reads for it        →  FastAPI API  (seam 4, now mandatory, not deferred)
  4. the frontend stops importing Prisma for that domain
  5. its models are removed from fe:prisma/schema.prisma
```

Steps 2 and 3 must be the *same change* per domain. Splitting them leaves a period
where one domain has two writers or two readers, and both are worse than the current
state.

**This makes §9.2 #5 (defer the read layer) obsolete.** Seam 4 can no longer be
deferred: the moment a domain's writes are in SQLAlchemy, its reads cannot stay in
Prisma. It is still worth *sequencing* it per-domain rather than doing all reads at
once, but it is no longer optional.

**Slice order — least regulated first, so toolchain gaps surface without regulatory
risk:**

| Order | Domain | Why here |
|---|---|---|
| 1 | Reference data: `RegulatoryRegion`, `Framework`, `TenantRegion`, `TenantFramework` | No state machine, no signing, no SoD. Proves models + Alembic + API + Prisma removal end-to-end with the smallest possible blast radius. |
| 2 | `Ticket` / support | Real state machine and SLA logic, **no e-signature**. First domain with genuine business rules. |
| 3 | `Notification` | Already fault-isolated; proves error handling across the boundary. |
| 4 | `Risk` + `ManagementDecision` | Introduces polymorphic conversion, so relationship-mapping risk appears. |
| 5 | `GxPSystem` / CSV | First Part 11 signing surface. Do after the signing pipeline is proven (seam 1). |
| 6 | `Deviation` | Signing + 3-way SoD. |
| 7 | `Finding` | Signing + SoD + field-level permission split. |
| 8 | `CAPA` | Largest model (~225 columns), most state, deepest dependencies. Last. |
| 9 | `FDA483`, `ChangeControl`, `Evidence`, `Document`, `AuditLog`, `SignedRecord` | Remainder, each gated by the parity test for its surface. |

`SignedRecord` and `AuditLog` deserve their own note: they are written by *many*
domains, so their writer can only move after the last domain that writes them. Plan
them as the final slice, not as part of any domain above.

### 10.4 Translation risks, ranked

| Risk | Count | Why it is not a syntax change |
|---|---|---|
| **`$transaction` semantics** | 90 blocks | `prisma.$transaction([...])` is an array-of-promises batch; `prisma.$transaction(async (tx) => …)` is an interactive transaction with a different failure model. SQLAlchemy has neither shape natively. |
| **Optimistic locking via `updateMany` count** | see below | `fe:src/actions/systems.ts:1504-1513` and `fe:src/actions/change-control.ts:760-768` depend on the **affected-row count** to detect a lost update — the second throws `STATE_CONFLICT` *from inside* the transaction specifically to roll back an already-minted signature. SQLAlchemy's `rowcount` is the equivalent, and getting it right is load-bearing for §7.5. |
| **Cascade semantics** | 90+ relations | `onDelete: Cascade` vs `SetNull` vs `Restrict` are declared in the Prisma schema and enforced in the *database*. These must be reproduced exactly in the SQLAlchemy models, or records will be silently deleted. |
| **No raw SQL escape hatch** | 852 sites | Complex filters currently expressed in the Prisma DSL have no direct SQLAlchemy equivalent and must be re-expressed, not translated. |
| **Loss of end-to-end type safety** | 42 files | `@prisma/client` types flow into component props today. Removing Prisma means the frontend gets its types from the API contract instead — a real benefit, but it is a contract to design, not a deletion. |
| **`resolveUserFk` dual-identity** | 206 calls | Resolves `Tenant.id` vs `User.id` before writing an actor FK. It is orthogonal to the ORM and must be ported as a service, or the FK violations it prevents will return. |
| **Zero `enum` in the schema** | 64 models | SQLAlchemy `Enum` types must be introduced deliberately during Seam 0a (§5.0a) or the port will hard-code more `String` columns. |

### 10.5 Definition of done for the handover

- [ ] `fe:prisma/schema.prisma` has **zero** models; `@prisma/client` is not a dependency
- [ ] `prisma migrate deploy` is removed from `fe:.do/app.yaml` and from CI
- [ ] The 22 `.sql` files (14 active + 8 archived) are in a read-only archive with a README stating they are never applied
- [ ] A fresh database is built from Alembic alone and diffs clean against production
- [ ] No table has two writers; no domain has two readers
- [ ] `SignedRecord` and `AuditLog` writers are the last to move, after every domain that writes them
- [ ] All 90 transaction blocks have a reviewed SQLAlchemy equivalent
- [ ] Cascade and `SetNull` behaviour verified for every relation against the Prisma source
- [ ] `fe:src/lib/permissions/recordVisibility.ts` site/visibility filters behave identically — they are `where` fragments, not ORM features

---

## Appendix A — Measured reference

| Metric | Frontend | Backend |
|---|---|---|
| Source files | 514 (`fe:src/`) + 81 (`fe:app/`) | 60 (`be:app/`) |
| Source lines | 121,551 + 4,352 | 11,612 |
| Test lines | 1,549 (13 Playwright) | 3,029 (9 scripts) |
| Schema | 2,837 lines, 64 models, 0 enums | 1 model |
| Endpoints | 18 route handlers | 45 handlers (28 functional, 17 health) |
| CI | lint · typecheck · unit · artifacts · build · smoke | 9-module bash loop |
| Lint config | `eslint.config.js` (runs) | `ruff` + `mypy` (**not installed**) |
| Deploy | DO `web`, `instance_count: 1` | DO `api`, `instance_count: 1` |

## Appendix B — Documents that overlap this one

**This repository's `file:line` citations decay.** The stale `statusTaxonomy.ts:210`
→ `app/api/capas/route.ts:41` reference is not an isolated slip: the same failure mode
appears across the docs tree, where code comments, TODO notes and audit write-ups each
point at lines in files that have since been deleted or moved. A citation whose
referent no longer exists is worse than no citation, because it is confidently
readable and silently wrong. When extending this document, re-verify each citation
against the working tree before relying on it — the check is a one-line `Test-Path`.

| Document | Covers | Relationship |
|---|---|---|
| `refactor-analysis.md` | Verified defect list, P0/P1/P2 | This doc references it; do not duplicate |
| `refactor-pharma-stack.md` | Phased delivery plan, Phases 0–6 | This doc adds seams 0–7 and the ownership matrix; reconcile the phase numbering before execution |
| `AI-INTEGRATION.md` | AI feature guide | Partly **stale** — it documents `NEXT_PUBLIC_AI_API_URL`, which `lib/aiAuth.ts:9-12` states must never be reintroduced |
| `MIGRATION-GUIDE.md` | Server-first migration | **Stale** — describes a client-side-SPA starting point that no longer exists, and mojibake in the diagrams |
| `CLAUDE.md` | Architecture rules | Accurate and load-bearing. The AI boundary rules there are correct and should be treated as constraints on any new service |
