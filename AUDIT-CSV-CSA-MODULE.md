# CSV/CSA Module — Full Audit (read-only reconnaissance)

> Scope: documentation only. No code/schema/seed changes were made. Solutioning is a
> separate rung. Findings below are grounded in code with `file:line` references; the
> Confidence / Reasonable Doubts / Open Questions sections at the end disclose what was
> verified vs inferred.
>
> Date of audit: 2026-05-31. Module dir confirmed: `src/modules/csv-csa/`.

---

## 1. File Inventory

### 1a. Module files (`src/modules/csv-csa/`)

| Path | Lines | Purpose |
|---|---|---|
| `CSVPage.tsx` | 552 | Orchestrator: owns all local UI state (tabs, drawer, filters, modal flags), wires queries→tabs→server actions. |
| `tabs/SystemInventoryTab.tsx` | 264 | System inventory table + KPI tiles + filters; row → detail drawer; edit/delete affordances. |
| `tabs/CSVRoadmapTab.tsx` | 176 | Validation roadmap timeline grouped by system; per-activity "Complete". |
| `tabs/RTMTab.tsx` | 324 | Requirements Traceability Matrix: system selector, KPI tiles, table, detail panel, Add Requirement modal, CSV export. |
| `tabs/SystemDetailTab.tsx` | 191 | Detail header card + 4 inner tabs (Overview / Risk Assessment / Validation Lifecycle / Data Integrity). |
| `detail/OverviewPanel.tsx` | 39 | Read-only overview (intended use, GxP scope, critical functions, system info grid). |
| `detail/RiskControlsPanel.tsx` | 229 | Risk classification (4 levels), risk factors, compliance badges — inline editors. |
| `detail/ValidationPanel.tsx` | 763 | The richest tab: 7 stage cards (URS/FS/DS/IQ/OQ/PQ/RTR), upload/submit/approve/reject/skip, dual-track progress. |
| `detail/DIAuditPanel.tsx` | 211 | Data Integrity tab: derived audit-trail/e-sig/DI-gate panels, remediation editor, linked findings/CAPAs. |
| `modals/AddSystemModal.tsx` | 264 | Create GxP system (react-hook-form + zod). 23 form keys. |
| `modals/EditSystemModal.tsx` | 248 | Edit system — duplicates AddSystemModal's schema + layout. |
| `modals/AddActivityModal.tsx` | 130 | Add roadmap activity (RHF + zod). |

Module subtotal: ~3,391 lines, 12 files.

### 1b. CSV/CSA files outside the module dir

| Path | Lines | Purpose |
|---|---|---|
| `src/actions/systems.ts` | 704 | Server actions: system CRUD, stage lifecycle, stage documents, roadmap. |
| `src/actions/rtm.ts` | 118 | Server actions: RTM entry create/update. |
| `src/lib/queries/systems.ts` | 77 | `getSystems` / `getSystem` / `getSystemsStats` / `getRTMStats`. |
| `src/types/csv-csa.ts` | 390 | Types + enums + `adaptPrismaSystem` adapter. |

> Note: `inspections.ts`, `evidence.ts`, `fda483.ts`, `governance.ts` were surfaced by a
> broad search but are **not** CSV/CSA-specific (other modules). The CSV/CSA data layer is
> exactly `systems.ts` + `rtm.ts` + `queries/systems.ts`. There is **no Redux slice** for
> CSV/CSA domain data (the csv/systems/rtm slices were deleted; data is server-fetched and
> passed as props).

Shared components used: `ui/{Badge,Button,Dropdown,Modal,Popup}`, `shared/{PageHeader,StatCard,TabBar,NoSitesPopup}`, plus the file-upload path to `/api/stage-documents/{id}`.

### 1c. Page routes

| Path | Lines | Renders |
|---|---|---|
| `app/(app)/csv-csa/page.tsx` | 23 | Server component: fetches systems + stats + RTM stats, renders `CSVPage`. |
| `app/(app)/csv-csa/loading.tsx` | 22 | Loading skeleton. |
| `app/(app)/csv-csa/error.tsx` | 18 | Error boundary. |

---

## 2. Schema Entities

Five models, `prisma/schema.prisma` lines ~612–736. SQLite provider; all status/type fields are `String` (no enums). Child models inherit tenant scope via `systemId → GxPSystem.tenantId`.

### GxPSystem (612–638)
`id`, `tenantId*` (FK→Tenant, cascade), `name*`, `type*`, `vendor?`, `version?`, `gxpRelevance*`=`"Major"`, `part11Status*`=`"N/A"`, `annex11Status*`=`"N/A"`, `gamp5Category*`=`"4"`, `validationStatus*`=`"Not Started"`, `riskLevel*`=`"MEDIUM"`, `siteId?` (soft FK, no relation), `intendedUse?`, `gxpScope?`, `plannedActions?`, `owner?` (stores a **userId string**, no FK), `createdBy*` (stores a **name string**), `createdAt`, `updatedAt`. Relations: `validationStages[]`, `rtmEntries[]`, `roadmapActivities[]`. **No `@unique`/`@index`. No human-readable reference column.**

### ValidationStage (640–657)
`id`, `systemId*` (FK→GxPSystem cascade), `stageName*`, `status*`=`"not_started"`, `notes?`, `submittedBy?`/`approvedBy?`/`rejectedBy?` (name strings), `submittedDate?`/`approvedDate?`, `rejectionReason?`, timestamps. Relation: `documents[]`.

### StageDocument (665–694) — Part 11 evidence
`id`, `tenantId*`, `validationStageId*` (FK cascade), `fileName*`, `originalFileName*`, `fileSize*` (Int), `fileType*`, `fileUrl*`, `contentHashSha256*`, `retainUntil*` (upload+7y), `deletedAt?`/`deletedById?`/`deletedByName?`/`deletionReason?` (soft-delete, §11.10(e)), `uploadedById*`/`uploadedByName*`, `uploadedAt`. Indexes on `validationStageId`, `(tenantId, uploadedAt)`, `deletedAt`. **`uploadedById`/`deletedById` are plain `String` — no `@relation` to User.**

### RTMEntry (696–720)
`id`, `systemId*` (FK cascade), `ursId*`, `ursRequirement*`, `ursRegulation?`, `ursPriority*`=`"high"`, `fsReference?`/`fsStatus*`=`"missing"`, `dsReference?`/`dsStatus*`=`"na"`, `iqTestId?`/`iqResult?`, `oqTestId?`/`oqResult?`, `pqTestId?`/`pqResult?`, `evidenceStatus*`=`"missing"`, `traceabilityStatus*`=`"broken"`, `linkedFindingId?` (bare String, no FK, no UI to set), timestamps.

### RoadmapActivity (722–736)
`id`, `systemId*` (FK cascade), `title*`, `type*`, `status*`=`"Planned"`, `startDate?`/`endDate?`, `owner?` (name string), `completionType?`, timestamps.

### Cross-module join tables
**None.** All cross-module linkage is soft: `RTMEntry.linkedFindingId` (string, unused), and Finding/CAPA→system links live on the *other* side as string fields (`Finding.linkedSystemId`, CAPA name/id matches) resolved in-memory. No `@relation` between CSV models and CAPA/Finding/FDA483/User/Site.

---

## 3. UI Structure

### Module-level navigation (`CSVPage.tsx:40-44`, TabBar at `:420`)
Three top tabs via local `useState<TabId>` (`:110`): **System Inventory** · **CSV Roadmap** · **RTM**. No URL state, no deep-linking anywhere in the module.

### Detail view — non-routed hand-rolled drawer
The system detail is a right-sliding **drawer** rendered inline (`CSVPage.tsx:460-522`, `fixed inset-0 z-50`), **not** the shared `Modal` and **not** a route. Opened by setting `detailDrawerOpen` + `selectedSystemId` (`:112-113`). It embeds `SystemDetailTab` with **4 inner tabs** (state `detailTab`, `CSVPage.tsx:111`):

| Tab | Panel | Interactivity |
|---|---|---|
| Overview | `OverviewPanel` | **Read-only.** Typically near-empty: `criticalFunctions` hardcoded `""` (`csv-csa.ts:249`), `gxpScope` often blank. |
| Risk Assessment | `RiskControlsPanel` | Inline editors for 4 risk levels + risk factors — but **saves don't persist** (see §6). Risk levels always recompute from `gxpRelevance` (never read from DB). |
| Validation Lifecycle | `ValidationPanel` | **Highly interactive** — the real workhorse. 7 stage cards, upload/submit/approve/reject/skip, dual-track progress, next-review + planned-actions editors. |
| Data Integrity | `DIAuditPanel` | Derived status panels + remediation editor (**non-persisting**) + linked findings/CAPAs (**empty in practice**). |

### Add System modal — field inventory (`AddSystemModal.tsx`)
**23 form keys** across 4 visual sections. Required (`*`): name, type, vendor, version, siteId, owner, gxpRelevance, riskLevel, gamp5Category, validationStatus, intendedUse. Optional: part11Status, annex11Status, lastValidated, nextReview, gxpScope, criticalFunctions, riskFactors, plannedActions. **Derived/pre-filled:** the 4 ICH-Q9 risk classifications (`patientSafetyRisk`, `productQualityImpact`, `regulatoryExposure`, `diImpact`) auto-set from `gxpRelevance` via an effect (`:77-84`); `nextReview` auto-derived from `validationStatus` (`:88-92`). Site field is **hidden** when `lockedSiteId` is set but still submitted.

**Orphaned fields** — collected but dropped on submit (`onAddSave` forwards only 10 fields, `CSVPage.tsx:194-207`):
- **Fully orphaned (no Prisma column, never displayed from DB):** `patientSafetyRisk`, `productQualityImpact`, `regulatoryExposure`, `diImpact`, `criticalFunctions`, `riskFactors`, `lastValidated`, `nextReview`.
- **Orphaned-on-create (Prisma column exists, but Add doesn't send it):** `part11Status`, `annex11Status`, `validationStatus` (server also hard-overrides `validationStatus → "Not Started"`, `systems.ts:83`), `plannedActions`.
- The owner field is required but renders **no validation error** (`AddSystemModal.tsx:132-135`).

### Edit System modal (`EditSystemModal.tsx`)
Separate component (not a reuse) that **duplicates** `systemSchema` and the layout. Persists only the same 10 fields (`onEditSave`, `CSVPage.tsx:217-244`); the richer fields render and pre-fill but **silently no-op on save** (explicit comment `:219-223`).

### Sub-modals
- **Add Requirement (RTM)** — inline `<Modal>` (`RTMTab.tsx:306-319`): URS ID, Requirement, Regulation, Priority. Hand-rolled `useState` form.
- **Add Activity** — `AddActivityModal.tsx`: system, title, type (filtered to incomplete stages), status, start, end, owner. **`status` is dropped on save** (`CSVPage.tsx:252`).
- **Stage lifecycle** (in `ValidationPanel`): Approve (e-sig attestation, no fields), Reject (reason), Skip (reason, DS-only in UI), upload (hidden file input), Remove document (reason ≥10 chars, soft-delete). Reject/Skip/Remove are hand-rolled `useState` forms.

---

## 4. Data Flow & Server Actions

### `src/actions/systems.ts`
| Action | Signature | Tenant scope | Role/SoD | Audit (`module`/`action`) |
|---|---|---|---|---|
| `createSystem` | `(input: CreateSystemSchema): ActionResult` | session.tenantId (top-level) | **none** | `CSV/CSA` / `SYSTEM_CREATED` |
| `updateSystem` | `(id, input: Partial<...>): ActionResult` | `where{id,tenantId}` | **none** | `CSV/CSA` / `SYSTEM_UPDATED` |
| `deleteSystem` | `(id): ActionResult` — **hard delete, cascades** | `where{id,tenantId}` | **none** | `CSV/CSA` / `SYSTEM_DELETED` |
| `submitStageForReview` | `(stageId)` | relation pre-check | none | `STAGE_SUBMITTED_FOR_REVIEW` |
| `approveStage` | `(stageId)` | relation pre-check | **qa_head/super_admin** | `STAGE_APPROVED` |
| `rejectStage` | `(stageId, reason)` | relation pre-check | **qa_head/super_admin** | `STAGE_REJECTED` |
| `skipStage` | `(stageId, reason)` | relation pre-check | **qa_head/super_admin** (server does NOT enforce DS-only) | `STAGE_SKIPPED` |
| `updateStageNotes` | `(stageId, notes)` — raw string | relation pre-check | none | `STAGE_NOTES_UPDATED` |
| `addRoadmapActivity` | `(input)` | **`assertTenantOwnsParent`** | none | `ROADMAP_ACTIVITY_ADDED` |
| `updateRoadmapActivity` | `(id, status)` — raw string | relation pre-check | none | `ROADMAP_ACTIVITY_UPDATED` |
| `addStageDocument` | `(formData)` — sha256, MIME whitelist, size cap, stage-lock | `loadStageScoped` | none | **`CSV / Validation`** / `STAGE_DOCUMENT_UPLOADED` |
| `removeStageDocument` | `(documentId, {reason≥10})` — soft-delete | scoped | none | **`CSV / Validation`** / `STAGE_DOCUMENT_SOFT_DELETED` |

### `src/actions/rtm.ts`
| Action | Signature | Tenant scope | Role | Audit |
|---|---|---|---|---|
| `createRTMEntry` | `(input: CreateRTMSchema)` | `assertTenantOwnsParent` | none | `CSV/CSA` / `RTM_ENTRY_CREATED` |
| `updateRTMEntry` | `(id, input: UpdateRTMSchema)` | relation pre-check | none | `CSV/CSA` / `RTM_ENTRY_UPDATED` — **NO UI calls this** |

### Queries (`src/lib/queries/systems.ts`)
- `getSystems(tenantId)` / `getSystem(id, tenantId)` — same include tree: `validationStages → documents(active only)`, `rtmEntries`, `roadmapActivities`. Caller supplies tenantId (no internal `requireAuth`).
- `getSystemsStats(tenantId)` / `getRTMStats(tenantId)` — derived counts from `getSystems`.

### Status / "validated" logic
`GxPSystem.validationStatus` is a **stored, manually-set string** — never auto-derived from stage completion. `approveStage` updates only `ValidationStage.status`, never the parent. The headline "Validated" KPI counts `validationStatus === "Validated"` directly, so it can diverge from actual stage state. RTM `traceabilityStatus` is likewise stored, not derived from iq/oq/pq results.

---

## 5. Integration with Other Modules

| Target | Direction | Mechanism | Quality |
|---|---|---|---|
| **CAPA** | other→CSV | In-memory match in `DIAuditPanel` (`findingId`/`linkedSystemId`/name); no FK | **Effectively dead** — `useTenantData()` returns empty arrays on the CSV page (CAPAs/findings never fetched/hydrated server-side; only Gap/CAPA pages populate Redux). `RTMEntry.linkedCAPAId` is type-only (no column). |
| **Gap/Findings** | other→CSV | `Finding.linkedSystemId` string on the Finding side; `RTMEntry.linkedFindingId` bare string | **Half-wired** — same empty-Redux issue; `linkedFindingId` has no UI to set and only routes to `/gap-assessment` (no deep-link). |
| **FDA 483** | — | — | **No integration** either direction. |
| **Audit Trail** | CSV→audit | `auditLog.create` | **Working, but module-string split**: most actions log `"CSV/CSA"`; stage-doc actions log `"CSV / Validation"`, which is **absent from the audit-trail module filter** (`AuditTrailPage.tsx:33`) → stage-doc events not filterable. |
| **Sites** | CSV→Sites | `GxPSystem.siteId` nullable soft FK (no relation) | Working but **optional server-side** (`siteId: z.string().optional()`) despite the UI marking it required; no tenant-ownership check on the site. |
| **Users** | CSV→Users | **String references, no FK**: `owner` holds a userId-string, `createdBy` holds a name-string | Inconsistent identity representation; no referential integrity; **no "validation lead" field** (stage permission is role-only). |

---

## 6. Known Code Deficiencies

1. **Inline "Save" buttons that don't persist (audit-log-only).** `handleSaveRiskFactors` (`CSVPage.tsx:265-271`), `handleSaveRiskClassification` (`:377-382`), `handleSaveNextReview` (`:371-375`), `handleSaveRemediation` (`:384-394`) call `auditLog()` + set local state but **never write the DB** (the columns don't exist). Success popups claim persistence ("Risk factors saved … Visible in inspector review", "Remediation details saved …", `CSVPage.tsx:532,536`) — false after `router.refresh()`.
2. **Massive orphaned-field surface.** Add System collects 23 keys; 10 persist; 8 have **no Prisma column at all**. Adapter hardcodes `criticalFunctions:""`/`riskFactors:""` (`csv-csa.ts:249-250`).
3. **`validationStatus` decoupled from stages** — manual string, never auto-derived (`systems.ts:83,121`); KPI "Validated" can be wrong. `handleSaveStage` (`CSVPage.tsx:284-324`) even computes "allDone" against status values (`"complete"`) the server never writes (it writes `"approved"`/`"skipped"`) — and is orphaned (its `onSaveStage` prop is explicitly discarded, `ValidationPanel.tsx:108-110`).
4. **`updateRTMEntry` is dead code** (`rtm.ts:80-118`) — no component imports it. RTM rows are frozen at create-time `evidenceStatus:"missing"`/`traceabilityStatus:"broken"` forever; IQ/OQ/PQ results can never be edited.
5. **No server-side SoD on system/RTM/roadmap mutations.** `createSystem`/`updateSystem`/`deleteSystem`/`addRoadmapActivity`/`updateRoadmapActivity`/`createRTMEntry`/`updateRTMEntry` have **only `requireAuth()`** — a `viewer` can mutate via direct action call; UI-only button hiding (`isViewOnly`, `RTMTab.canEdit`) is the sole gate. (Stage approve/reject/skip *do* gate to qa_head/super_admin.)
6. **`deleteSystem` is a hard delete with no role gate** (`systems.ts:263-285`) that cascades and destroys all ValidationStage/StageDocument/RTM/roadmap rows — directly contradicting the Part 11 soft-delete discipline applied to `StageDocument`.
7. **`updateSystem` has no zod validation** — takes `Partial<...>` straight into `prisma.update` (`systems.ts:115-123`). `updateStageNotes`/`updateRoadmapActivity` take raw unvalidated strings.
8. **Duplicated code:** `systemSchema` verbatim in both AddSystemModal and EditSystemModal; `SYS_ICONS` map duplicated across inventory + detail tabs.
9. **Pattern divergence from refined modules:** no reference-number generation (`buildReferencePrefix`/`generateReference` absent — RTM shows the raw cuid, `RTMTab.tsx:222`); no status state machine (stage transitions are unconditional — `approveStage` doesn't require `in_review` first); mixed tenant-scope styles (`assertTenantOwnsParent` in newer actions, ad-hoc `findFirst` in stage actions, bare `where{id,tenantId}` in update/delete); hand-rolled `useState` modals (RTM/reject/skip) vs RHF+zod elsewhere; audit `module` string split.
10. **DOM-read theming** (`document.documentElement.getAttribute("data-theme")`) in `SystemDetailTab.tsx:102` + `ValidationPanel.tsx:118` instead of the Redux theme selector — not SSR-safe.
11. **Dead migration leftover:** `CSVPage.tsx:139-146` reads a removed `location.state` (always null) — the deep-link-to-system-on-mount feature is gone.
12. **Stale comments:** `types/csv-csa.ts:229` "StageDocument arrays (no Prisma model yet)" (model now exists); `ValidationPanel.tsx:110` "stage saves now use dispatch directly" (no Redux dispatch remains); several "UI-only state until schema is extended" markers.

### Auth FK / `session.user.id` check (the commitments-class bug)
`GxPSystem` stores **no User FK** (`createdBy`=name, `owner`=userId-string but plain `String`), so the **crash-class bug does NOT occur** on the system record. The only `session.user.id → *ById` writes are on `StageDocument`: `uploadedById` (`systems.ts:582`) and `deletedById` (`:672`), plus `AuditLog.userId` (`:590,:681`). **These columns are plain `String`/`String?` with no `@relation` to User** — so they will **not throw an FK violation today**. However: (a) they carry user-id semantics and may hold a **Tenant id** for super_admin/customer_admin sessions; (b) the self-delete permission gate compares `doc.uploadedById === session.user.id` (`ValidationPanel.tsx:296`) — an id/identity mismatch would silently break that authorization. Worth verifying `session.user.id` always resolves to a real `User.id` (it does **not** for Tenant-row logins — see the commitments fix).

---

## 7. Usability Findings

Framed as "user wants X, but has to Y":

1. **User wants to record risk factors / risk classification / next-review / remediation, but the Save button lies** — it shows a success popup yet the data vanishes on refresh (`CSVPage.tsx:265-271,371-394`).
2. **User wants the create form they filled to stick, but ~half the fields are silently discarded** — Part 11 status, Annex 11, validation status, all 4 risk classifications, critical functions, risk factors, dates are dropped on submit (`CSVPage.tsx:194-207`).
3. **User wants "Validated" to mean the stages are done, but it's a manual dropdown** decoupled from the 7 stages (`systems.ts:83,121`) — they can approve all stages and the system still reads "Not Started", or mark "Validated" with zero evidence.
4. **User wants to update an RTM row's IQ/OQ/PQ test results, but there is no edit affordance** — `updateRTMEntry` exists but nothing calls it (`rtm.ts:80`); every RTM row is stuck "broken/missing".
5. **User wants to see findings/CAPAs against a system in the detail drawer, but the lists are empty** unless they happened to visit the Gap/CAPA pages earlier in the same session (`DIAuditPanel` ← empty `useTenantData`).
6. **User wants to deep-link or refresh on a system's detail, but the detail is a non-routed drawer** (`CSVPage.tsx:460`) — refresh drops them back to the inventory; no shareable URL.
7. **User wants to filter the audit trail to CSV/CSA and see document uploads, but stage-doc events are filed under a different module string** (`"CSV / Validation"`) absent from the filter (`AuditTrailPage.tsx:33`).
8. **User wants to set an activity's status when adding a roadmap activity, but the Status dropdown is ignored** on save (`CSVPage.tsx:252`).
9. **User wants the Overview tab to summarize the system, but it usually shows "Not documented"** — critical functions are hardcoded empty and GxP scope is often blank (`OverviewPanel.tsx:21`, `csv-csa.ts:249`).
10. **User wants an inline error when they skip the required Owner field, but none appears** (`AddSystemModal.tsx:132-135`).
11. **User wants the Risk Assessment tab to reflect their chosen risk levels, but it always recomputes from GxP relevance** — the 4 levels are never read from the DB (`RiskControlsPanel.tsx:45-46`).
12. **A viewer (read-only) user wants to be blocked from editing, but the server lets them** — only the buttons are hidden; the actions accept any authenticated role (`systems.ts` create/update/delete).
13. **User wants a stable, human-readable RTM/requirement id, but the UI shows a raw cuid** (`RTMTab.tsx:222`).
14. **QA wants "only the DS stage may be skipped," but the server lets any stage be skipped** with a reason (`systems.ts:291`; UI restricts DS-only at `ValidationPanel.tsx:586`, server doesn't).
15. **User wants a deleted system to be recoverable/auditable, but Delete is a hard cascade** that wipes stages, documents, RTM, and roadmap (`systems.ts:263`).

---

## 8. Inspection Defensibility Assessment ("Inspection-Ready by Design")

| Inspector question | Answerable in <30s? | Where / what's missing |
|---|---|---|
| **Q1: Is this GxP system validated?** | ⚠️ **Partially / unreliable** | Inventory + detail show a `validationStatus` badge, but it's a manual string decoupled from stage completion (`systems.ts:83,121`). A "Validated" badge may not match the actual 7-stage state, and vice-versa. Not defensible without manual cross-check. |
| **Q2: Show me the evidence.** | ✅ **Yes (this is the strong point)** | Validation Lifecycle tab → per-stage StageDocument list with download, SHA-256 integrity, 7-year retention, soft-delete (`ValidationPanel` + `StageDocument` model). The one genuinely inspection-grade surface. |
| **Q3: Show me the RTM for this system.** | ⚠️ **Partial** | RTM tab renders URS→FS→DS→IQ→OQ→PQ columns, but rows can't be updated post-create (`updateRTMEntry` dead), so coverage is frozen at "broken/missing"; `evidenceStatus`/`traceabilityStatus` don't reflect reality. |
| **Q4: Who signed off on stage X?** | ✅ **Yes** | Stage cards show `approvedBy`/`approvedDate`; approve is role-gated (qa_head/super_admin) and audit-logged (`systems.ts:197-208`). Caveat: actor stored as **name string**, not a verifiable User FK / e-signature ledger entry. |
| **Q5: When was the last requalification?** | ❌ **No** | `lastValidated` and `nextReview` are **not persisted** (no Prisma columns); the inventory "Next review" column and the editable next-review field are UI-only (`csv-csa.ts` omits them; `CSVPage.tsx:371-375`). The data shown is never saved. |
| **Q6: What findings/CAPAs against this system, and resolution?** | ❌ **No** | Linked findings/CAPAs lists are empty on the CSV page (not fetched server-side), the links are soft string/name matches with no FK, and they only route to the module index (no specific record / resolution shown). |

Net: **2 of 6 reliably answerable** (Q2, Q4), 2 partial (Q1, Q3), 2 not answerable (Q5, Q6).

---

## 9. Screenshot vs Code Reconciliation

> I could not view the image pixels; this reconciles the **described** screenshot contents against the code.

- **Image 1/2 (Add GxP System modal):** Matches code — System Identity + Risk & Compliance Classification + System Detail + Risk & Validation Plan sections all present (`AddSystemModal.tsx`). **Caveat shipped-but-broken:** the Risk & Compliance fields and risk classifications visible in the modal are largely **dropped on save** — what the screenshot shows the user entering is not what persists.
- **Image 3 (Overview tab):** Matches `OverviewPanel.tsx`, but expect "Not documented" for Critical functions (hardcoded empty) on real data.
- **Image 4 (Risk Assessment tab):** Matches `RiskControlsPanel.tsx`; the risk levels shown are recomputed from GxP relevance, not stored values, and edits don't persist.
- **Image 5/6 (Validation Lifecycle — URS/FS/DS/IQ/OQ/PQ + RTR/status/planned actions/roadmap):** Matches `ValidationPanel.tsx` (the richest, most real surface). "Status" + "planned actions" + "roadmap activities" all present; planned actions **does** persist, next-review **does not**.
- **Image 7 (Data Integrity tab):** Matches `DIAuditPanel.tsx`; linked findings/CAPAs will be empty, remediation editor non-persisting.
- **Image 8 (CSV Roadmap):** Matches `CSVRoadmapTab.tsx`.
- **Image 9 (RTM empty state + stat tiles):** Matches `RTMTab.tsx` (4 StatCards, empty table). Consistent with RTM being create-only.
- **Image 10 (Add Requirement modal):** Matches the inline modal (`RTMTab.tsx:306-319`): URS ID / Requirement / Regulation / Priority.

**WIP / half-built signals in code:** the audit-log-only inline editors, the dead `updateRTMEntry`, the orphaned `handleSaveStage`, the dead `location.state` effect, and multiple "UI-only state until schema is extended" comments all indicate the module was shipped **UI-first with the persistence layer deferred**.

---

## 10. Top 10 Findings Ranked by Severity

### 1. Inline "Save" actions silently don't persist (false success popups) — **Critical**
Risk factors, risk classification, next-review date, and remediation details show "saved" toasts but only write an audit log + local state; data is lost on refresh. **Impact:** inspectors/users believe documented risk + remediation + requalification data exists when it doesn't — an integrity/defensibility failure and a trust hazard. **`CSVPage.tsx:265-271, 371-394`** (popups `:532,536`). Effort: ~6-10h (add columns + wire updates) — *fix deferred to redesign rung*.

### 2. "Validated" status is a manual string decoupled from stage completion — **Critical**
`validationStatus` is set by hand and never derived from the 7 stages; the headline KPI and badge can contradict actual evidence. **Impact:** the module's core claim ("is this validated?") is unreliable — direct regulatory risk. **`systems.ts:83,121`**, KPI `queries/systems.ts:59`. Effort: ~4-6h.

### 3. ~Half of Add/Edit System fields are dropped on save — **High**
8 fields have no Prisma column (risk classifications, critical functions, risk factors, last-validated, next-review) and 4 more are dropped on create. **Impact:** data-entry effort is wasted; Overview/Risk tabs show empty; Q5 (requalification) unanswerable. **`CSVPage.tsx:194-207,217-244`**, `csv-csa.ts:249-250`. Effort: ~8-12h.

### 4. No server-side role/SoD enforcement on system/RTM/roadmap mutations — **High**
`create/update/deleteSystem`, RTM, and roadmap actions only `requireAuth()`; a viewer can mutate by calling the action directly. **Impact:** broken access control / Part 11 segregation-of-duties gap; only the UI hides buttons. **`systems.ts:70,115,263,392,440`; `rtm.ts:34,80`**. Effort: ~3-5h.

### 5. `deleteSystem` is an ungated hard cascade delete — **High**
No role gate, no soft-delete; cascades and destroys ValidationStage + StageDocument + RTM + roadmap rows. **Impact:** irrecoverable loss of Part 11 validation evidence; contradicts the StageDocument soft-delete discipline. **`systems.ts:263-285`** (cascades via `schema.prisma:655,719,735`). Effort: ~3-4h.

### 6. RTM is create-only — `updateRTMEntry` is dead code — **High**
No UI calls `updateRTMEntry`; rows are frozen at "broken/missing". **Impact:** the RTM (Q3) never reflects real IQ/OQ/PQ coverage — an inspection artifact that is structurally inaccurate. **`rtm.ts:80-118`**, `RTMTab.tsx:11`. Effort: ~4-6h.

### 7. Findings/CAPA integration is effectively dead on the CSV page — **High**
Linked findings/CAPAs come from Redux that the CSV route never hydrates; lists are empty on load, links are soft name/string matches with no FK and no deep-link. **Impact:** Q6 unanswerable; no traceability between systems and their findings/remediations. **`CSVPage.tsx:88-95`, `DIAuditPanel.tsx:66-76,170-208`**; `RTMEntry.linkedFindingId` unused. Effort: ~6-10h.

### 8. Requalification dates (`lastValidated`/`nextReview`) are never persisted — **Medium**
Shown in inventory + editable in the detail, but no Prisma columns; UI-only. **Impact:** Q5 ("last requalification?") unanswerable; "Review overdue" badges are computed from data that isn't stored. **`csv-csa.ts` (omits both), `CSVPage.tsx:371-375`**. Effort: ~2-4h.

### 9. Audit module-string split hides stage-document events — **Medium**
Stage-doc actions log `"CSV / Validation"`; everything else (and the audit-trail filter) uses `"CSV/CSA"`. **Impact:** upload/delete-evidence events (the Part-11-critical ones) are invisible when filtering the audit trail to CSV/CSA. **`systems.ts:37,593,683`; `AuditTrailPage.tsx:33`**. Effort: ~1h.

### 10. Detail view is a non-routed, hand-rolled drawer — **Medium**
No URL state for selected system or inner tab; not the shared `Modal`; refresh/deep-link impossible. **Impact:** no shareable links for inspectors/reviewers; inconsistent with other modules; dead migration leftover (`CSVPage.tsx:139-146`). **`CSVPage.tsx:460-522`**. Effort: ~4-8h.

> Honorable mentions (Low): duplicated `systemSchema`/`SYS_ICONS`; missing zod on `updateSystem`; no reference-number generation (raw cuids); DOM-read theming; status-taxonomy mismatch (`"complete"` vs `"approved"`); owner-field missing inline error; server doesn't enforce DS-only skip.

---

## Confidence

- **Verified in code (high confidence):** entire File Inventory; all 5 schema models + fields; every server-action signature, tenant-scope, role gate, and audit string; the orphaned-field set and the `onAddSave`/`onEditSave` payloads; the audit-log-only (non-persisting) inline handlers (I read `CSVPage.tsx:265-282` directly); `updateRTMEntry` being unreferenced; `validationStatus` never auto-derived; the `"CSV / Validation"` vs `"CSV/CSA"` split; the `session.user.id → uploadedById/deletedById` writes and that those columns have no User `@relation`.
- **Inferred (medium confidence):** the *runtime* emptiness of findings/CAPAs depends on session navigation order — verified the data path (CSV route never fetches them) but did not execute the app. The screenshot reconciliation is against **described** contents, not pixels. Inspection-defensibility "<30s" judgments are reasoned from the code surfaces, not timed with a real user.

## Reasonable Doubts

- Whether `session.user.id` is ever a real `User.id` for the *typical* logged-in CSV user (compliance users) — for those it likely is; the risk is specifically the Tenant-row admin accounts. I did not run the self-delete gate to confirm it breaks.
- I treated `inspections.ts`/`evidence.ts`/`governance.ts` as out-of-module; it's possible a thin CSV/CSA usage exists that I scoped out. `getSystemsStats.auditTrailEnabled` and the DI tab's "DI gate" derive from Part 11 status / DI-gate CAPAs — I documented these as derived but did not exhaustively trace the DI-gate CAPA query.
- Line numbers are from the audit snapshot and may drift by a few lines if files change.

## Open Questions for Product Owner

1. Should `validationStatus` be **auto-derived** from stage completion, or remain a manual QA attestation? (Determines whether Finding #2 is a bug or intended.)
2. Are the 4 ICH-Q9 risk classifications, critical functions, risk factors, and requalification dates meant to **persist** (need schema columns) or were they always intended as transient UI? (Determines scope of Finding #1/#3/#8.)
3. Should RTM rows be **editable** post-create (wire `updateRTMEntry`), and should `evidenceStatus`/`traceabilityStatus` be **auto-derived** from IQ/OQ/PQ results + linked evidence?
4. Is hard-delete of a system acceptable, or should systems be **soft-deleted/archived** like StageDocument (Part 11)?
5. What is the intended **system↔finding↔CAPA** model — real FKs, or keep soft references? Should the CSV page fetch them server-side?
6. Is there meant to be a **"validation lead" / system-owner role** that gates stage submission per-system (vs the current global role check)?
7. Should systems and RTM requirements get **human-readable reference numbers** (`SYS-…`, `URS-…`) like the other modules?
8. Confirm the intended **canonical audit module string** for CSV/CSA (consolidate `"CSV / Validation"` into `"CSV/CSA"`?).
