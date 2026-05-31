# Product-wide Consistency Audit

**Audit date:** 2026-05-30
**Scope:** `src/` only (Next.js app surface). `backend/`, `node_modules`, `.next`, `prisma/migrations`, and generated artifacts excluded.
**Output type:** Reconnaissance only. No source files modified.

---

## Executive summary

The product has **six pre-existing GxP modules** (Gap Assessment, CAPA, CSV/CSA, FDA 483, Deviation, Change Control) plus tier-1 surfaces (Dashboard, AGI, Evidence, Governance, Settings, Audit Trail). Each module was clearly built by a different cycle of work, and the **per-module conventions outweigh the platform-wide conventions** for most user-visible vocabulary. The three biggest themes are:

1. **Severity/risk vocabulary is genuinely fragmented across models.** Five different tier shapes coexist (3-tier Critical/High/Low; 4-tier Critical/High/Medium/Low; lowercase critical/major/minor; uppercase HIGH/MEDIUM/LOW; Critical/Major/Minor). They are NOT casing typos — each was a domain decision — but the result is that the word "High" maps to amber in one module and would have been red elsewhere if not for the SME Item 2 cleanup. The colour layer is now mostly centralized via `badgeVariants.ts`; the **value taxonomies themselves remain split**.
2. **Status vocabulary has the same per-module fragmentation, plus literal TitleCase / snake_case mixing.** FDA 483 (events + observations) and Inspection Readiness use TitleCase string keys (`"In Progress"`, `"Response Due"`). CAPA, Deviation, Validation, and modern Findings use snake_case. The Finding taxonomy in `statusTaxonomy.ts` keeps backward-compat TitleCase aliases alongside the snake_case canonical keys, which is a maintenance hazard rather than a clean migration.
3. **User identity is stored as a display-name string in 17+ DB columns** with only spotty userId FK siblings. This is the underlying cause of every "name-equality" SoD caveat noted in the recent CAPA verification / approval / RCA-review work. Migrating `createdBy String` → `createdById String?` across CAPA, Finding, FDA483Observation, ChangeControl, and the 5+ other models would be a single mechanical rung and would resolve a half-dozen current TODOs in one shot.

Most of the **UI chrome** (buttons, modals, loading spinners) is in reasonable shape — `Cancel` / `Save changes` / `Loading…` / the shared `Modal` and `Button` primitives are widely adopted. The notable chrome inconsistencies are modal title casing (mixed TitleCase vs sentence-case), empty-state wording (sometimes informative + actionable, sometimes a bare "No data"), and Zod validation messages (terse "Owner required" vs verbose "Description must be at least 10 characters" vs descriptive "Describe the compliance gap (min 10 chars)").

Nothing in this audit is a security or compliance defect. The dual SoD comparisons that DO use display-name strings have been documented as known limitations in their respective action files; they remain functional but brittle.

---

## Table of contents

1. [Severity / Risk taxonomies](#1-severity--risk-taxonomies)
2. [Status taxonomies](#2-status-taxonomies)
3. [Role / actor naming](#3-role--actor-naming)
4. [Button / action labels](#4-button--action-labels)
5. [Empty states](#5-empty-states)
6. [Toast / notification / error messages](#6-toast--notification--error-messages)
7. [Form validation messages](#7-form-validation-messages)
8. [Date / time formatting](#8-date--time-formatting)
9. [Modal / dialog titles and confirmations](#9-modal--dialog-titles-and-confirmations)
10. [Navigation / menu naming](#10-navigation--menu-naming)
11. [Loading / error / retry states](#11-loading--error--retry-states)
12. [Search, filter, and table conventions](#12-search-filter-and-table-conventions)
13. [Prioritized fix list](#prioritized-fix-list)
14. [Things NOT worth fixing](#things-not-worth-fixing)

---

## 1. Severity / Risk taxonomies

### Current state

Six distinct value sets are in use:

| Taxonomy | Values | Models / call sites |
|---|---|---|
| **Critical / High / Medium / Low** (4-tier TitleCase) | 4 | CAPA risk ([src/store/capa.slice.ts:4](src/store/capa.slice.ts#L4)), ChangeControl risk ([src/lib/change-control-constants.ts:24](src/lib/change-control-constants.ts#L24)), RAID priority ([src/actions/raid.ts:16](src/actions/raid.ts#L16), [src/modules/governance/GovernancePage.tsx:73](src/modules/governance/GovernancePage.tsx#L73)) |
| **Critical / High / Low** (3-tier TitleCase) | 3 | Finding severity ([src/store/findings.slice.ts:3](src/store/findings.slice.ts#L3)), FDA483Observation severity ([src/types/fda483.ts:38](src/types/fda483.ts#L38), [src/actions/fda483.ts:43](src/actions/fda483.ts#L43)), Gap-assessment Zod ([src/schemas/index.ts:14,27,53](src/schemas/index.ts#L14)) |
| **critical / major / minor** (3-tier lowercase) | 3 | Deviation severity ([src/store/deviation.slice.ts:6](src/store/deviation.slice.ts#L6), [src/actions/deviations.ts:30](src/actions/deviations.ts#L30), [src/modules/deviation/DeviationPage.schemas.ts:8](src/modules/deviation/DeviationPage.schemas.ts#L8)) |
| **Critical / Major / Minor** (3-tier TitleCase) | 3 | DriftSeverity ([src/types/agi.ts:12](src/types/agi.ts#L12), [src/modules/agi-console/AGIPage.tsx:47](src/modules/agi-console/AGIPage.tsx#L47)), CSV/CSA gxpRelevance ([src/modules/csv-csa/modals/EditSystemModal.tsx:24](src/modules/csv-csa/modals/EditSystemModal.tsx#L24), [src/modules/csv-csa/modals/AddSystemModal.tsx:24](src/modules/csv-csa/modals/AddSystemModal.tsx#L24)) |
| **HIGH / MEDIUM / LOW** (3-tier UPPERCASE) | 3 | Site risk ([src/modules/settings/tabs/SitesTab.tsx:38](src/modules/settings/tabs/SitesTab.tsx#L38)), CSV/CSA system risk filter ([src/modules/csv-csa/tabs/SystemInventoryTab.tsx:152](src/modules/csv-csa/tabs/SystemInventoryTab.tsx#L152)) |
| **High / Medium / Low** (3-tier TitleCase) | 3 | AGIRiskScore ([src/store/readiness.slice.ts:7](src/store/readiness.slice.ts#L7)) |
| **critical / high / medium** (3-tier lowercase, no "low") | 3 | RTM URS priority ([src/actions/rtm.ts:18](src/actions/rtm.ts#L18)) |

Additional Zod literals that don't bind to a TS type (loose strings):
- [src/actions/fda483.ts:828](src/actions/fda483.ts#L828) — `observationSeverity: z.enum(["Critical", "High", "Low"])` — duplicates the existing FDA483Observation tier
- [src/schemas/index.ts:86](src/schemas/index.ts#L86) — `priority: z.enum(["Critical", "High", "Medium", "Low"])` — RAID-style, lives in the shared schemas file
- [src/schemas/index.ts:101](src/schemas/index.ts#L101) — `gxpRelevance: z.enum(["Critical", "Major", "Minor"])` — duplicates the CSV/CSA modal enum

**Colour layer is centralized.** SME Item 2 Phase 1 consolidated 6 maps under `src/lib/badgeVariants.ts` (CAPA_RISK_VARIANT, CC_RISK_VARIANT, FINDING_SEVERITY_VARIANT, OBSERVATION_SEVERITY_VARIANT, DEVIATION_SEVERITY_VARIANT, SITE_RISK_VARIANT). The contract — Critical→red, High/major/Medium/MEDIUM→amber, Low/minor/LOW→green — holds across all six maps. **No regression found.** The Site `HIGH` previously rendered red elsewhere; that's now amber across all five places it appears.

**Drift-Severity (`Critical / Major / Minor`)** has no colour map at all (grep returns no `DRIFT_SEVERITY_VARIANT`). The AGIPage uses inline tone logic. Worth bringing into the central map.

### Why it's a problem

1. **The Finding/FDA483Observation 3-tier (no Medium) is semantically different from CAPA's 4-tier**, but users will encounter both in the same workflow (a Finding raises a CAPA; severity needs to map). There's no explicit upgrade rule documented; the AI CAPA modal at [src/modules/capa/modals/AIGenerateCAPAModal.tsx:20](src/modules/capa/modals/AIGenerateCAPAModal.tsx#L20) has its own `Low/Medium/High/Critical` enum with no documented mapping to the source Finding's `Critical/High/Low`.
2. **Cross-module SoD or query work that compares "severity" across modules** has to handle 6 casings + 6 vocabularies. There is currently no central helper like `normalizeSeverityTier(value, sourceModule)`.
3. **Site risk's UPPERCASE** is the only model whose taxonomy uses screaming-snake-style. It works fine in isolation but looks like a typo next to every other module's TitleCase.

### Recommended canonical form

Do NOT collapse the value vocabularies — they encode domain semantics (Deviation's `critical / major / minor` is a regulator-recognised classification). DO:
1. Add a `src/lib/severity-mapping.ts` exposing `upgradeTo4Tier(value, sourceModule)` for cross-module workflows (Finding→CAPA, FDA483→CAPA).
2. Add `DRIFT_SEVERITY_VARIANT` to `badgeVariants.ts` to bring AGI under the same colour discipline.
3. Promote `priority` from a per-call Zod enum at [src/schemas/index.ts:86](src/schemas/index.ts#L86) and [src/modules/governance/GovernancePage.tsx:73](src/modules/governance/GovernancePage.tsx#L73) into a single `RAID_PRIORITIES` const.

### Severity

**MEDIUM** — value taxonomies are deliberate; UI colour drift was the painful surface and that's already fixed. The remaining issues are about explicit cross-module mapping (not done today) and one missing colour map (Drift).

### Effort

**S** — central mapping helper + one new variant map. Few files touched.

---

## 2. Status taxonomies

### Current state

Eight distinct status enums in [src/constants/statusTaxonomy.ts](src/constants/statusTaxonomy.ts), each with its own value set and casing:

| Taxonomy | Casing style | Values |
|---|---|---|
| `FINDING_STATUSES` | **MIXED** — snake_case canonical + TitleCase backward-compat aliases | `open / in_progress / pending_verification / closed / risk_accepted` + `Open / "In Progress" / Closed` |
| `CAPA_STATUSES` | snake_case | `open / in_progress / pending_qa_review / pending_verification / closed / rejected` |
| `FDA483_EVENT_STATUSES` | **TitleCase only** | `Open / "Under Investigation" / "Response Due" / "Response Drafted" / "Pending QA Sign-off" / "Response Submitted" / "FDA Acknowledged" / Closed / "Warning Letter"` |
| `FDA483_OBS_STATUSES` | **TitleCase only** | `Open / "In Progress" / "RCA In Progress" / "CAPA Linked" / "Response Ready" / "Response Drafted" / Closed` |
| `VALIDATION_STATUSES` | **MIXED** — snake_case canonical + lowercase backward-compat aliases | `not_started / draft / in_review / approved / rejected / skipped` + `pending / complete / "in-progress"` |
| `DEVIATION_STATUSES` | snake_case | `draft / open / under_investigation / pending_qa_review / closed / rejected` |
| `READINESS_STATUSES` | **TitleCase only** | `"Not Started" / "In Progress" / Complete / Overdue / Blocked` |
| `CAPA_STATUS_VALUES` ([src/types/capa.ts:9](src/types/capa.ts#L9)) | snake_case | duplicates `CAPA_STATUSES` keys for the TS type union |

Plus loose Zod literals scattered across actions / modals:
- [src/actions/fda483.ts:640](src/actions/fda483.ts#L640) `status: z.enum(["Pending", "In Progress", "Complete", "Overdue"])` (FDA483Commitment) — TitleCase
- [src/actions/findings.ts:45](src/actions/findings.ts#L45) `status: z.enum(["Open", "In Progress", "Closed"])` — **TitleCase**, doesn't match the canonical snake_case in `FINDING_STATUSES`. The backward-compat aliases in `FINDING_STATUSES` are what bridges this.
- [src/modules/evidence/EvidencePage.tsx:157](src/modules/evidence/EvidencePage.tsx#L157) `status: z.enum(["Current", "Draft", "Superseded", "Missing", "Under Review"])` — TitleCase, entirely separate Evidence taxonomy not in `statusTaxonomy.ts`
- [src/modules/csv-csa/modals/AddActivityModal.tsx:18](src/modules/csv-csa/modals/AddActivityModal.tsx#L18) `status: z.enum(["Planned", "In Progress", "Complete", "Overdue"])` — TitleCase, doesn't match `VALIDATION_STATUSES`
- [src/actions/deviations.ts:50](src/actions/deviations.ts#L50) `status: z.string().optional()` — **completely unguarded** in updateDeviation Zod (the SME-section-1-Stage-1 follow-up fix added a runtime PROTECTED_DEVIATION_STATUSES guard rather than tightening the Zod enum)
- [src/actions/capas/lifecycle.ts:52](src/actions/capas/lifecycle.ts#L52) `status: z.string().optional()` — same loose pattern in updateCAPA

Notable defensive patterns where the *display* still has to handle multiple casings:
- [src/modules/dashboard/DashboardPage.tsx:313](src/modules/dashboard/DashboardPage.tsx#L313) — `item.status === "Closed" || item.status === "closed"` and `item.status === "In Progress" || item.status === "in_progress"` and `item.status === "Pending QA Review" || item.status === "pending_qa_review"`. **This is the smoking gun**: a dashboard read defensively accepts BOTH casings because the underlying data isn't normalized.

### Why it's a problem

1. **A CAPA whose `status === "Closed"` and one whose `status === "closed"` render differently** unless every consumer defensively branches like DashboardPage:313 does. There's a SQL migration in `prisma/sql/fix_capa_status_vocab.sql` that backfills CAPA-side casing — but the analogous Finding / FDA483 / Validation casings have **not** been backfilled. Backward-compat aliases in `statusTaxonomy.ts` reduce the blast radius but the underlying value drift is real.
2. **The two `pending_verification` entries** (Finding + CAPA in `statusTaxonomy.ts`) have different colours (`#8B5CF6` vs `#0EA5E9`) and different `nextActions` text. Same concept, two visual treatments.
3. **`updateDeviation` + `updateCAPA` accept `status: z.string().optional()`** with the guard layer doing runtime enforcement. A tighter Zod enum would catch a typo'd transition at parse time and remove the need for the PROTECTED_STATUSES runtime check.

### Recommended canonical form

1. **Pick snake_case for everything except FDA 483.** FDA 483 statuses look natural in TitleCase (they're FDA-flavored vocabulary — "Response Due", "Warning Letter"). Everything else should be snake_case.
2. **Drop backward-compat aliases** from `FINDING_STATUSES` and `VALIDATION_STATUSES` after a one-time SQL backfill. The aliases are a maintenance debt that grows with every new consumer.
3. **Tighten `updateDeviation` and `updateCAPA` Zod enums** to the canonical set; remove the runtime PROTECTED_STATUSES guard (the Zod parse becomes the enforcement).
4. **Bring Evidence status into `statusTaxonomy.ts`** so it's discoverable.

### Severity

**HIGH** — The TitleCase/snake_case mixing causes invisible defensive code that has to grow every time someone adds a status consumer. The dashboard defensive branch is the loudest symptom.

### Effort

**M** — three SQL backfills + remove aliases + tighten 2 Zod schemas + add 1 missing taxonomy. Couple of days of work, mostly cautious migration.

---

## 3. Role / actor naming

### Current state — display-name vs userId columns

**Display-name `String` columns** (brittle for SoD comparisons):
- `Finding.owner`, `Finding.createdBy` ([prisma/schema.prisma:137,142](prisma/schema.prisma#L137))
- `CAPA.owner`, `CAPA.createdBy` ([prisma/schema.prisma:175,286](prisma/schema.prisma#L175)) — the rcaReviewedBy and approvers were promoted to dual-write pairs in earlier rungs, but `createdBy` itself is still string-only
- `Deviation.owner`, `Deviation.detectedBy`, `Deviation.closedBy` ([prisma/schema.prisma:385,387,398](prisma/schema.prisma#L385))
- `FDA483Event.createdBy`, `FDA483Observation.createdBy` ([prisma/schema.prisma:413](prisma/schema.prisma#L413))
- `Document.approvedBy` ([prisma/schema.prisma:362,561,684](prisma/schema.prisma#L362))
- `RAIDItem.owner`, `RAIDItem.createdBy` ([prisma/schema.prisma:728,738](prisma/schema.prisma#L728))
- `ReadinessAction.owner`, `ReadinessAction.createdBy` ([prisma/schema.prisma:780,801](prisma/schema.prisma#L780))
- `Playbook.createdBy` ([prisma/schema.prisma:857](prisma/schema.prisma#L857))
- `CAPAComment.createdBy` ([prisma/schema.prisma:984](prisma/schema.prisma#L984))
- `CAPAApproval` (uses `approverId` correctly) ([prisma/schema.prisma:907](prisma/schema.prisma#L907))
- `CAPAEffectivenessCriterion.createdBy` ([prisma/schema.prisma:928](prisma/schema.prisma#L928))
- `ChangeControl.owner`, `ChangeControl.createdBy` ([prisma/schema.prisma:1175,1199](prisma/schema.prisma#L1175))

**Dual-write pairs** (display-name + userId FK) — the right pattern, recently introduced:
- `Deviation.createdBy + createdById` (SME Stage 5 work)
- `CAPA.verifiedBy + verifiedById` (Stage 5)
- `CAPA.effectivenessReviewedBy + effectivenessReviewedById` (Stage 6)
- `CAPA.alignmentReviewedBy + alignmentReviewedById` (Substage 4.7)
- `CAPA.rcaReviewedBy + rcaReviewedById` (Stage 3)
- `CAPAActionItem.owner + ownerId`, `completedBy + completedById`, `createdBy + createdById` (Stage 4)
- `ChangeControl.closedBy + closedById` ([prisma/schema.prisma:1181-1182](prisma/schema.prisma#L1181))

**Pure userId-only** (cleanest):
- `SignedRecord.signerId` — single source of truth, used directly by Stage 6's SoD check
- `CAPAApproval.approverId`

### Roles — canonical enum

Single source of truth at [src/hooks/useRole.ts:6-16](src/hooks/useRole.ts#L6-L16):
- `super_admin` → "Super Admin"
- `customer_admin` → "Customer Admin"
- `qa_head` → "QA Head"
- `qc_lab_director` → "QC/Lab Director"
- `regulatory_affairs` → "Regulatory Affairs"
- `csv_val_lead` → "CSV/Val Lead"
- `it_cdo` → "IT/CDO"
- `operations_head` → "Operations Head"
- `viewer` → "Viewer"

**Display label inconsistencies found**:
- `useRole.ts` label says `"QC/Lab Director"` (slash, no space); UI text in some places says "QA Lab Director" — note a typo I made in an earlier rung at `src/modules/capa/tabs/sections/ActionItemsSection.tsx:130` was caught by tsc (used `qa_lab_director` instead of `qc_lab_director`). The role itself is `qc_lab_director`. Worth a comment in `useRole.ts` clarifying QC not QA.
- `PermissionsTab.tsx` label list ([src/modules/settings/tabs/PermissionsTab.tsx:18-20](src/modules/settings/tabs/PermissionsTab.tsx#L18-L20)) uses **shortened module names** ("CAPA", "CSV/CSA", "FDA 483", "AGI") that diverge from the sidebar labels ("CAPA Tracker", "CSV / CSA Validation", "FDA 483 & Regulatory"). Not role-related per se, but the same "settings vocabulary diverges from app vocabulary" pattern.

### Why it's a problem

1. **SoD comparisons by name are brittle.** A user renaming themselves silently breaks the audit chain ("approver = creator" check returns false for what's logically the same person). Stage 5's verification gate dodges this by using `SignedRecord.signerId` (userId); Stage 3's RCA review, Stage 5's approval self-block, and the closeDeviation guard all carry a documented "TODO: tighten via createdById migration" comment.
2. **Mass migration is mechanically straightforward** — for each Model with display-name-only attribution, add `<col>Id String?` + relation, backfill via tenant-scoped name match (the `scripts/backfill-deviation-created-by.ts` template), update create-actions to dual-write. Already done for Deviation in Stage 5; CAPA + Finding + FDA483Observation + Document + RAIDItem + ReadinessAction + Playbook + CAPAComment + CAPAEffectivenessCriterion + ChangeControl are pending.

### Recommended canonical form

For every model with a person-attribution column:
```
<col>      String        // denormalised display-name cache (kept for join-free reads)
<col>Id    String?       // authoritative userId FK
<col>User  User?         // relation, onDelete: SetNull
```

Create-actions dual-write both. Backfill scripts populate `<col>Id` from `<col>` via tenant-scoped name match (same shape as `scripts/backfill-deviation-created-by.ts`).

### Severity

**HIGH** — the migration backlog is real and growing (each new SoD guard added in recent rungs has a "brittle name comparison" caveat). Doing all 10+ models at once would close out half a dozen TODO comments.

### Effort

**L** — 10+ models × (schema delta + backfill script + create-action update). Probably 2-3 days of careful work, none of it complex.

---

## 4. Button / action labels

### Current state

The shared `Button` primitive ([src/components/ui/Button.tsx](src/components/ui/Button.tsx)) is widely adopted. Casing within button text is mostly consistent (sentence-case after the first word), but the wording for the same intent varies:

| Intent | Variants observed | Files |
|---|---|---|
| Save | `Save`, `Save changes`, `Save plan` | OrgTab ("Save changes"), EditCAPAModal ("Save changes"), EditSystemModal ("Save changes"), GapRegisterTab ("Save"), CustomerAccountsPage ("Save"), DIAuditPanel ("Save"), ValidationPanel ("Save"), GovernancePage `editingRaid ? "Save changes" : "Add item"` |
| Cancel | `Cancel` everywhere | All modals — consistent ✅ |
| Submit/Apply | `Submit`, `Add item`, `Sign verification`, `Mark complete`, `Add action item` | mostly intent-specific (good) |
| Delete | `Delete`, `Remove` | CustomerAccountsPage:634 uses "Remove" for a logo file; AiCapaPage:1146 uses "Remove" for an action item; most other delete affordances use `Delete` |
| Close (modal) | `Close`, `Cancel` | EvidenceCollectionPanel:887 uses "Close" inside an info modal; everywhere else "Cancel" |
| Approve | `Approve`, `Approve as QA Head`, `Sign verification` | role-aware (intentional) |
| Reject | `Reject` everywhere ✅ |
| Resolve | `Resolve alert` | AGIPage:194 |

**Destructive actions without confirmation** (clicking just deletes):
- [src/modules/admin/CustomerAccountsPage.tsx:634](src/modules/admin/CustomerAccountsPage.tsx#L634) — `Remove` (logo file). One-click, no confirm.
- [src/modules/ai-capa/AiCapaPage.tsx:1146](src/modules/ai-capa/AiCapaPage.tsx#L1146) — `Remove` action plan row. One-click.

**Destructive actions WITH confirmation** (good examples):
- ActionItemsSection delete (Stage 4) requires reason ≥ 5 chars
- Deviation reject requires reason ≥ 5 chars
- ChangeControl reject requires password

### Why it's a problem

- "Save" vs "Save changes" is the textbook UX consistency complaint. Both work, but the same product probably shouldn't ship both.
- "Remove" vs "Delete" is harmless when context distinguishes them (Remove from a list vs Delete the record), but the two no-confirm `Remove` buttons above could destroy real user data with one click.

### Recommended canonical form

1. **Default to "Save changes"** for any form modal that mutates an existing record. Use bare "Save" only for inline editors (table-cell edits).
2. **Always require a confirmation for hard-delete** of any user-generated content. The two one-click `Remove` buttons should each get a confirmation modal (or, at minimum, a popup confirming the action).

### Severity

- Save vs Save changes: **LOW** (cosmetic; users figure it out)
- Unconfirmed Remove: **MEDIUM** (real data-loss vector, low frequency)

### Effort

**S** — find/replace + 2 new confirmation modals.

---

## 5. Empty states

### Current state — wide spectrum

**Good empty states** (informative + actionable):
- `DocumentLibraryTab` — "No documents match the current filters" + Clear-filters button
- `RAIDTab` — "No items match filters" + Clear button
- `CAPATrackerTab` — "No CAPAs raised yet" (or filter-aware: "No CAPAs match the current filters")
- `DeviationPage` — same dual treatment
- `OverviewBody` — "No description yet — click Edit details above to add one." (instructive)
- `DiscussionSection` — "No discussion yet. Add the first comment below."

**Bare empty states** (just says nothing's there):
- [src/modules/admin/CustomerDetailPage.tsx:408](src/modules/admin/CustomerDetailPage.tsx#L408) — `No users yet.` (no CTA)
- [src/modules/readiness/tabs/PlaybooksPrismaTab.tsx:118](src/modules/readiness/tabs/PlaybooksPrismaTab.tsx#L118) — `No playbooks yet`
- [src/modules/readiness/RoadmapPrismaTab.tsx:133](src/modules/readiness/RoadmapPrismaTab.tsx#L133) — `No actions yet for this inspection.`
- [src/modules/gap-assessment/tabs/GapSummaryTab.tsx:104](src/modules/gap-assessment/tabs/GapSummaryTab.tsx#L104) — `No findings yet`
- [src/modules/capa/tabs/CAPAMetricsTab.tsx:71,83](src/modules/capa/tabs/CAPAMetricsTab.tsx#L71) — `No CAPAs yet` (twice, in two donut chart panels)

**Mixed phrasing** for the same concept:
- "No deviations reported yet" (table) — verb in past tense
- "No CAPAs raised yet" — verb in past tense
- "No findings yet" — no verb
- "No discussion yet" — no verb
- "No playbooks yet" — no verb

**Missing empty states** — pages that render nothing when data is empty:
- The Linked-deviation panel in OverviewBody simply doesn't render when `capa.deviation` is null (this is correct behaviour; not really "missing" — flagged as a non-issue).

### Why it's a problem

The bare "No X yet" pattern is fine when the user has no path forward (e.g. they're viewing someone else's empty list). But for tables where the user CAN add the missing item, we should consistently say "No X yet. Click ___ to add one." or include a CTA button — the way `OverviewBody` does for description.

### Recommended canonical form

For every list/table:
- **No items + user can add** → message + inline CTA button matching the table's add affordance
- **No items + user cannot add** (someone else's data, readonly role) → simple "No X yet."
- **Filtered out** → "No X match the current filters." + Clear button

### Severity

**LOW** — discoverability mild issue; nothing breaks.

### Effort

**S** — half-day pass through all the bare empty-state strings.

---

## 6. Toast / notification / error messages

### Current state

The `useToast()` hook with `toast.success/error/info/warning` is consistently used. Tone, however, varies:

**Mixed register**:
- `"Logged out successfully"` ([AppShell:194](src/components/layout/AppShell.tsx#L194)) — formal, past tense
- `"Welcome back, {name}!"` ([LoginPage:230](src/components/auth/LoginPage.tsx#L230)) — informal, exclamation
- `"Customer "{name}" updated."` ([CustomerAccountsPage:1072](src/modules/admin/CustomerAccountsPage.tsx#L1072)) — terse, quoted name
- `"Signing out..."` ([AppShell:189](src/components/layout/AppShell.tsx#L189)) — progress
- `"Your session expired. Please sign in again."` (LoginPage:82) — formal full sentence

**Error messages with technical leakage**:
- `"Could not update "X": ${mapCustomerError(err)}"` ([CustomerAccountsPage:1076](src/modules/admin/CustomerAccountsPage.tsx#L1076)) — surfaces whatever `mapCustomerError` returns. In dev mode, recent Stage 5/6 work surfaces raw Prisma codes (`[P2002]`); the `mapCustomerError` helper likely friendlies them, but worth auditing.
- Most Server Actions return `{ success: false, error: "..." }` and the calling component shows the error directly via toast/setError. Some error strings include dev-only Prisma codes (Stage 5/6 closure action: `Failed to record verification: [P2002] ...` in NODE_ENV=development) — production-mode mapping is in place, but the dev-mode string format is non-uniform.

**No "wrong success" patterns found.** The SME Section 1 Stage 1 self-approval / wrong-password fix appears intact: every failure branch correctly setError-and-return rather than falling through. Audit logs (LOGIN_FAILED, LOGIN_AMBIGUOUS_EMAIL, etc.) are written before the error response.

### Why it's a problem

Mixed register isn't a functional issue but it's the most visible to users — they see toasts dozens of times per session. A consistent register (e.g., past-tense-action, no exclamations, no quote marks around dynamic values) reads as more professional.

### Recommended canonical form

| Intent | Template | Example |
|---|---|---|
| Success | `<Subject> <verb-past>.` | `Customer Pharma Glimmora updated.` |
| Error | `Could not <verb-present>: <reason>` | `Could not save customer: validation failed.` |
| Info / progress | `<gerund>…` | `Signing out…` |
| Warning | `<Subject> <condition>.` | `Subscription expires in 7 days.` |

No exclamation marks; no "Welcome back!" cuteness in a regulated-software context.

### Severity

**LOW** — register issue; nothing breaks.

### Effort

**M** — every toast call in the codebase needs a one-line review. ~40 sites.

---

## 7. Form validation messages

### Current state

Three distinct message styles in Zod schemas — all in active use:

**1. Terse noun + "required"** (most common):
- `"Owner required"`, `"Title required"`, `"Description required"`, `"Owner required"`, `"Vendor required"`, `"Version required"` ([src/schemas/index.ts:67-100](src/schemas/index.ts#L67-L100))

**2. Verbose "Must be at least N characters"** (longer-form):
- `"Comment must be at least 5 characters"` ([src/actions/capa-comments.ts:45](src/actions/capa-comments.ts#L45))
- `"Resolution note must be at least 5 characters"` (capa-comments.ts:54)
- `"Description must be at least 5 characters"` ([src/actions/effectiveness-criteria.ts:28](src/actions/effectiveness-criteria.ts#L28))
- `"Notes must be at least 10 characters"` (capas/alignment.ts)
- `"Override reason must be at least 20 characters"` (capas/alignment.ts)

**3. Descriptive instruction + parenthetical** (best of the three):
- `"Describe the compliance gap (min 10 chars)"` ([src/schemas/index.ts:11](src/schemas/index.ts#L11))
- `"Description required (min 10 chars)"` (schemas/index.ts:25)
- `"Title required (min 5 chars)"` (schemas/index.ts:63)

**4. Imperative instruction** (also descriptive):
- `"Select an area"`, `"Select a regulatory framework"`, `"Assign an owner"`, `"Set a target date"`, `"Set a due date"`, `"Select a site"` (schemas/index.ts:12-17)

**5. Default Zod auto-message** (worst — no custom message):
- [src/components/auth/LoginPage.tsx:29-30](src/components/auth/LoginPage.tsx#L29) does have custom messages
- Many `z.string().min(N)` calls in modals (e.g. AddCAPAModal, AddObservationModal) rely on Zod's default message text

### Why it's a problem

A user filling out a Deviation form sees `"Title required (min 5 chars)"` (descriptive) and `"Owner required"` (terse) on the same page. The terse messages don't tell the user what's required — they just say it's missing.

### Recommended canonical form

Pick one style. Recommend the descriptive-instruction style (`"Select a site"`, `"Describe the deviation (≥ 10 chars)"`) because:
- Tells the user what to do, not just what's wrong.
- Reads identically for `.min(1)` (required) and `.min(N)` (length) — no special-casing.

Then standardize: every Zod call site gets a custom message in this style. Default Zod messages get replaced.

### Severity

**MEDIUM** — users encounter validation errors regularly; consistent friendly messages noticeably improve form-fill UX.

### Effort

**M** — every Zod schema in `src/actions/` and `src/schemas/` and per-modal schemas needs review. Hundreds of `.min()` calls but each is a one-line touch.

---

## 8. Date / time formatting

### Current state

**`@/lib/dayjs`** is the project's date helper, used in 40+ files. Most consumers do `dayjs.utc(date).tz(timezone).format(dateFormat)` — UTC source, tenant-timezone display, tenant-configured format string (`org.dateFormat`). This is good and consistent.

**Format-string drift** within that helper:
- `"DD MMM"` — DeviationPage table cells ([src/modules/deviation/DeviationPage.tsx:340,342](src/modules/deviation/DeviationPage.tsx#L340))
- `org.dateFormat` (configurable, default `"DD/MM/YYYY"`) — DeviationPage detail panel ([DeviationPage:385,447,451](src/modules/deviation/DeviationPage.tsx#L385))
- `"MMM D, YYYY"` — CustomerDetailPage:167, CustomerAccountsPage:794
- `"YYYY-MM-DD"` — CustomerAccountsPage:495 (form input default), AddSubscriptionPlanModal
- `"MMMM YYYY"` — AIPolicyPage:48 (date in a banner)

**Browser-default formatting** (escapes the dayjs pipeline entirely):
- [src/modules/ai-tools/AiToolsPage.tsx:302](src/modules/ai-tools/AiToolsPage.tsx#L302) — `d.toLocaleString()`
- [src/modules/ai-capa/AiCapaPage.tsx:1016](src/modules/ai-capa/AiCapaPage.tsx#L1016) — `d.toLocaleString()`
- [src/modules/ai-capa/AiCapaIndex.tsx:279](src/modules/ai-capa/AiCapaIndex.tsx#L279) — `d.toLocaleDateString()`

These three sites use the browser's locale defaults — they will render different formats per user browser locale (UK user sees `30/05/2026`, US user sees `5/30/2026`). They also bypass tenant timezone entirely.

**Relative-vs-absolute time** is inconsistent:
- `dayjs(time).fromNow()` (relative) — Approvals section, RCA review section, action items table
- `dayjs.utc(time).tz(tz).format(dateFormat)` (absolute) — most detail panels
- Mixed within a single panel: action items section shows absolute due-date but relative completedAt

### Why it's a problem

1. The three `toLocaleString()` sites are real bugs — same product page renders different date formats per browser locale. They likely appeared during AI-CAPA development where the team forgot the shared helper.
2. The "DD MMM" vs `dateFormat` choice inside DeviationPage is OK (compact table cell vs full detail view) but the convention isn't documented anywhere.

### Recommended canonical form

1. **Banned formats**: `toLocaleString()`, `toLocaleDateString()`, raw `new Date()` formatting. Add an ESLint rule if possible.
2. **Adopt three named format constants** in `src/lib/dayjs.ts` (or near it):
   - `DATE_COMPACT` = `"DD MMM"` (table cells)
   - `DATE_LONG` = `org.dateFormat` (detail panels)
   - `DATETIME_LONG` = `org.dateFormat + " HH:mm"` (audit timestamps)
3. **Relative vs absolute policy**: relative for in-session activity ("3 minutes ago"), absolute for any record-bearing timestamp (CAPA closed-at, signature minted-at, due dates). Document the rule next to the helper.

### Severity

**HIGH** for the `toLocaleString()` sites (genuine cross-browser inconsistency), **LOW** for the rest.

### Effort

**S** — 3 call-site fixes for the locale bug; the rest is documentation + a one-off pass.

---

## 9. Modal / dialog titles and confirmations

### Current state

Modal titles have **three concurrent casing conventions**:

**TitleCase** (most common):
- `"Edit Organisation"`, `"Report Deviation"`, `"Reject Deviation"`, `"Subscription Plans"`, `"Attach Document"`, `"New CAPA"`, `"Report Compliance Gap"`, `"Add Requirement to RTM"`, `"Edit RAID Entry"`, `"Log RAID Entry"`, `"Complete Simulation"`, `"Create New Inspection"`, `"Complete Inspection"`, `"Response Draft"`, `"AGI Response Draft"`

**Sentence-case** (lowercase after first word):
- `"Add roadmap activity"` (AddActivityModal), `"Log drift alert"` (AGIPage), `"Resolve drift alert"`, `"Change control"`, `"Submit action plan"`, `"Submit monitoring check"`, `"Run effectiveness check"`, `"Initiate closure"`, `"Link evidence document"`, `"Update evidence document"`, `"New subscription plan"`

**Question form** (used for destructive confirmations):
- `"Reopen RAID item?"`, `"Reopen this action?"`, `"Enable MFA Required?"` (note the latter mixes TitleCase + question mark — slightly weird grammar)

**Special**:
- `"Submit RCA"` (TitleCase abbreviation), `"Sign & Close"` (with `&`)

### Destructive confirmation patterns

Several destructive flows have explicit confirmation modals:
- ✅ Deviation reject — requires reason
- ✅ CAPA action-item delete (Stage 4) — requires reason
- ✅ ChangeControl reject — requires password
- ✅ Enable MFA confirmation modal in admin
- ✅ Re-open RAID item / Re-open simulation — explicit modals

Two **non-confirmed** destructive actions (flagged also in Category 4):
- CustomerAccountsPage logo `Remove` button
- AiCapaPage action plan row `Remove`

**Confirmations that don't tell the user the blast radius**:
- `"Reopen this action?"` ([ReadinessPage:1020](src/modules/readiness/ReadinessPage.tsx#L1020)) — doesn't say what reopening does (cancels approvals? re-enables editing?)
- `"Enable MFA Required?"` — implies turning it on but the body would have to say what gets enforced and when
- AGI alert resolve — modal says `"Resolve drift alert"` but doesn't show what the alert was about in the title

### Why it's a problem

1. Mixed casing on modal titles is the single most visible inconsistency to a careful user — they see a dozen modals per session and the title is the first thing they read.
2. Confirmations without blast-radius text are a usability and audit-trail issue: "Reopen this action?" should answer "what happens if I do?" in the body.

### Recommended canonical form

1. **Sentence-case modal titles for actions** (`"Add action item"`, `"Reject deviation"`), **TitleCase for proper-noun records** (`"Subscription Plans"`, `"Audit Trail"`). Pure cosmetic, but pick one.
2. **Every destructive confirmation includes 1-2 sentences of blast radius** in the body — what gets changed, what gets preserved, who sees the audit trail.

### Severity

**MEDIUM** for casing (heavy user-visible surface), **MEDIUM** for missing blast-radius text on confirmations.

### Effort

**M** — sweep through ~25 modal title strings and the destructive-confirmation bodies.

---

## 10. Navigation / menu naming

### Current state — sidebar vs page-title divergence

[src/components/layout/Sidebar.tsx:50-73](src/components/layout/Sidebar.tsx#L50-L73) vs the `<h1 className="page-title">` of each module:

| Sidebar label | Page header | Match? |
|---|---|---|
| `Dashboard` | `Executive Dashboard` | **No** — header is grander |
| `Gap Assessment` | `Gap Assessment` | ✅ |
| `CAPA Tracker` | `QMS & CAPA Tracker` | **No** — header adds "QMS &" prefix |
| `CSV / CSA Validation` | `CSV/CSA` (PermissionsTab) / no top-level header on `/csv-csa` shown in grep | **No** — divergent |
| `FDA 483 & Regulatory` | `FDA 483 & Regulatory Events` | **Partial** — adds "Events" |
| `Evidence & Documents` | `Evidence & Document Workspace` | **No** — adds "Workspace" |
| (no sidebar entry — Deviation route exists at `/deviation` but I don't see it in the sidebar items shown) | `Deviation Management` (PageHeader) | **Missing nav?** |
| `Governance & KPIs` | `Governance & KPIs` | ✅ |
| `Settings` | `Settings & Administration` (per CLAUDE.md sample) | **No** — header adds "Administration" |

Additional:
- `AGI Console` — sidebar entry name not visible in my grep; page header is `AGI & Autonomy Console`. The route is `/agi-console`.
- `Change Control` page renders `<h1 className="page-title">Change Control</h1>` consistently; no sidebar entry shown in the grep.
- `Audit Trail` page uses a custom `<h1 className="text-2xl">` (not the shared `page-title` class) and reads `"Audit Trail"`. Inconsistent header styling.

### Acronym handling

- **CAPA** — always uppercase ✅
- **FDA 483** — always with space (`"FDA 483"`), never `"483"` standalone in nav text. Internal module folder is `fda-483` (kebab-case). ✅
- **CSV/CSA** — written `"CSV / CSA"` in sidebar (with spaces around slash) and `"CSV/CSA"` in PermissionsTab and AddSystemModal (no spaces). Inconsistent.
- **QMS** — appears only in `"QMS & CAPA Tracker"` page header; the module is just called "CAPA" everywhere else.
- **MFA** — uppercase ✅
- **AGI** — uppercase ✅
- **GxP** — appears as `"GxP signatory"`, `"GxP signature"`, etc. — consistent ✅

### Why it's a problem

The sidebar is the user's mental model of the app's structure. When they click `Gap Assessment` and land on a page titled `Gap Assessment`, that's frictionless. When they click `CAPA Tracker` and land on `QMS & CAPA Tracker`, they wonder if they're in the right place.

### Recommended canonical form

Page header text should be exactly the sidebar label OR an obvious super-set (`Settings` → `Settings & Administration` is fine; `CAPA Tracker` → `QMS & CAPA Tracker` is confusing because QMS isn't anywhere else in the product).

`CSV/CSA` should pick one spacing convention and apply everywhere (recommend `CSV/CSA` without spaces — that's the URL-friendly form `/csv-csa` derives from).

The Deviation module needs a sidebar entry if it doesn't have one. (I couldn't find one in the search; worth verifying — it may exist in a code path I didn't grep.)

### Severity

**MEDIUM** — first-time-user disorientation; less of an issue for returning users.

### Effort

**S** — rename 5-6 strings.

---

## 11. Loading / error / retry states

### Current state

**Button-level loading** is consistent: the shared `Button` component takes `loading={isSubmitting}` and renders a spinner ([src/components/ui/Button.tsx:95](src/components/ui/Button.tsx#L95)). Adopted ~20+ places.

**Page-level loading**:
- App router `loading.tsx` files exist for the main routes (per Next.js convention; not grepped exhaustively).
- `AsyncBoundary` ([src/components/errors/AsyncBoundary.tsx:15](src/components/errors/AsyncBoundary.tsx#L15)) renders `<div aria-busy="true" aria-label="Loading">` — accessible.
- Login page has a bespoke spinner (`animate-spin border-2 border-[#8b6914] border-t-transparent`) ([LoginPage:280](src/components/auth/LoginPage.tsx#L280)) instead of the shared `Button` spinner. Local choice for a specific moment; arguably fine.

**Section-level loading**:
- `ApprovalsSection` shows `"Loading approvals…"` (sentence-case + ellipsis char `…`)
- `ActionItemsSection` shows `"Loading…"` (terse)
- `VerificationSection` no loading state — silently shows the approvals fetch race
- `EffectivenessSection` no loading state
- `EvidenceCollectionPanel` has a comment at [src/modules/capa/tabs/EvidenceCollectionPanel.tsx:824](src/modules/capa/tabs/EvidenceCollectionPanel.tsx#L824) about a `"Loading…"` state and recovery path

**Retry-on-error**: largely absent from client-side fetches. Most `loadXForCAPA` calls show an error string (via `loadError` state) but no Retry button. The user has to refresh the page.

### Why it's a problem

Mixed loading idioms ("Loading…" vs "Loading approvals…" vs nothing) are minor. The missing retry path is a real usability issue — if a server action fails because of a transient network blip, the user has no recovery without a full page reload.

### Recommended canonical form

1. **Section loading text**: always `Loading…` (no per-section variant). The surrounding heading already names what's loading.
2. **Error display contract**: any inline `loadError` should render alongside a `Retry` button that re-invokes the load function. Easy to retrofit.
3. **Spinner glyph**: the shared `Button` spinner pattern + Lucide's spinner icon should be the only two used. Login's bespoke gold-border spinner can stay (it's the only branded moment).

### Severity

**MEDIUM** — the missing retry pattern hurts users on flaky connections; the rest is cosmetic.

### Effort

**S** — add Retry to ~6 section-level fetches; sweep the load-text strings.

---

## 12. Search, filter, and table conventions

### Current state

**Search placeholder text** — inconsistent:
- `"Search deviations..."` (DeviationPage:297)
- `"Search CAPAs..."` (CAPATrackerTab:102)
- `"Search CAPAs…"` (AiCapaIndex:139) — uses Unicode `…` instead of three dots
- `"Search findings..."` (GapRegisterTab)
- `"Search requirements..."` (RTMTab:165)
- `"Search organizations..."` (CustomerAccountsPage:1295)
- `"Search sites..."` (SitePicker:140)
- `"Search systems..."` (SystemInventoryTab:156)
- `"Search by reference, title, description..."` (ChangeControlListPage:148) — verbose, lists fields

Mostly consistent in shape (`Search {plural-noun}...`) but the punctuation mixes `...` (three dots) and `…` (ellipsis).

**Filter dropdown placeholders** — consistent (`All statuses`, `All severities`, `All sites`, `All types`, `All risks`, `All categories`, `All priorities`, `All systems`). ✅

**Column ordering** — varies by module:
- `DeviationPage` table: ID, Title, Category, Severity, Area, Detected, Owner, Due, CAPA, Status, [open chevron]
- `CAPATrackerTab`: (didn't fully grep but based on prior reads) reference, description, source, risk, owner, due date, status
- `GapRegisterTab`: ID, Site (conditional), Area, Requirement, Framework, Severity, Status, CAPA, Owner, Target date, Evidence, [open]
- `ChangeControlListPage`: not deeply audited

**Status column placement**: Deviation puts it second-to-last (before chevron); GapRegisterTab puts it middle (after Severity); CAPATrackerTab puts it middle. Not a hard rule.

**Pagination wording**: did not find explicit pagination strings — most tables show all rows (no pagination) or use `"Showing N of M"` ([DashboardPage:282, :319](src/modules/dashboard/DashboardPage.tsx#L282)) for "truncated to top N" lists.

**Filter clear button**:
- `"Clear"` (GapRegisterTab, RAIDTab, DeviationPage when filters active)
- `"Clear filters"` (DocumentLibraryTab, CAPATrackerTab when filters active)

Two-word "Clear filters" is clearer; "Clear" alone is ambiguous (clear what?).

### Why it's a problem

The placeholders (search) and filter-clear-button labels are user-visible every session. Tiny but persistent friction.

The column ordering matters less than it sounds — domain-specific tables can put their most-important column wherever makes sense.

### Recommended canonical form

1. **Search placeholders**: `Search {plural-noun}…` (Unicode ellipsis, no field list — let the user discover that).
2. **Clear filters button**: always `Clear filters`, never bare `Clear`.
3. **Column ordering**: no rule — each module's domain knows best. Don't enforce.

### Severity

**LOW** — tiny string-level consistency.

### Effort

**S** — find/replace.

---

## Prioritized fix list

In order of user impact + leverage:

### 1. Promote display-name `createdBy` columns to dual-write `<col>Id` FKs (Category 3)

**What to fix**: Across CAPA, Finding, FDA483Observation, ChangeControl, Document, RAIDItem, ReadinessAction, Playbook, CAPAComment, CAPAEffectivenessCriterion — add `createdById String?` + relation + backfill script + dual-write in the create action.

**Why first**: Closes 6+ "TODO: tighten SoD via createdById migration" comments across the recent SME rungs. Future SoD work (e.g., "creator cannot close their own deviation") becomes trivial. Single mechanical pattern, already proven on `Deviation.createdBy` in Stage 5.

**Effort**: L. ~2-3 days.

### 2. Status taxonomy normalization (Category 2)

**What to fix**: SQL backfill for the three taxonomies that still carry TitleCase/lowercase backward-compat aliases (Finding, Validation, possibly Evidence). Tighten `updateDeviation` / `updateCAPA` Zod from `z.string().optional()` to enum. Add Evidence statuses to the central `statusTaxonomy.ts`. Drop backward-compat aliases.

**Why second**: Removes the `dashboard.tsx:313` style defensive code throughout the product. Tighter parse-time enforcement on status writes is a small but visible reliability improvement.

**Effort**: M. ~2 days.

### 3. Fix the three `toLocaleString()` date sites (Category 8)

**What to fix**: `AiToolsPage.tsx:302`, `AiCapaPage.tsx:1016`, `AiCapaIndex.tsx:279` — switch to dayjs with the project's tenant-aware formatting.

**Why third**: Genuine cross-browser bug surfaced in audit. Same-page-different-format is a credibility issue for a regulated-software product. Trivial fix.

**Effort**: S. <1 hour.

### 4. Modal title casing + destructive-confirmation blast-radius copy (Category 9)

**What to fix**: Pick sentence-case OR TitleCase for modal action titles and apply uniformly across ~25 modals. Add 1-2 sentence body text to every destructive confirmation explaining what gets changed.

**Why fourth**: Most-visible UI inconsistency; users see modals dozens of times per session. The blast-radius copy is the difference between a regulator saying "the system is well-designed" vs "the system is confusing."

**Effort**: M. ~1 day.

### 5. Zod validation message uniformity (Category 7)

**What to fix**: Adopt the descriptive-instruction style (`"Describe the deviation (≥ 10 chars)"`, `"Select a site"`) and rewrite every `.min()` / `.email()` call site that uses the terse `"X required"` form. Replace default Zod auto-messages with custom strings everywhere.

**Why fifth**: Form-fill UX. Hundreds of touch points but each is a one-line change.

**Effort**: M. ~1.5 days.

---

## Things NOT worth fixing

I considered the following but concluded they're either deliberate, already canonical, or below the noise threshold:

1. **Severity value vocabularies are NOT all the same and should not be unified.** Deviation's `critical/major/minor` is a regulator-recognised classification distinct from CAPA's risk tier. Forcing them to share an enum would lose domain meaning. SME Item 2 explicitly called this out; the colour layer is the right thing to centralize and that's already done.
2. **Acronyms like CAPA, FDA, MFA, GxP, AGI** are consistently capitalized — no fix needed.
3. **The `Cancel` button label** is universally consistent. Don't waste effort.
4. **Filter dropdown `All X` placeholders** are uniform. Don't touch.
5. **The shared `Button` and `Modal` primitives** are well-adopted (saw 20+ `Button` usages, ~30 `Modal` usages). The few bespoke buttons (login page) are intentional branded moments.
6. **The Login page's gold-border spinner** is deliberately branded for the login moment; not a candidate for the shared spinner pattern.
7. **`dayjs.utc(date).tz(timezone).format(dateFormat)` pattern** is widely and correctly used. Don't break it — just kill the three `toLocaleString` exceptions.
8. **The "Cancel" vs "Close" button on info-only modals**: a couple of modals use "Close" because they're informational (no form to cancel). Fine.
9. **The PageHeader vs raw `<h1>` mix on the Audit Trail page** is a small one-off — not worth a rung on its own.
10. **`super_admin` role appearing in every role-gate check** is by design (system-admin override pattern). Not a "consistency" issue.
11. **Per-section loading text variants like "Loading approvals…"** are arguably an improvement over bare "Loading…" — the explicitness helps. Pick whichever, don't sweat it.
12. **Column ordering in tables**: domain-specific. Don't enforce a global rule.

---

*Audit produced by reconnaissance pass over `src/`. No source files modified. No schema changes proposed. Each category section above can drive a single targeted fix rung; the prioritized list at the bottom is one suggested ordering.*
