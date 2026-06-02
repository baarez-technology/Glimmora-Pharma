# AUDIT — GLOBAL PATTERNS (cross-cutting consistency)

> Read-only reconnaissance. No code/schema/seed changes. Companion to `AUDIT-CSV-CSA-MODULE.md`.
> Method: 5 parallel evidence sweeps (Areas A–E) over `prisma/schema.prisma`, `src/actions/**`, `src/modules/**`, `src/lib/**`, `scripts/**`, plus direct verification of the `AuditLog` model and the `updateCAPA`/`updateSystem` schemas.

## Verdict summary

| Area | Topic | Verdict |
|---|---|---|
| A | Identity & People | 🔴 **RED** |
| B | Regulatory Frameworks | 🟡 **YELLOW** |
| C | Audit Logging | 🟡 **YELLOW** |
| D | Status / Lifecycle Enums | 🔴 **RED** |
| E | Reference Number Generation | 🟡 **YELLOW** |

**Headline counts:** 175 active `auditLog.create` call sites (177 grep hits − 2 commented) across 26 files; ≈35 Prisma models, of which ≈30 carry identity/status/reference columns; 19 distinct audit `module` strings (10 unfilterable in the viewer); 6 status casing conventions; 9 reference patterns from 2 parallel generators.

---

## 1. Area A — Identity & People — 🔴 RED

**Two confirmed latent FK-violation bugs, a duplicated-and-under-applied `resolveUserFk`, name-vs-id display mismatches, and ≥9 overlapping "person" concepts with no shared abstraction.**

**Q-A1 — Inventory.** Identity is stored three incompatible ways across ≈25 models:
- **Real User FK relations** (`@relation` → User): `Deviation.createdById` (schema:438), `Deviation.investigationCompletedById` (:459), `Deviation.capaDecisionById` (:469), `CAPAActionItem.ownerId` (:356), `CAPAActionItem.completedById` (:363), `FDA483Event.internalOwnerId` (:518), `FDA483Commitment.completedById` (:589) / `createdById` (:596), `FDA483CommitmentDocument.uploadedById` (:615).
- **Plain String user-id columns, NO FK** (flagged): `Finding.owner`/`createdBy` (:148,:153), `CAPA.owner`/`createdBy`/`closedBy` + the `*ReviewedById`/`*OverrideById`/`verifiedById` set (:194,:305,:277,:211-285), `CAPAActionItem.createdById` (:369), `ValidationStage.submittedById`/`approvedById`/`rejectedById` (:715-717, intentional per comment), `GxPSystem.createdBy`/`owner`/`signedOffById`/`deletedById` (:641,:640,:680,:660), `FDA483Event.submittedBy`/`createdBy` (:507,:519, store **names**), `SignedRecord.signerId` (:1184), `AuditLog.userId` (:980), `StageDocument.uploadedById` (:753), `CAPAApproval.approverId` (:1239), `CAPAComment.authorId` (:1291), `ChangeControl.*ById` (:1349-1354).
- **Denormalized name caches**: `signedOffByName`, `statusManuallySetByName`, `uploadedByName`, `approverName`, `authorName`, `ownerName`/`createdByName`/`closedByName` (ChangeControl), `SignedRecord.signerName`, `AuditLog.userName`, etc.

**Q-A2 — `resolveUserFk`.** Defined **twice** (independent copies): `src/actions/fda483.ts:273` and `src/actions/systems.ts:1374`. Used in `addCommitment` (fda483.ts:328), `completeCommitment` (fda483.ts:969), `signValidation` (systems.ts:1539). **Writes a real User FK WITHOUT it (latent FK-violation, admin Tenant-id → User FK):**
- `src/actions/deviations.ts:151` `createDeviation` → `createdById: session.user.id` 🔴
- `src/actions/deviations.ts:662` `completeInvestigation` → `investigationCompletedById` 🔴
- `src/actions/deviations.ts:739`/`:784` `saveCAPADecision`/`editCAPADecision` → `capaDecisionById` 🔴
- `src/actions/capas/action-items.ts:316` `connect: { id: session.user.id }` on `completedById` 🔴

**Q-A3 — Display.** `ownerName(id) = users.find(u=>u.id===id)?.name ?? id` is **copy-pasted in ≥10 pages** (DashboardPage:81, DeviationPage:83, GapRegisterTab:128, SystemInventoryTab:73, FDA483Page:396, EvidencePage:397, ReadinessPage:186, …). Consequences: (a) **raw cuid leaks** to UI via the `?? id` fallback when a value is unresolvable; (b) **name-passed-as-id mismatch** — `DeviationPage.tsx:405` calls `ownerName(detectedBy)` but `detectedBy` is a *name* (deviations.ts:145); `ResponseTab.tsx:208` calls `ownerName(submittedBy)` but that's a *name* (fda483.ts:586) — both "work" only by the fallback accident; (c) three different resolution mechanisms coexist (id-lookup, denorm column, Prisma join `completedByUser.name`); (d) inconsistent labels ("Owner:" / "Owner" / "Detected by" / "Closed by" / "by" / "Signed off by"). Email is **not** leaked to UI (only `SignedRecord.signerEmail`, immutable, auth-only).

**Q-A4 — Session.** `app/api/auth/[...nextauth]/route.ts`: admins (`super_admin`/`customer_admin`) authenticate against the **Tenant** table and get `session.user.id = tenant.id` (:276-286); site users authenticate against **User** and get `id = user.id` (:437-446). So **`session.user.id` is a Tenant id for admins, a User id otherwise** — the root cause of every Q-A2 bug. `src/lib/auth.ts` projects `{id,name,email,role,tenantId,gxpSignatory}` but **omits `siteId`/`orgId`**, so server actions can't site-scope via the session.

**Q-A5 — Semantics.** ≥9 concepts (Creator, Owner, Reporter/Detector, Investigator, Approver, Reviewer, Verifier, Signer, Submitter, Completer, Closer, Deleter) with inconsistent backing — the same logical "owner" is a User FK in `CAPAActionItem.ownerId`, a plain id-string in `Finding.owner`/`CAPA.owner`/`GxPSystem.owner`, and a name in `Deviation.detectedBy`. `Deviation.detectedBy` (name) is **not** the same concept as FDA483's `leadInvestigator` (external inspector name) or `internalOwnerId` (User FK). No shared type/helper/component.

---

## 2. Area B — Regulatory Frameworks — 🟡 YELLOW

**Type-level enums are centralized; clause-level regulation references are uncontrolled free-text with no registry.**

**Q-B1 — Schema fields:** `GxPSystem.part11Status`/`annex11Status` (`String @default("N/A")`, :631-632), `gamp5Category` (`String @default("4")`, :634), `gxpScope` (:638), `gxpRelevance` (:630), ICH-Q9 risk quad `patientSafetyRisk`/`productQualityImpact`/`regulatoryExposure`/`diImpact` (:645-648), `signedOffPart11Compliant`/`signedOffAnnex11Compliant` (Boolean, :681-682), `Finding.framework` (:146, stores a framework *key*), `FDA483Observation.regulation` (:556, free text), `RTMEntry.ursRegulation` (:771, free text).

**Q-B2 — Enums.** Canonical TS types in `src/types/csv-csa.ts`: `ComplianceStatus` (:36), `GAMP5Category` (:37), `GxPRelevance` (:26). **But:** (1) the action layer does **not** enforce them — `systems.ts:71-72` types `part11Status`/`annex11Status` as `z.string().optional()`; Prisma columns are plain `String`. (2) **Out-of-type value "Partial"** is documented as stored (`systems.ts:1380`) yet absent from `ComplianceStatus` → falls through every badge map to `undefined`. (3) **No runtime const** backs the type — ≈10 sites compare hardcoded `"Compliant"`/`"Non-Compliant"` literals. (4) GAMP category labels duplicated verbatim across `AddSystemModal.tsx:116`, `EditSystemModal.tsx:118`, `RiskControlsPanel.tsx:212`.

**Q-B3 — Free-text.** ≈131 occurrences of `21 CFR|Annex 11|GAMP|ICH Q|211.` across 47 files. Framework *toggles* are typed keys (`FrameworksTab.tsx:20-30`: p210/p11/annex11/annex15/ichq9/ichq10/gamp5/who/mhra). Clause-level refs are **freeform** everywhere: `FDA483Observation.regulation`, `RTMEntry.ursRegulation`, `Finding.requirement`, and seed values like `"21 CFR 211.68"` (seed.ts:298-529).

**Q-B4 — Hardcoded text** mostly correctly static (LoginPage trust badge, FrameworksTab help, tooltips). Exception: `AddObservationModal.tsx:22-33` `REGULATION_OPTIONS` is a second, **divergent** regulation taxonomy vs `FrameworksTab.FRAMEWORKS` (each lists frameworks the other omits).

**Q-B5 — Linkage.** **No Regulation/Framework/Clause table exists** (zero `model Regulation|Framework|Clause`). FDA483 → regulation = free string; Finding → framework key (clause unstructured in `requirement`); RTM → free string. **CAPA has no regulation field at all** — it inherits context only transitively via `findingId`/`deviationId`/source observation, each ending in a free-text field.

---

## 3. Area C — Audit Logging — 🟡 YELLOW

**Broad coverage (175 sites) with role+timestamp captured, but three inspection-defense gaps: `userId` omitted on ~54% of writes, module-string fragmentation hides 10/19 strings from the viewer filter, and the schema lacks `entityType`/signature-link/hash while the UI claims tamper-evidence it doesn't implement.**

**Q-C1/C4 — Payload.** Every call is an inline literal `data:{}` (no shared builder beyond `logAuditAction`/`auditAuthEvent`). `tenantId` always present; `userName`+`userRole` near-always present (role **is** captured explicitly). **`userId` omitted on ~96/179 blocks (~54%)** — e.g. `systems.ts:192`, `lifecycle.ts:218` (CAPA_CREATED), `findings.ts:140`, `settings.ts:66`, all of `inspections.ts`/`raid.ts`/`capa-comments.ts`/`rtm.ts`/`effectiveness-criteria.ts`. `oldValue`/`newValue` inconsistent (many writes set only `newValue`; values mix raw scalars and `JSON.stringify` blobs). `ipAddress` only ever set by the auth path (`auditServer.ts`); every business mutation leaves it null.

**Q-C2 — Module strings (19 distinct).** Inline: `CSV/CSA`(24), `FDA 483`(19), `CAPA`(13), `Deviation Management`(12), `Inspection Readiness`(9), `Settings`(6), `Governance`(5), `Gap Assessment`(5), `Admin`(5), `Evidence & Documents`(4), `AGI Console`(1), `auth`(1). Const-defined: `CSV / Validation` (STAGE_DOC_AUDIT_MODULE, systems.ts:45 — written at :855,:956), `CAPA / Discussion|Alignment|Approvals|RCA Review|Verification|Action Items|Effectiveness|Evidence`. Viewer filter `AuditTrailPage.tsx:27-40` uses **strict equality** (:198) and offers only 12 options → **10 of 19 strings are unfilterable**, including the e-signature module `CAPA / Approvals` (where `SIGNING_PASSWORD_FAILED` lands), `auth`, and the `CSV / Validation` split. The `"CSV/CSA"` vs `"CSV / Validation"` split is **confirmed** (systems.ts:45 vs the 24 inline `"CSV/CSA"`).

**Q-C3 — Action types.** Predominantly `SCREAMING_SNAKE_CASE` past tense, **freeform literals at each call site** (no central enum). The viewer hardcodes severity `Set`s (`AuditTrailPage.tsx:52-80`) and substring action-group matching (:89-99) — two uncoordinated taxonomies; e.g. filtering "Signed" misses `STAGE_APPROVED`.

**Q-C5 — Model** (verified, schema:977-993): `id, tenantId, userId?, userName, userRole?, module, action, recordId?, recordTitle?, oldValue?, newValue?, ipAddress?, createdAt`. **Missing:** `entityType` (records keyed only by cuid + human title), an FK to `SignedRecord` (linkage is an informal `(recordType,recordId)` pair, schema:1170), and any content-hash/chain column. The UI advertises "SHA-256 chained · Tamper-evident / Append-only" (`AuditTrailPage.tsx:283,523`) but the hash block is disabled with a comment that the model "does not currently carry a content-hash column" (:527-529) — an **overclaim**. No DB-level append-only enforcement (seed even `deleteMany`s logs).

---

## 4. Area D — Status / Lifecycle Enums — 🔴 RED

**Six casing conventions (one model internally self-contradictory) AND generic `updateX` actions that accept `status: z.string()` and bypass the guarded state machines.**

**Q-D1 — Inventory.** All statuses are `String` columns (no Prisma enums; SQLite-portability choice). SoT types scattered: `src/types/capa.ts` (`CAPA_STATUS_VALUES`), `src/types/fda483.ts` (`EventStatus`/`ObservationStatus`/`CommitmentStatus`), `src/types/csv-csa.ts` (`ValidationStatus`/`ValidationStageStatus`/`ComplianceStatus`/link statuses), `src/constants/statusTaxonomy.ts` (Finding/Deviation/Readiness UI-meta), `src/lib/change-control-constants.ts`, `src/lib/capa-alignment.ts`. Many models have **no SoT** (Inspection, Simulation, RoadmapActivity, Document, Subscription, ReadinessCard).

**Q-D2 — Casing (RED driver #1).** Title Case (`GxPSystem.validationStatus`, all FDA483, RAID, Readiness, Simulation, RoadmapActivity) · snake_case (`ValidationStage`, `CAPA`, `Deviation`, `CAPAActionItem`, `ReadinessCard`) · UPPER_SNAKE (`EvidenceItem`) · kebab-case (`GxPSystem.remediationStatus`) · bare lowercase (`Inspection`, `Document`). **`Finding.status` is internally inconsistent**: schema default `"Open"` (:147), `createFinding` writes `"open"` (findings.ts:121), `closeFinding` writes `"closed"` (:248), but `updateFinding`'s enum is Title-Case `["Open","In Progress","Closed"]` (:46) — created findings can't transition cleanly, and the taxonomy carries both cases as duplicate keys to paper over it. Cross-module code survives only via defensive `.toLowerCase()` (e.g. systems.ts:1424).

**Q-D3 — Auto-derive.** Only `GxPSystem.validationStatus` is auto-derived (`deriveValidationStatus`, systems.ts:155-167; `syncValidationStatus` respects `statusManuallySet`/`signedOffAt`). Every other status is stored-and-set explicitly. "Overdue" (CAPA, Commitment, Readiness) is computed-on-read display-only.

**Q-D4 — Manual attestation.** The `statusManuallySet`/`statusManualReason`/`statusManuallySetAt`/`statusManuallySetByName` quad is **unique to GxPSystem** (schema:663-666). Other override fields exist (CAPA alignment/RCA override, RAID reopen) but none gate an auto-derive.

**Q-D5 — State-machine bypass (RED driver #2).**
- ✅ **Gold standard:** `transitionChangeControlStatus` (change-control.ts:521) — explicit `ALLOWED_TRANSITIONS` map (:61-69), per-transition role gates, optimistic lock (`updateMany where status=fromStatus`), Part 11 signing; `updateChangeControl` omits status. `ValidationStage` submit/approve are guarded (systems.ts preconditions).
- 🔴 **`updateCAPA`** (lifecycle.ts:62) `status: z.string().optional()` → writes any string (:379-386). The entire Part 11 CAPA lifecycle (RCA approval → alignment → DI gate → QA review → independent verification → signed closure) is **circumventable** by posting `{status:"closed"}`. No protected-status set.
- 🔴 **`updateSystem`** (systems.ts:75) carries `validationStatus: z.string().optional()` → overwrites the auto-derived status with any string, with **no** `statusManuallySet`/reason/actor provenance.
- 🔴 **`updateObservation`** (fda483.ts:649) arbitrary status string.
- 🟡 **`updateDeviation`** (deviations.ts:57) blocks `closed`/`rejected` (PROTECTED_DEVIATION_STATUSES) but accepts any *other* arbitrary string. `updateCommitment` enum-validates + blocks direct `"Complete"`. `updateFinding` enum-validates (but Title-Case mismatch, Q-D2). `updateRoadmapActivity` (systems.ts:715) unvalidated.

---

## 5. Area E — Reference Number Generation — 🟡 YELLOW

**Race-safe and canonical-site-code-correct, but two parallel generators produce 9 inconsistent formats, with duplicated logic and inconsistent UI styling.**

**Q-E1 — Helpers.** `src/lib/reference.ts` (pure): `generateReference` (:30, `<prefix>-<YEAR>-<NNN>`, **max+1**, 3-digit), `isReferenceConflict` (:55, P2002 on `reference`), `buildReferencePrefix` (:71), `deriveSiteCode` (:85, NFKD→first-3-letters→pad "X", **fallback only**). Sequence = **max+1** (not count — documented anti-deadlock rationale, :21-28). Race handling = caller runs the find inside `$transaction` + a **5-attempt P2002 retry loop**; `reference` is globally `@unique`. **Local allocators bypassing the shared helper:** `nextSystemReference` (systems.ts:129, `SYS-<SITE>-<NNNN>`, 4-digit, no year) and `nextRtmReference` (rtm.ts:76, `URS-<SITE>-<NNNN>`, 4-digit, no year).

**Q-E2 — Format table.**

| Model | Pattern | Site | Year | Width | Generator | When |
|---|---|---|---|---|---|---|
| GxPSystem | `SYS-<SITE>-<NNNN>` | ✅ | ❌ | **4** | local `nextSystemReference` | create |
| CAPA | `CAPA-<SITE>-<YEAR>-<NNN>` | ✅ | ✅ | 3 | `generateReference` | create |
| Deviation | `DEV-<SITE>-<YEAR>-<NNN>` | ✅ | ✅ | 3 | `generateReference` | create |
| Finding | `FND-<SITE>-<YEAR>-<NNN>` | ✅ | ✅ | 3 | `generateReference` | create |
| FDA483Event | **user free-text** `referenceNumber` | — | — | — | **none** | user-typed |
| FDA483Observation | `483-<SITE>-<YEAR>-<NNN>` | ✅ | ✅ | 3 | `generateReference` | create |
| FDA483Commitment | `COMM-<SITE>-<YEAR>-<NNN>` | ✅ | ✅ | 3 | `generateReference` | create |
| RTMEntry | `URS-<SITE>-<NNNN>` | ✅ | ❌ | **4** | local `nextRtmReference` | create |
| ChangeControl | `CC-<YEAR>-<NNN>` | ❌ | ✅ | 3 | `generateReference` | create |

Drift: 3-vs-4 digit; year-vs-no-year; ChangeControl has **no site segment**; FDA483Event reference is **not generated**.

**Q-E3 — Site code.** **`Site.code` is canonical** (schema:62-74, per-tenant `@@unique`, immutable-once-used) — every create reads `site.code` first; `deriveSiteCode(name)` is a fallback only. The spec's "first 3 letters of name → CHN" is **wrong** (canonical codes are CHN/MUM/BLR/HYD on the column). **Fallback divergence:** System/RTM fall back to name-derived `deriveSiteCode`; the 5 `generateReference` callers fall back to the *legacy 2-segment* format (`DEV-2026-001`) → a misconfigured site yields different shapes per module. `deriveSiteCode` collisions (two "San…" sites → "SAN") are unhandled but only matter in the fallback path.

**Q-E4 — Display.** Inconsistent: only **Deviation** references are brand-colored (DeviationPage.tsx:356); CAPA/Finding/ChangeControl use `text-primary`; FDA483 event uses a different typographic style (`text-[18px] tabular-nums`, no `font-mono`, EventsTab.tsx:387). Graceful `reference ?? id.slice(0,8)` fallback is consistent. References reach the audit CSV indirectly via `recordTitle`.

**Q-E5 — Backfills (idempotent).** `backfill-references.ts` (Dev/CAPA/Finding/483Obs/CC, 3-digit), `backfill-system-references.ts` (SYS, 4-digit), `backfill-rtm-references.ts` (URS, 4-digit), `backfill-csv-fks.ts` (FK migrate, no ref), `backfill-stale-stage-status.ts` (stage status, no ref). All filter `reference:null`/seed counters → idempotent. **Logic duplicated** (deriveSiteCode + format reimplemented in scripts rather than imported) → drift risk.

---

## 6. Cross-Area Themes

- **T1 — "id vs name vs denorm" representation chaos** (A+C+E): identity is sometimes a User FK, sometimes a plain id-string, sometimes a name; audit rows lean on `userName` not `userId`; references fall back to raw cuid. The same value type is never represented one way.
- **T2 — Types exist, runtime single-source-of-truth doesn't** (B+C+D): `ComplianceStatus`/`CAPAStatus`/action names/module strings have TS types or are conceptually fixed, but call sites use **duplicated string literals** with no backing const array — so drift ("Partial", `CSV / Validation`, casing) creeps in unchecked.
- **T3 — Generic `updateX` defeats guarded workflows** (D, overlapping A): `updateCAPA`/`updateSystem`/`updateObservation`/`updateDeviation` accept arbitrary `status` and (in the deviation/CAPA cases) also write identity without `resolveUserFk`. The same generic mutators are the weak point for both state-machine integrity and FK integrity.
- **T4 — Local copies instead of shared helpers** (A+C+E): `resolveUserFk` ×2, `deriveSiteCode`/reference allocators ×3, `ownerName()` ×10, ad-hoc audit payloads ×175. Copy-paste is the meta-pattern producing every other divergence.
- **T5 — Server-gating inconsistency** (A+D): Rung 3A/CAPA gates landed, but many `updateX`/identity-write paths remain `requireAuth()`-only, so UI hiding is the only guard on several mutations.

---

## 7. Top 15 Findings (ranked by severity)

| # | Title | Sev | Area | file:line | Fix (hrs) | Rung scope |
|---|---|---|---|---|---|---|
| 1 | `updateCAPA` accepts arbitrary `status` → entire Part 11 CAPA lifecycle bypassable (skip RCA/alignment/DI/verify/signed closure) | **Critical** | D | lifecycle.ts:62,379-386 | 4–8 | medium |
| 2 | Latent FK-violation: `session.user.id` (Tenant id for admins) written into User FKs without `resolveUserFk` | **Critical** | A | deviations.ts:151,662,739,784; capas/action-items.ts:316 | 4–6 | medium |
| 3 | `updateSystem` `validationStatus: z.string()` bypasses auto-derive + attestation provenance | **High** | D | systems.ts:75,324 | 2–3 | small |
| 4 | `updateObservation` / `updateDeviation` accept arbitrary status strings (Deviation guards only closed/rejected) | **High** | D | fda483.ts:649; deviations.ts:57 | 3–5 | medium |
| 5 | `userId` omitted on ~54% of audit writes → attribution by name-string only (weak inspection defense) | **High** | C | systems.ts:192; lifecycle.ts:218; findings.ts:140; settings.ts:66; inspections/raid/rtm/capa-comments | 4–6 | medium |
| 6 | 10/19 audit module strings unfilterable in viewer (incl. e-sig `CAPA / Approvals`, `auth`, `CSV / Validation` split) | **High** | C | AuditTrailPage.tsx:27-40,198; systems.ts:45 | 3–5 | small→medium |
| 7 | Audit tamper-evidence **overclaim**: UI says "SHA-256 chained / append-only" but model has no hash, no FK to SignedRecord, no entityType, no append-only enforcement | **High** | C | AuditTrailPage.tsx:283,527-529; schema:977-993 | varies | multi-rung (or fix UI copy now: 1h) |
| 8 | `Finding.status` internally inconsistent (default "Open" vs writes "open" vs updateFinding enum Title-Case) → can't transition created findings | **High** | D | findings.ts:46,121,248; schema:147 | 2–4 | small |
| 9 | Status casing chaos — 6 conventions across modules; forces defensive `.toLowerCase()` | **Medium** | D | schema (many); statusTaxonomy.ts | 8–20 (migration) | large/multi-rung |
| 10 | `resolveUserFk` duplicated & under-applied; ≥9 overlapping "person" concepts, no shared type/helper | **Medium** | A | fda483.ts:273; systems.ts:1374 | 3–5 (helper) | small (helper) → multi-rung (model) |
| 11 | Identity display drift: `ownerName()` ×10, raw-cuid leak via `?? id`, name-as-id bugs (`detectedBy`, `submittedBy`), inconsistent labels | **Medium** | A | DeviationPage.tsx:405; ResponseTab.tsx:208; +10 copies | 4–8 | medium |
| 12 | Two parallel reference generators (3-digit+year vs 4-digit no-year); ChangeControl no site segment; FDA483Event ref ungenerated; fallback divergence | **Medium** | E | reference.ts:30; systems.ts:129; rtm.ts:76; change-control.ts:352 | 6–12 | medium→large |
| 13 | No Regulation/Framework registry; clause refs free-text everywhere; 2 divergent reg taxonomies | **Medium** | B | FDA483Observation.regulation schema:556; FrameworksTab.tsx:20 vs AddObservationModal.tsx:22 | 8–16 (feature) | large/multi-rung |
| 14 | `part11Status`/`annex11Status` unvalidated `String` with out-of-type "Partial"; no runtime const backing `ComplianceStatus`; GAMP labels duplicated ×3 | **Medium** | B | systems.ts:71-72,1380; csv-csa.ts:36; AddSystemModal.tsx:116 | 2–4 | small |
| 15 | Reference UI styling inconsistent (only Deviation brand-amber; FDA483 different type); reference logic duplicated in backfill scripts | **Low** | E | DeviationPage.tsx:356; CAPATrackerTab.tsx:156; EventsTab.tsx:387 | 2–4 | small |

---

## 8. Confidence

| Area | Confidence | Basis |
|---|---|---|
| A | **High** | FK-violation pattern corroborates a prior-rung observation ("latent in deviations.ts, flagged not fixed"); session dual-resolution read directly. |
| B | **High–Medium** | Schema + type files read directly; the "131 occurrences"/taxonomy-divergence are agent grep counts (medium). |
| C | **Medium–High** | `AuditLog` model + the CSV/CSA split verified directly by me; the **~54% `userId`-omission** figure and 175 count are agent-derived estimates (medium — order-of-magnitude trustworthy, exact % not hand-verified). |
| D | **High** | `updateCAPA` (`status: z.string().optional()`) and `updateSystem` (`validationStatus: z.string().optional()`) schemas seen directly in prior rungs this session; casing inconsistency independently known. |
| E | **High** | `reference.ts`, `nextSystemReference`, `nextRtmReference`, `Site.code`, backfill scripts all read/authored in prior rungs. |

---

## 9. Reasonable Doubts

- **Exact percentages** (the ~54% `userId` omission; "131 occurrences") are agent counts, not each-line hand-verified. Treat as strong estimates, not audited totals.
- **`updateCAPA`/`updateObservation` "fully bypassable"** assumes the action's own role gate doesn't already constrain who can call it — I confirmed the *status* is unvalidated, but did not exhaustively characterize each action's role gate. The bypass is of the *transition graph*, not necessarily of authn. Worth a focused check before the fix rung.
- **`ChangeControl` audit `module` string** — Agent C noted its `auditLog.create` calls had no inline `module: "..."` literal match; it may use a const (or be genuinely missing). Verify before acting on Finding #6.
- Several status fields' **full value sets** are "others unconfirmed" (Document, Inspection, Simulation, RoadmapActivity, Subscription) — low-traffic models not exhaustively enumerated.
- Whether the **name-as-id** display cases (`detectedBy`, `submittedBy`) ever surface a wrong value depends on data; today they "work" by fallback, so impact is latent, not observed.

---

## 10. Open Questions for Product Owner

1. **Admin authorship model:** should Tenant-row logins (`super_admin`/`customer_admin`) be allowed to *author/own* records at all, or always act through a real User identity? This determines whether Finding #2 is fixed by `resolveUserFk` (null the FK for admins) or by a deeper identity redesign.
2. **Audit tamper-evidence claim:** is "SHA-256 chained · append-only" a near-term commitment, or should the UI copy be corrected now? Shipping a compliance claim the schema doesn't back is itself a regulatory risk (Finding #7).
3. **Canonical status casing:** standardize storage on one convention (snake_case + a display map is the lowest-risk)? This is a cross-module data migration — confirm appetite (Finding #9).
4. **State-machine enforcement:** which roles (if any) may set a status *directly* vs only through guarded transitions? Should `updateX` actions strip `status` entirely (ChangeControl model) and force all transitions through dedicated actions?
5. **Regulation registry:** do you want structured clause references (a `Regulation`/`Clause` table with typed links from Findings/Observations/CAPAs), or is free-text acceptable for now (Finding #13)?
6. **Reference format unification:** converge on one pattern (e.g. `<MOD>-<SITE>-<YEAR>-<NNNN>` everywhere) or keep per-module formats? Any change must preserve existing references (additive only). Does `FDA483Event.referenceNumber` intentionally stay user-typed?
7. **`userId` backfill:** should historical audit rows missing `userId` be backfilled where the actor is derivable, or only fixed going forward?

---

*End of report. Read-only — no code, schema, seed, or migration changes were made.*
