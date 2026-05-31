# FDA 483 / Regulatory Module — UX Audit

**Audit date:** 2026-05-30
**Scope:** `src/modules/fda-483/**`, `app/(app)/fda-483/page.tsx`, and consumer-facing behaviour only. Server actions read for data-flow shape, not audited.
**Output type:** Reconnaissance only. No source files modified.

---

## Executive summary

The module ships a complete workflow — register event → add observations → run RCA per observation → raise CAPA per observation → write a response → sign & submit — and the core mechanics work. The shell is well-organised around a single live event and four flat sub-surfaces (Events list, Observations, RCA, Response) rendered as a **stacked single-page detail** rather than tabs. That's actually a good information-architecture choice for this domain (regulators read responses end-to-end), but the page's INTERNAL navigation hasn't caught up: there's a `currentStep` state machine, a `Step` type, and child callbacks named `onGoToObservations` / `onGoToEvents` that have **no visible effect** when invoked, because the obs/RCA/response sections are already rendered stacked. That's the loudest structural smell.

The three biggest themes are:

1. **The user has to know the workflow already.** There is no overview, no "you are here" indicator, no "what to do next" guidance beyond the 7-row Response Readiness checklist (which itself doesn't explain WHY items aren't done). Several empty-states point users to surfaces by names that don't exist on screen (e.g. "Open RCA Workspace to raise CAPAs" — there is no surface labeled "RCA Workspace").
2. **The status / severity vocabulary is duplicated 3× and partially out of sync.** The 9-value event status colour map is defined inline in `FDA483Page`, `EventsTab`, and `ObservationsTab` — bit-identically. The observation status form schema allows 7 values; the badge map handles 4 (the other 3 silently render grey). The recent Cat 1 unification didn't reach this module's inline maps.
3. **"AGI" is the single biggest jargon problem.** "AGI Draft" appears as a button label with no inline definition; the modal that opens is labeled "AGI Response Draft" and starts auto-generating with a 2-second loading spinner. A first-time user has no way to know what's happening or whether they should trust the output before clicking "Use this draft".

What's surprisingly fine: every primary mutation has a server-first flow that re-routes through an error popup on reject (Stage 1 closure-gate pattern is intact). The Part 11 Sign & Submit modal correctly stays open on wrong password, surfaces an inline error, and wipes credentials on close. The DocumentUpload primitive is reused (not reinvented). The deadline-alert banner at the top is genuinely useful and prominent.

---

## Table of contents

1. [Information hierarchy](#1-information-hierarchy)
2. [Navigation flow](#2-navigation-flow)
3. [Empty states](#3-empty-states)
4. [CTA clarity](#4-cta-clarity)
5. [Status / severity consistency](#5-status--severity-consistency)
6. [Visual hierarchy](#6-visual-hierarchy)
7. [Repeated information](#7-repeated-information)
8. [User confusion points](#8-user-confusion-points)
9. [Terminology / jargon](#9-terminology--jargon)
10. [Mobile usability](#10-mobile-usability)
11. [Component consistency](#11-component-consistency)
12. [Prioritized fix list](#prioritized-fix-list)
13. [Things NOT worth changing](#things-not-worth-changing)

---

## 1. Information hierarchy

### Findings

- **Page header** at [FDA483Page.tsx:406](src/modules/fda-483/FDA483Page.tsx#L406) — `<h1>FDA 483 & Regulatory</h1>` + subtitle `N events · X open · Y response due`. Good — counts are the at-a-glance summary regulators care about. ✓
- **Deadline alert banner** ([FDA483Page.tsx:428-466](src/modules/fda-483/FDA483Page.tsx#L428-L466)) sits between the header and the list. It's red-toned, includes ref number + days remaining, and a "View" button that sets the status filter. **This is the most prominent thing on the page when something is urgent — correct.** ✓
- **Event card** ([EventsTab.tsx:305-440](src/modules/fda-483/tabs/EventsTab.tsx#L305-L440)) — top row: type badge + status badge + reference number + days-remaining pill. Then info row (site/agency/inspection date). Then readiness bar. Then counts (obs/CAPAs/RCA). Then mini step indicator. Then "Open event" link. **That's 6 information layers per card.** A user scanning 20 events sees a wall of small chips.
- **Event detail summary** ([ObservationsTab.tsx:150-215](src/modules/fda-483/tabs/ObservationsTab.tsx#L150-L215)) — top row repeats type+status+reference. Then a 4-up info grid (Agency / Site / Inspection / Deadline). This is appropriate; users need this context once when they open.
- **Submitted success card** ([ResponseTab.tsx:179-256](src/modules/fda-483/tabs/ResponseTab.tsx#L179-L256)) — when the response is submitted, a giant green card duplicates Reference, Submitted timestamp, Signed by, Signature meaning, AND below it a Linked-CAPAs list. The CAPA list is the genuinely-new info; the rest is restating data already visible in the summary above.
- **Response readiness checklist** ([ResponseTab.tsx:258-311](src/modules/fda-483/tabs/ResponseTab.tsx#L258-L311)) — a 7-row list with a percentage that needs interpretation (2 of 7 done = 29% — that math is opaque). The list is visually equal-weighted, so the user can't see which rows are "you must do this" vs "the system tracks this for you" (e.g. "Response within deadline" isn't an action; it's a derived state).

### Why it's a problem

The eye doesn't have a clear "look here first" hierarchy on the event-detail view. The Observations section, the RCA section, the Response section, and the Documents section are all rendered with the SAME card weight, in vertical sequence. There's no visual escalation as the user progresses through the workflow — Section 5 (Sign & Submit, the actual end-state action) looks visually identical to Section 1 (Add observation).

The submitted-success card duplicates 4 fields from the summary above it for visual reassurance, but the cost is real estate that pushes the genuinely-useful "Linked CAPAs status" tracker further down.

### Recommendations

- Promote Sign & Submit visually when the readiness reaches 100% — it's the act the user is here to do, not just another card.
- Demote the submitted-success card's restated fields; lean into the linked-CAPA tracker (the one piece of post-submission info users actually return to check).
- Consider replacing the equal-weight readiness checklist with a 2-section split: "Your remaining work" (items not yet done, in order) vs "System checks" (deadline, signature) so the user knows where to act.

### Severity

**MEDIUM** — the page is functional and the deadline-alert handles the most-critical case. Cosmetic-but-cumulative friction on the detail view.

---

## 2. Navigation flow

### Findings

- **List → detail** is good: click any card on the EventsTab → `currentStep` becomes 2 and `liveEvent` is set → the page renders the stacked detail view. ✓
- **Detail → list** is via two paths: the breadcrumb "FDA 483 & Regulatory Events" link ([FDA483Page.tsx:479](src/modules/fda-483/FDA483Page.tsx#L479)) AND the "← Back to FDA 483 Events" button at the bottom ([FDA483Page.tsx:724](src/modules/fda-483/FDA483Page.tsx#L724)). Both fire `resetWorkflow()`. Same outcome, two affordances. Acceptable for long pages.
- **Breadcrumb text drift**: the breadcrumb label is `"FDA 483 & Regulatory Events"` (with "Events" suffix), but the page header (post-Cat 10 normalisation) is now `"FDA 483 & Regulatory"` (no "Events"). They diverge. Same drift on the back-button label.
- **`currentStep` is dead state.** Lines 199, 511, 558 set `currentStep` to 1, 2, etc., but the render only branches on `currentStep > 1`. There's no condition that distinguishes step 2 (Observations) from step 3 (RCA) from step 4 (Response) — they're always all rendered together. The page LOOKS like it has a 4-step wizard underneath but doesn't.
- **`onGoToObservations` callback is a no-op visually.** Defined in [FDA483Page.tsx:558](src/modules/fda-483/FDA483Page.tsx#L558), passed to `RCATab`. The RCA empty-state has "Go to Observations" button ([RCATab.tsx:90-97](src/modules/fda-483/tabs/RCATab.tsx#L90-L97)) that fires this — but since Observations is already rendered above on the same page, nothing scrolls or focuses. The user is just told "your click was registered" with no visible feedback.
- **"Go to Events"** button in the Observations empty-state ([ObservationsTab.tsx:131-138](src/modules/fda-483/tabs/ObservationsTab.tsx#L131-L138)) — this one DOES work; it calls `resetWorkflow()`. But it only fires when `liveEvent` is null, which shouldn't happen at that render point (the tab is only rendered when liveEvent exists). Dead branch.
- **Filter `View` button** in the top alert ([FDA483Page.tsx:462](src/modules/fda-483/FDA483Page.tsx#L462)) — sets `statusFilter` to "Response Due" + sets `currentStep(1)`. If the user is currently in detail view, this kicks them back to the list with a filter applied. Reasonable, but bare "View" doesn't tell the user that. "Show events" or "View due responses" would be clearer.
- **Inside RCA section**: observation selector at top ([RCATab.tsx:105-122](src/modules/fda-483/tabs/RCATab.tsx#L105-L122)) is a dropdown of `#1 — text...`. There's no inline way to jump to "next observation" / "previous observation" — the user picks each one explicitly.

### Why it's a problem

The "steps" pattern looks like incomplete refactoring residue from when the page WAS tabbed. The dead `currentStep` state + no-op `Go to Observations` button suggests the design was once tab-based but got flattened into stacked sections without removing the navigation primitives that only made sense across tabs. New developers reading the code will be confused.

The breadcrumb/back-button text drift is small but visible.

### Recommendations

- Remove `currentStep` state and the `Step` type — they're dead.
- Remove `onGoToObservations` / `onGoToEvents` callbacks that are no-ops (the `RCATab` "Add observations first" empty-state can keep its visible button text but should scroll to the observations card OR the callback should be deleted entirely).
- Align breadcrumb + back-button text with the page header: either "FDA 483 & Regulatory" or "FDA 483 Events" — pick one and use it in all three places.
- "View" in the deadline alert → "Show due events" or "View overdue".

### Severity

**MEDIUM** — code-hygiene smell that bleeds into UX as silent no-ops. The drift between breadcrumb and header is LOW.

---

## 3. Empty states

### Findings

| Empty-state location | Current text | Has CTA? | Verdict |
|---|---|---|---|
| EventsTab, no events ([EventsTab:245-275](src/modules/fda-483/tabs/EventsTab.tsx#L245-L275)) | "No regulatory events logged yet" + descriptive subtitle + `Log first event` button | ✓ | Good — informative + actionable |
| EventsTab, filters yield nothing ([EventsTab:276-292](src/modules/fda-483/tabs/EventsTab.tsx#L276-L292)) | "No events match the current filters" + `Clear filters` | ✓ | Good |
| ObservationsTab, no liveEvent ([ObservationsTab:117-141](src/modules/fda-483/tabs/ObservationsTab.tsx#L117-L141)) | "Select an event from the Events tab to view observations" + `Go to Events` | ✓ but dead branch | The branch shouldn't be reachable (parent only renders when liveEvent is set); also references "Events tab" which doesn't exist as a tab anymore. |
| Observations table, empty obs list ([ObservationsTab:284-295](src/modules/fda-483/tabs/ObservationsTab.tsx#L284-L295)) | "No observations logged. Click 'Add observation' above." | ✗ inline | Passive — uses "above" to direct the user instead of being the CTA itself. The "Add observation" button IS visible above, so this works in practice, but it's not idiomatic. |
| Commitments, empty ([ObservationsTab:428-435](src/modules/fda-483/tabs/ObservationsTab.tsx#L428-L435)) | "No commitments logged. Add commitments to track response obligations." | ✗ inline | Same passive pattern — the `Add` button is in the card-header, not in the empty-state body. |
| CAPA set, empty ([ObservationsTab:513-520](src/modules/fda-483/tabs/ObservationsTab.tsx#L513-L520)) | "No CAPAs raised yet. Open RCA Workspace to raise CAPAs for each observation." | ✗ — **points to non-existent surface** | **There is NO surface labeled "RCA Workspace"** in this module. The RCA section below is labeled "RCA — Observation #N". The user has to scroll to find it AND mentally map "RCA Workspace" → "the RCA card lower down". |
| RCATab, no liveEvent ([RCATab:55-78](src/modules/fda-483/tabs/RCATab.tsx#L55-L78)) | "Select an event from the Events tab" + `Go to Events` | ✓ but dead branch | Same as above. |
| RCATab, no observations ([RCATab:81-99](src/modules/fda-483/tabs/RCATab.tsx#L81-L99)) | "Add observations first to start RCA analysis." + `Go to Observations` | ✗ — no-op CTA | Button fires `onGoToObservations` which doesn't visibly do anything (see Cat 2). |
| ResponseTab, no liveEvent ([ResponseTab:86-110](src/modules/fda-483/tabs/ResponseTab.tsx#L86-L110)) | "Select an event from the Events tab" + `Go to Events` | ✓ but dead branch | Same pattern. |
| Response draft, empty ([ResponseTab:332-336](src/modules/fda-483/tabs/ResponseTab.tsx#L332-L336)) | "No draft yet. Use Edit Draft to write one, or AGI Draft to generate from your observations and CAPAs." | ✗ — references buttons that ARE visible below | Acceptable — the buttons are right there in the same card. |
| AGI draft modal, empty ([ResponseTab:480-482](src/modules/fda-483/tabs/ResponseTab.tsx#L480-L482)) | "No draft available. Click Generate to create one from observations and CAPAs." | ✗ — but there's no Generate button in this state | **Dead-end empty state.** When `liveEvent.agiDraft` is null AND `agiLoading` is false, the modal shows "Click Generate" but there's no Generate button rendered. The user is stuck. |

### Why it's a problem

The "Open RCA Workspace to raise CAPAs" line is the worst — it's giving the user instructions referencing a UI element name that doesn't appear anywhere on screen. The user thinks they're missing something.

The "Go to Events" / "Go to Observations" buttons in dead-branch empty states are harmless but accumulate noise.

The AGI modal's "Click Generate" empty state is a real dead-end — there's no Generate button rendered when no draft exists yet (the generation auto-triggers on modal open via `setTimeout`, so this branch is theoretical, but if the auto-trigger ever fails the user has no recovery).

### Recommendations

- Rename "RCA Workspace" to "RCA section" or "RCA card" — match what users actually see.
- Add an explicit "Generate draft" button in the AGI modal's empty state, so the user has a recovery action.
- Audit and remove dead-branch empty states (the "select an event from Events tab" branches that can't render in practice).
- For the inline-passive empty states ("Click X above"): either make the empty-state include the button itself, or accept this as the project's idiom.

### Severity

**HIGH** for the "Open RCA Workspace" reference (it's a functional dead-end for new users); **MEDIUM** for the AGI dead-end; **LOW** for the rest.

---

## 4. CTA clarity

### Findings — every primary CTA in the module

| Label | Where | What it does | Clarity |
|---|---|---|---|
| `Register Event` | Header [FDA483Page:420](src/modules/fda-483/FDA483Page.tsx#L420) | Opens AddEventModal | ✓ clear |
| `Open event` | EventsTab card [EventsTab:437](src/modules/fda-483/tabs/EventsTab.tsx#L437) | Selects event → detail view | ✓ clear |
| `View` | Top deadline alert [FDA483Page:464](src/modules/fda-483/FDA483Page.tsx#L464) | Sets status filter to "Response Due" + returns to list | ✗ ambiguous — "View what?" |
| `Add observation` | ObservationsTab summary [ObservationsTab:210](src/modules/fda-483/tabs/ObservationsTab.tsx#L210) | Opens AddObservationModal | ✓ clear |
| `Add` | Commitments card-header [ObservationsTab:423](src/modules/fda-483/tabs/ObservationsTab.tsx#L423) | Opens AddCommitmentModal | ✗ bare "Add" — context-dependent; compare to "Add observation" in the same module |
| `Save RCA` | RCA cards [RCATab:251,338,387](src/modules/fda-483/tabs/RCATab.tsx#L251) | Persists root cause + bumps obs status | ✓ clear |
| `Raise CAPA for this observation` | RCA bottom [RCATab:420](src/modules/fda-483/tabs/RCATab.tsx#L420) | Calls `raiseCAPAFromObservation` server action | ✓ verbose but clear |
| `Edit Draft` | Response card [ResponseTab:340](src/modules/fda-483/tabs/ResponseTab.tsx#L340) | Opens textarea modal | ✓ clear if draft exists; opaque if empty |
| `AGI Draft` | Response card [ResponseTab:350](src/modules/fda-483/tabs/ResponseTab.tsx#L350) | Opens AGI modal + auto-generates | ✗ **"AGI" is opaque jargon (see Cat 9)** |
| `Use this draft` | AGI modal [ResponseTab:477](src/modules/fda-483/tabs/ResponseTab.tsx#L477) | Overwrites the user's draft with the AGI one + opens Edit modal | ✗ — destructive on existing draft; no confirmation |
| `Edit this draft` | AGI modal [ResponseTab:472](src/modules/fda-483/tabs/ResponseTab.tsx#L472) | Copies AGI text into Edit modal | ✓ clear |
| `Save Draft` | Edit modal [ResponseTab:445](src/modules/fda-483/tabs/ResponseTab.tsx#L445) | Persists draft | ✓ clear |
| `Sign & Submit to FDA` | Response bottom [ResponseTab:414](src/modules/fda-483/tabs/ResponseTab.tsx#L414) | Opens SignSubmitModal | ✓ clear + helper text below |
| `Sign & Submit` | SignSubmit modal [SignSubmitModal:167](src/modules/fda-483/modals/SignSubmitModal.tsx#L167) | Performs Part 11 signature | ✓ clear, gated on meaning + password |
| `← Back to FDA 483 Events` | Detail bottom [FDA483Page:724](src/modules/fda-483/FDA483Page.tsx#L724) | Returns to list | ✓ clear (but see Cat 2 drift) |
| `Register Event` (modal submit) | AddEventModal [AddEventModal:282](src/modules/fda-483/modals/AddEventModal.tsx#L282) | Persists event | ✓ matches modal title |
| `Add observation` (modal submit) | AddObservationModal [AddObservationModal:216](src/modules/fda-483/modals/AddObservationModal.tsx#L216) | Persists observation OR shows `Save` when editing | ✓ |
| `Save` (modal submit while editing) | AddObservationModal [AddObservationModal:216](src/modules/fda-483/modals/AddObservationModal.tsx#L216) | Updates observation | ⚠ bare "Save" — convention is "Save changes" elsewhere |
| `Add commitment` (modal submit) | AddCommitmentModal [AddCommitmentModal:157](src/modules/fda-483/modals/AddCommitmentModal.tsx#L157) | Persists commitment | ✓ |
| `Log first event` | EventsTab empty [EventsTab:272](src/modules/fda-483/tabs/EventsTab.tsx#L272) | Opens AddEventModal | ✓ different verb than "Register" — see consistency note |

**Destructive actions**: there are no hard-delete buttons in this module (events/observations/commitments aren't deletable from the UI — only updatable). The closest to destructive is "Use this draft" (overwrites the user's draft) without confirmation.

### Verb inconsistency within the module

- **"Register Event"** (header + modal submit) vs **"Log first event"** (empty-state CTA) vs **"Log regulatory events"** (subtitle copy). Three verbs for the same action.
- **"Add observation"** vs **"Add"** (Commitments). Verb dropped when context is implied.

### Why it's a problem

The two real CTAs that warrant attention:
- `AGI Draft` — the page's most user-visible "what is this" button. Discussed in Cat 9.
- `Use this draft` — silent overwrite of in-progress user work. Likely a real data-loss risk if a user has been editing their draft and then clicks "AGI Draft" → "Use this draft" without realising.

### Recommendations

- "AGI Draft" → "Generate AI draft" (drops the project-specific "AGI" branding from the button surface; modal title can keep the brand).
- "View" in the top deadline alert → "Show due events".
- `Use this draft` → add a confirmation if `responseDraft` is non-empty: "Replace your draft?"
- "Add" in the Commitments header → "Add commitment" (match the "Add observation" pattern).
- Standardise the create verb: pick "Log" OR "Register" and use it in all three places (header button, empty-state CTA, subtitle copy).
- "Save" inside AddObservationModal (edit mode) → "Save changes" (matches Cat 4 pattern from the wider audit).

### Severity

**HIGH** for `Use this draft` no-confirm overwrite (real data-loss vector); **MEDIUM** for `AGI Draft` opacity; **LOW** for the other verb / wording inconsistencies.

---

## 5. Status / severity consistency

### Findings

**Severity** — observation severity is `["Critical", "High", "Low"]`. Three sites:
- Form schema [AddObservationModal:15](src/modules/fda-483/modals/AddObservationModal.tsx#L15) — 3-tier
- Dropdown options [AddObservationModal:117-121](src/modules/fda-483/modals/AddObservationModal.tsx#L117-L121) — 3-tier
- Badge rendering [ObservationsTab:52](src/modules/fda-483/tabs/ObservationsTab.tsx#L52) — uses `getSeverityVariant(s, "generic")` and `normalizeSeverityForDisplay(s, "generic")` ✓ (post-Cat 1 unification)

Per the recent Cat 1 work, FDA483Observation is officially classified as **GENERIC taxonomy** (Critical/High/Medium/Low). The form schema is one tier behind (no Medium), but the badge rendering would handle Medium correctly if it were ever added. **Not a bug.**

The audit prompt asked whether observations should be FDA taxonomy (Critical/Major/Minor) per regulatory convention. The team's Cat 1 decision was to keep observations on GENERIC because "Critical/High/Low" is what the existing data uses and what the form has always shown. **The audit notes this is defensible** — Critical/Major/Minor is FDA-regulatory language for the OVERALL inspection finding, but per-observation severity within a 483 can reasonably use the generic risk scale. **Flag but do not change.**

**Event status** — 9-value TitleCase taxonomy: `Open / Under Investigation / Response Due / Response Drafted / Pending QA Sign-off / Response Submitted / FDA Acknowledged / Closed / Warning Letter`. The colour map is defined inline in **three files**, bit-identically:
- [FDA483Page.tsx — used indirectly via tab children]
- [EventsTab.tsx:29-42](src/modules/fda-483/tabs/EventsTab.tsx#L29-L42) `eventStatusBadge`
- [ObservationsTab.tsx:36-49](src/modules/fda-483/tabs/ObservationsTab.tsx#L36-L49) `eventStatusBadge`

The same 9→colour map is repeated. Change one, the other two lag.

**Observation status** — form schema allows 7 values:
- `["Open", "In Progress", "RCA In Progress", "CAPA Linked", "Response Ready", "Response Drafted", "Closed"]` at [AddObservationModal:16](src/modules/fda-483/modals/AddObservationModal.tsx#L16)

But the dropdown in the same form shows only 4: `["Open", "RCA In Progress", "Response Drafted", "Closed"]` ([AddObservationModal:193-197](src/modules/fda-483/modals/AddObservationModal.tsx#L193-L197)).

And the badge map (`obsStatBadge` at [ObservationsTab:55-63](src/modules/fda-483/tabs/ObservationsTab.tsx#L55-L63)) only knows 4: `Open / RCA In Progress / Response Drafted / Closed`. The 3 other server-side values (`"In Progress"`, `"CAPA Linked"`, `"Response Ready"`) silently fall back to grey.

This is THREE different definitions of "observation status" in the same module — schema (7), dropdown (4), badge (4). The schema allows values the UI doesn't render meaningfully.

**Effective status** ([FDA483Page.tsx:56-61](src/modules/fda-483/FDA483Page.tsx#L56-L61)) silently overrides the stored `Open` status to "Response Due" when the deadline is within 15 days. This logic is duplicated in [EventsTab.tsx:48-53](src/modules/fda-483/tabs/EventsTab.tsx#L48-L53) and [ObservationsTab.tsx:69-74](src/modules/fda-483/tabs/ObservationsTab.tsx#L69-L74). Three copies of the same helper.

**Commitment status** — 4-value TitleCase `["Pending", "In Progress", "Complete", "Overdue"]`, defined in [AddCommitmentModal:12](src/modules/fda-483/modals/AddCommitmentModal.tsx#L12). NOT centralised in `statusTaxonomy.ts`'s FDA483 entries. Inline.

**Constants centralisation** — `FDA483_EVENT_STATUSES` IS used in [FDA483Page.tsx:412](src/modules/fda-483/FDA483Page.tsx#L412) for the `<StatusGuide>` component, but the badge colour maps are NOT sourced from this constant. So the central taxonomy gives users the legend, but the per-cell rendering uses inline duplicates.

### Why it's a problem

The 3× duplicate `eventStatusBadge` means a new event status added in `FDA483_EVENT_STATUSES` (the central definition) won't get a colour anywhere without 3 edits. The 7-value-schema / 4-value-badge gap means writing data that the UI can't render. The 3× duplicate `getEffectiveStatus` is a calculation that could disagree if someone changes one but not the others.

### Recommendations

- Hoist `eventStatusBadge`, `eventTypeBadge`, `obsStatBadge`, `obsSevBadge`, `getEffectiveStatus` into a single `src/modules/fda-483/_shared.ts` or co-locate beside `FDA483_EVENT_STATUSES` in `statusTaxonomy.ts`.
- Either narrow the schema to 4 values OR widen the badge map to 7. The schema-allows-but-UI-ignores values is data-corruption-by-omission.
- Add FDA 483 observation & commitment statuses to `src/constants/statusTaxonomy.ts` as `FDA483_COMMITMENT_STATUSES` etc.
- The "effective status" override is a useful concept — keep it, but extract it to a single helper that the central taxonomy consumes.

### Severity

**HIGH** — duplicate map maintenance hazard + schema/UI mismatch can silently strand data in unrenderable states.

---

## 6. Visual hierarchy

### Findings

- **Typographic scale** is mostly consistent: `text-[10px]` (uppercase labels), `text-[11px]` (secondary), `text-[12px]` (primary body), `text-[13px]` (RCA problem statements), `text-[14px]` (submitted banner), `text-[18px]` (readiness percent), `text-[20px]` (stat values). Five distinct sizes — acceptable for a dense workflow surface, but no `text-base` / `text-sm` Tailwind tokens; everything is bracket-literal. Hard to grep.
- **Colour usage**: inline `style={{ color: "var(--text-primary)" }}` / `var(--text-secondary)` / `var(--text-muted)` is used consistently across the module. ✓
- **Brand colour** `#0ea5e9` (sky-500) is used for reference-number text, Document upload section, and "Linked CAPAs". The brand variable `var(--brand)` is used in the breadcrumb back-link. **Two ways to spell the same brand colour.** Inconsistent.
- **Status / severity colours** — Critical→red, High/major/Medium→amber, Low/Minor→green (per the Cat 1 unification). All consistent within this module post-refactor. ✓
- **Card padding** — all cards use the central `.card` / `.card-header` / `.card-body` classes (defined in index.css). Consistent. ✓
- **White space** — sections separated by `space-y-6` on the detail view (good breathing room). EventsTab cards use `space-y-3` between rows (slightly tight at high density, fine).
- **Mini step indicator** in event cards ([EventsTab.tsx:405-424](src/modules/fda-483/tabs/EventsTab.tsx#L405-L424)) uses raw Unicode glyphs (`✓` checkmark, `○` circle, `↻` clockwise arrow) inline. Works visually, but they're styled differently than the centralised `<CheckCircle2>` icons used in ResponseTab's readiness checklist. Same semantic meaning, two icon systems.
- **Stat tile badge values** (e.g. "Open: 4") use `text-[20px]` bold with a coloured text style. Three of four tiles colour-code based on a count threshold ([EventsTab:143-163](src/modules/fda-483/tabs/EventsTab.tsx#L143-L163)) — open→amber if >0 else green; due→red if >0 else green; total-obs→indigo regardless. Each tile uses a different threshold rule, ad-hoc.

### Why it's a problem

The two brand colour spellings (`#0ea5e9` literal vs `var(--brand)`) drift over time. The stat tile colour rules are individually defensible but vary across tiles, so they don't read as a system.

The mini step indicator + readiness checklist using different glyph systems for the same "done / in-progress / not-done" semantics is a small visual rhythm break.

### Recommendations

- Single brand spelling: pick `var(--brand)` and replace the 5+ `#0ea5e9` literals.
- Unify the step-indicator icons with the readiness checklist (both should use `<CheckCircle2>` / `<Circle>` from lucide).
- Stat tile colour rule should be a single function: `severityColor(count, thresholds)` shared across all four tiles.

### Severity

**LOW** — cosmetic; nothing breaks. But a fresh designer will notice it.

---

## 7. Repeated information

### Findings — the reference number appears **5 places** on the detail view

| Where | File:line | Purpose |
|---|---|---|
| Card list (still visible if "Back to list" was used) | [EventsTab:323-325](src/modules/fda-483/tabs/EventsTab.tsx#L323) | List row identifier |
| Breadcrumb | [FDA483Page:482](src/modules/fda-483/FDA483Page.tsx#L482) | Current-page indicator |
| Event summary header (top of ObservationsTab) | [ObservationsTab:157-159](src/modules/fda-483/tabs/ObservationsTab.tsx#L157-L159) | Context for the card content below |
| Submitted success card (if applicable) | [ResponseTab:197](src/modules/fda-483/tabs/ResponseTab.tsx#L197) | Restated for post-submission confirmation |
| Edit Draft modal | [ResponseTab:431](src/modules/fda-483/tabs/ResponseTab.tsx#L431) | Modal context |
| AGI Draft preamble (the generated text starts with `REGULATORY RESPONSE — {ref}`) | [FDA483Page:710](src/modules/fda-483/FDA483Page.tsx#L710) | Body of the draft |
| SignSubmit modal | [SignSubmitModal:74](src/modules/fda-483/modals/SignSubmitModal.tsx#L74) | Final confirmation |

That's **6 places** the reference number is rendered when a user signs and submits. Each instance is justifiable in isolation — the modals need their own context — but the breadcrumb + summary header + ResponseTab cards all duplicate it within the SAME viewport.

### Findings — status / type duplication

- **Type + status badges** appear in (1) EventsTab card header, (2) ObservationsTab summary header, (3) SignSubmit modal context card, (4) ResponseTab submitted card (as "Locked" green badge), (5) Response draft card title (as "Submitted ✓" badge).

### Findings — deadline duplication

- Days remaining: EventsTab pill ("X days remaining")
- Top alert: "X day(s) remaining"
- Info grid: "Deadline: DD/MM/YYYY"
- Readiness check: "Response within deadline" ✓/✗
- AGI draft preamble: `dated {inspectionDate}` (uses inspection date, not deadline — but related)

### Findings — site name duplication

- EventsTab card info row
- Event summary info grid

(Twice on the detail view — reasonable since the list and detail show different fields)

### Why it's a problem

Reference number 6× and status 5× isn't necessarily wrong — each instance serves a context — but together they fill visual real estate. The breadcrumb + the summary header repeat the same ref within 200px on screen.

The top deadline alert always appears when an urgent event exists, AND every individual urgent event also shows "X days remaining" in its card. If three urgent events exist, the user sees "X days remaining" four times on a scroll.

### Recommendations

- The breadcrumb can drop the ref number on small viewports OR the summary header can hide the ref when the breadcrumb is visible (sometimes the breadcrumb is the only nav indicator).
- The submitted success card duplicates 4 fields from the summary above — consider collapsing those into a footer line under the summary instead of a separate card.
- The top alert can be a count summary ("3 deadlines within 5 days — review") rather than a per-event listing, since the cards below already render each event's countdown.

### Severity

**LOW** — repetition is a usability tax, not a defect. Tolerable for a regulated product where over-confirmation is valued.

---

## 8. User confusion points

### Findings

- **"Response readiness 29%"** ([ResponseTab:258-281](src/modules/fda-483/tabs/ResponseTab.tsx#L258-L281)) — the percentage = `(checks done / 7) * 100`. With 2 of 7 done, that's 28.57% rounded to 29%. **The user has no way to derive this from looking at the checklist** unless they count. Why not just show "2 of 7 complete"?
- **Checklist items mix concerns.** Look at the 7 rows ([ResponseTab:132-172](src/modules/fda-483/tabs/ResponseTab.tsx#L132-L172)):
  - "All observations have RCA" (your work)
  - "All CAPAs raised and closed" / "CAPAs raised (X/Y) — pending closure" (your work + dependent state)
  - "Response documents attached (N)" (your work)
  - "Response draft written" (your work)
  - "All commitments have due dates" (your work)
  - "Response within deadline" (derived state — NOT something to act on)
  - "Signed and submitted" (the final action)
  
  Item 6 is a derived state ("deadline isn't past"); it goes red when the deadline passes, but the user can't "do" anything about it. Item 7 is the FINAL action that the checklist itself unlocks. Item 7 should arguably be promoted to the Sign & Submit button below, not be a checklist item.
- **"Open RCA Workspace"** in the CAPA-set empty-state — there's no surface labeled "RCA Workspace" (see Cat 3).
- **Effective status override** ([FDA483Page:56-61](src/modules/fda-483/FDA483Page.tsx#L56-L61)) — silently changes the rendered status from "Open" to "Response Due" when the deadline is ≤15 days. The stored DB status remains "Open". A user looking at "Response Due" in the UI and "Open" in an audit trail entry would be confused.
- **Commitments vs CAPAs** — both are vertical-list cards in the same view, both have due dates and owners, both have status badges. The distinction (Commitment = "we promise the FDA we'll do X"; CAPA = internal corrective work) is regulatory standard but obscure to a new user. There's no inline explanation in the UI.
- **AGI auto-generation timing** ([ResponseTab:343-352](src/modules/fda-483/tabs/ResponseTab.tsx#L343-L352)) — clicking "AGI Draft" opens the modal AND auto-fires `onGenerateAGIDraft` if no draft exists, AFTER a `setTimeout(2000)` delay. The user sees a spinner for 2 seconds with no explanation that the AI is running. The 2-second delay is a UX choice (not a real network call latency) but reads as if the AI is "thinking".
- **"FEI 3004795103"** placeholder in the event modal Reference field ([AddEventModal:148](src/modules/fda-483/modals/AddEventModal.tsx#L148)) — FEI = FDA Establishment Identifier. The placeholder gives a real-looking value but no explanation.
- **Inspection date vs Response deadline auto-calc** ([AddEventModal:72-79](src/modules/fda-483/modals/AddEventModal.tsx#L72-L79)) — picking an inspection date AUTOMATICALLY sets the deadline to inspection + 15 working days (or 30 for Warning Letter). The deadline field gets overwritten without explanation. There's a small caption below ("FDA: 15 working days from receipt") that explains the rule, but a user manually picking a different deadline first will see their value silently replaced when they change the inspection date.

### Why it's a problem

The Response Readiness percentage and the auto-deadline behaviour are both helpful intent done in a way that's invisible to the user. The "Open RCA Workspace" misdirection is the loudest confusion vector.

The 2-second AGI fake-delay is questionable — if there's no real AI call latency, a delay creates the IMPRESSION of computation that isn't happening.

### Recommendations

- Replace "29%" with "2 of 7 complete" OR show both. Numerator/denominator is the unambiguous form.
- Move "Signed and submitted" out of the checklist — make it the explicit Sign & Submit affordance.
- Demote "Response within deadline" to a separate deadline indicator above the checklist, since it's not actionable work.
- Explain the auto-deadline override in the modal: "Picking inspection date will set the deadline to inspection + 15 working days. You can override below."
- "Open RCA Workspace" → "Scroll to the RCA section below."
- Replace the 2-second `setTimeout` with either a real network call or no delay — the fake "AI thinking" delay is misleading.
- Inline definition for FEI in the placeholder caption: "e.g. FDA Establishment Identifier 3004795103".

### Severity

**HIGH** for the readiness-checklist mixed concerns (every regulator-facing workflow needs the user to know what's their work vs the system's), **MEDIUM** for the rest.

---

## 9. Terminology / jargon

### Findings — every domain term in the UI

| Term | Where | Domain-necessary? | Verdict |
|---|---|---|---|
| **AGI** ("AGI Draft", "AGI Response Draft") | ResponseTab buttons + modal | ✗ — internal product brand | **Replace** with "AI" or just "Generate draft" |
| **AGI panel** (CSS class `agi-panel`) | ResponseTab | ✗ — internal | Internal style hook; user-invisible. OK to keep. |
| Response readiness | ResponseTab | ✓ — regulator-standard | Acceptable; needs the "2 of 7" reframing per Cat 8 |
| Commitments | ObservationsTab, AddCommitmentModal | ✓ — regulator-standard | Define inline at first appearance |
| Observations | Throughout | ✓ — FDA 483 standard | Acceptable |
| FDA 483 | Throughout | ✓ — proper noun | A "483" is the FDA's formal observation form; never expanded in-app. Acceptable for the audience but a tooltip on first appearance would help new users. |
| Inspection date | AddEventModal, summary | ✓ | Clear |
| Response deadline | Throughout | ✓ | Clear |
| Response due | Status badge | ✓ | Same concept as "deadline approaching" — slightly redundant vocabulary with "Response deadline" |
| Pending QA Sign-off | Event status | ✓ — QA is project-standard | QA is defined elsewhere in the app; consistent |
| RCA / RCA Workspace | Throughout | ✓ — Root Cause Analysis | RCA expanded nowhere; assumed knowledge. **The "RCA Workspace" label is bad because nothing in the UI is labeled "RCA Workspace"** — it's labeled "RCA — Observation #N". |
| 5 Why, Fishbone, Fault Tree, Barrier Analysis | RCA method buttons | ✓ — well-known QMS methods | Acceptable; no inline definition needed for the target audience |
| FEI (Establishment Identifier) | Modal placeholder | ✗ — opaque acronym | Expand inline |
| GxP signature / GxP electronic signature / GxP e-signature | SignSubmit modal | ✓ — regulatory standard | Acceptable but **two abbreviation styles ("GxP electronic signature" vs "GxP e-signature") in the same modal** ([SignSubmitModal:59](src/modules/fda-483/modals/SignSubmitModal.tsx#L59) vs [ResponseTab:421](src/modules/fda-483/tabs/ResponseTab.tsx#L421)) |
| 21 CFR Part 11 | SignSubmit modal | ✓ — regulator-standard | Acceptable |
| Warning Letter | Event types | ✓ — FDA escalation tier | Acceptable |
| Effective status | Internal — not user-facing | n/a | Internal computed concept |
| Submitted ✓ / Submitted / Locked | Various badges | ✓ — but 3 overlapping forms | Pick one |
| Sign & Submit / Sign and submit / Signed and submitted | Various places | ✓ — but 3 conjugations | Pick one consistent verbing |

### Why it's a problem

"AGI" is the only term that doesn't pull domain weight. Every other regulator-flavoured term ("Commitments", "Response readiness", "FDA 483", "RCA") is the actual language the audience uses, and replacing them would make the product LESS legible to QA professionals. The risk is the opposite: a junior new hire using the product without prior FDA 483 experience.

The duplicate-vocabulary cases ("Sign & Submit" vs "Signed and submitted" vs "Submitted ✓") are minor cosmetic drift.

### Recommendations

- **"AGI Draft" button → "Generate AI draft"**. Modal title can keep "AGI Response Draft" if the brand wants to retain "AGI" in the product surface, but the BUTTON should explain what happens.
- **"RCA Workspace" empty-state phrase → "the RCA section below"** (the surface isn't labeled "Workspace" anywhere).
- **Standardise GxP signature phrasing** — pick "GxP electronic signature" or "GxP e-signature" and use one across the module.
- **FEI placeholder** — append "(FDA Establishment Identifier)" to the placeholder hint.
- **Add a tooltip / info icon next to "Response readiness"** that says "Counts how many of the 7 readiness checks are complete."

### Severity

**MEDIUM** — AGI opacity is the biggest single thing; the rest are small drift.

---

## 10. Mobile usability

### Findings — components that would break or render poorly on 375px

- **Observations table** ([ObservationsTab:259-396](src/modules/fda-483/tabs/ObservationsTab.tsx#L259-L396)) — 9 columns (#, Observation, Area, Regulation, Severity, RCA, CAPA, Status, Actions). Wrapped in `overflow-x-auto` so it horizontally scrolls; usable but not pleasant on phone. ⚠
- **AddEventModal** ([AddEventModal:102](src/modules/fda-483/modals/AddEventModal.tsx#L102)) — `<div className="grid grid-cols-2 gap-3">` with no responsive breakpoint. On 375px, two-column form fields become very tight. Inputs collapse to ~150px wide. **Needs `grid-cols-1 sm:grid-cols-2`.** ⚠⚠
- **AddObservationModal** ([AddObservationModal:85](src/modules/fda-483/modals/AddObservationModal.tsx#L85)) — same `grid-cols-2 gap-3` no-breakpoint pattern. ⚠⚠
- **AddCommitmentModal** ([AddCommitmentModal:57](src/modules/fda-483/modals/AddCommitmentModal.tsx#L57)) — same. ⚠⚠
- **Event summary 4-up grid** ([ObservationsTab:161](src/modules/fda-483/tabs/ObservationsTab.tsx#L161)) — `grid-cols-2 lg:grid-cols-4 gap-3`. Responsive ✓
- **EventsTab stat tiles** ([EventsTab:115](src/modules/fda-483/tabs/EventsTab.tsx#L115)) — `grid-cols-2 lg:grid-cols-4`. Responsive ✓
- **Event card header row** ([EventsTab:319-326](src/modules/fda-483/tabs/EventsTab.tsx#L319-L326)) — `flex items-start justify-between flex-wrap gap-2` — wraps on narrow screens ✓
- **Breadcrumb** ([FDA483Page:472-484](src/modules/fda-483/FDA483Page.tsx#L472-L484)) — no flex-wrap; ref number could wrap awkwardly with the chevron separator.
- **Top deadline alert** ([FDA483Page:428-466](src/modules/fda-483/FDA483Page.tsx#L428-L466)) — `flex items-start gap-3` with View button on the right. Will the button wrap below the text on narrow viewports? Yes — `flex` without `flex-wrap`. The View button may end up squeezed against the right edge.
- **RCA observation selector** ([RCATab:112-121](src/modules/fda-483/tabs/RCATab.tsx#L112-L121)) — Dropdown has `width="w-72"` (288px) which is wider than a 375px viewport with padding. On phone, the dropdown will overflow.
- **5 Why input list** ([RCATab:197-226](src/modules/fda-483/tabs/RCATab.tsx#L197-L226)) — `flex items-start gap-3` per row with numbered circle + input. Works fine on narrow.
- **Fishbone 6-category grid** ([RCATab:285](src/modules/fda-483/tabs/RCATab.tsx#L285)) — `grid-cols-1 lg:grid-cols-2 gap-3` — responsive ✓
- **Edit Draft modal textarea** ([ResponseTab:434](src/modules/fda-483/tabs/ResponseTab.tsx#L434)) — `rows={14} resize-none` — 14 rows is tall on mobile but the textarea fills width. Usable.
- **AGI Draft modal preview text** ([ResponseTab:466](src/modules/fda-483/tabs/ResponseTab.tsx#L466)) — `max-h-[320px] overflow-y-auto whitespace-pre-wrap`. OK.
- **SignSubmit modal** ([SignSubmitModal](src/modules/fda-483/modals/SignSubmitModal.tsx)) — stacked layout, no horizontal grids. Mobile-OK ✓
- **Submitted success card 4-up info grid** ([ResponseTab:194](src/modules/fda-483/tabs/ResponseTab.tsx#L194)) — `grid-cols-1 sm:grid-cols-2 gap-3` — responsive ✓

### Why it's a problem

The four modals (`AddEventModal`, `AddObservationModal`, `AddCommitmentModal`, and the inline modals in ResponseTab) use a hard-coded 2-column grid with no `sm:` breakpoint. On 375px wide, every text input ends up around 140-150px wide, which makes typing dates and regulation codes ("21 CFR 211.68") cramped.

The observations table is the worst single mobile experience — 9 columns with horizontal scroll. For phone users, this means scrolling sideways to even see severity.

### Recommendations

- All form-grid modals → `grid-cols-1 sm:grid-cols-2 gap-3` (one-column on mobile, two-column ≥640px).
- Observations table → consider a stacked card layout below `md:` breakpoint, where each observation becomes a vertical card.
- RCA observation selector dropdown → `w-full sm:w-72`.
- Deadline alert → `flex-wrap` so the View button wraps below the text on narrow screens.

### Severity

**MEDIUM** — works but not pleasant on phone. If the QA Head is reviewing on a tablet (likely use case), this is mostly OK. Phone usage will hit pain.

---

## 11. Component consistency

### Findings — compared to CAPA module + canonical primitives

**Inline-defined badge helpers (duplicated 2-3 times):**
- `eventTypeBadge` defined identically in [EventsTab:18](src/modules/fda-483/tabs/EventsTab.tsx#L18), [ObservationsTab:25](src/modules/fda-483/tabs/ObservationsTab.tsx#L25), [SignSubmitModal:8](src/modules/fda-483/modals/SignSubmitModal.tsx#L8). Three copies.
- `eventStatusBadge` in [EventsTab:29](src/modules/fda-483/tabs/EventsTab.tsx#L29), [ObservationsTab:36](src/modules/fda-483/tabs/ObservationsTab.tsx#L36). Two copies.
- `getEffectiveStatus` in [FDA483Page:56](src/modules/fda-483/FDA483Page.tsx#L56), [EventsTab:48](src/modules/fda-483/tabs/EventsTab.tsx#L48), [ObservationsTab:69](src/modules/fda-483/tabs/ObservationsTab.tsx#L69). Three copies.
- `daysLeft` helper duplicated in the same 3 files.
- `obsSevBadge`, `obsStatBadge` only in ObservationsTab (single source) — these are fine.

**Use of central primitives:**
- ✓ `<Modal>` from `@/components/ui/Modal` — used in all 4 modals
- ✓ `<Button>` from `@/components/ui/Button` — used throughout
- ✓ `<Badge>` from `@/components/ui/Badge` — used throughout
- ✓ `<Dropdown>` from `@/components/ui/Dropdown` — used in modals + filters
- ✓ `<DocumentUpload>` from `@/components/shared` — used for response documents
- ✓ `<NoSitesPopup>` from `@/components/shared` — reused
- ✓ `<StatusGuide>` from `@/components/shared` — reused for event statuses
- ✓ `getSeverityVariant` + `normalizeSeverityForDisplay` from `@/lib/badgeVariants` — used post-Cat 1
- ✗ **`<Popup>`** from `@/components/ui/Popup` is used for 7 different success / error popups in [FDA483Page:803-852](src/modules/fda-483/FDA483Page.tsx#L803-L852). Every other module (CAPA, Deviation, Customer admin) uses `useToast()` for transient feedback. **FDA 483 is the odd one out — Popup is modal-blocking; toast is non-blocking.** A user submitting an RCA gets a popup that requires dismissal; in CAPA, a similar action shows a toast that auto-dismisses.
- ✗ **`<SignCloseModal>` (CAPA's signature pattern)** is NOT reused — FDA 483 has its own `SignSubmitModal` with similar shape but different implementation. The CAPA `SignCloseModal` and `signCloseRecord` server pipeline could have been a shared primitive.
- ✗ The "Edit Draft" textarea modal in [ResponseTab:428](src/modules/fda-483/tabs/ResponseTab.tsx#L428) is custom-built; similar inline-editor patterns exist in the CAPA RCA section but are also custom. No shared `<DraftEditorModal>` primitive.
- ✗ The mini step indicator in EventsTab card uses Unicode glyphs; CAPA's lifecycle uses `<CheckCircle2>` lucide icons.

**Modal title casing:**
- "Register Regulatory Event" — TitleCase
- "Add observation" — sentence-case (matches Cat 9 audit's chosen convention)
- "Edit observation" — sentence-case ✓
- "Add commitment" — sentence-case ✓
- "Sign & Submit to FDA" — TitleCase with ampersand
- "Response Draft" — TitleCase
- "AGI Response Draft" — TitleCase

Three TitleCase, four sentence-case in the same module. Per the wider Cat 9 audit recommendation, action modals should be sentence-case. So 3 of 7 are off-convention.

**Form patterns:**
- All 4 modals use `react-hook-form` + `zodResolver` ✓ (consistent with CAPA / Deviation modules)
- All 4 use the same field-label styling (`text-[11px] font-semibold uppercase tracking-wider`) ✓
- All 4 use the same `<Button variant="primary" type="submit" loading={form.formState.isSubmitting}>` pattern ✓
- All 4 have a `Cancel` + primary-submit button row pattern ✓

### Why it's a problem

The 3× inline-duplicated badge helpers and 3× duplicated `getEffectiveStatus` are pure code rot — they'll drift the next time anyone tweaks a colour or threshold. The `<Popup>` vs `useToast` inconsistency is a real UX difference: blocking modal popup vs non-blocking toast changes how the user perceives the action's completion.

The custom `SignSubmitModal` is the trickiest miss — it's domain-correct (signs an FDA response, not a CAPA closure), but the underlying Part 11 pattern (password + signature meaning + content hash) is identical and could be a shared primitive.

### Recommendations

- Extract `eventTypeBadge`, `eventStatusBadge`, `getEffectiveStatus`, `daysLeft` into `src/modules/fda-483/_shared.ts`. Single source for the 3× duplicates.
- Replace all 7 `<Popup>` uses in FDA483Page with `useToast()` calls — matches every other module's pattern, and toast is non-blocking which is correct for transient confirmations.
- Standardise modal title casing: pick sentence-case for action modals → "Register regulatory event", "Sign & submit to FDA", "Response draft", "AGI response draft". (Per the wider Cat 9 fix.)
- Long-term: consider a shared `<Part11SignModal>` primitive that both `SignCloseModal` (CAPA) and `SignSubmitModal` (FDA483) compose. Out of scope for this rung.

### Severity

**HIGH** for the duplicated badge helpers (maintenance hazard); **MEDIUM** for the Popup vs toast inconsistency (user-perceptible UX difference); **LOW** for modal title casing (cosmetic).

---

## Prioritized fix list

Five fixes ordered by impact-to-effort ratio. Each entry is intended to be one rung.

### 1. Consolidate duplicate FDA 483 badge/status helpers (Cat 5 + Cat 11)

**What to change**: Extract `eventTypeBadge`, `eventStatusBadge`, `obsStatBadge`, `getEffectiveStatus`, `daysLeft` into a single `src/modules/fda-483/_shared.tsx` module. Have `EventsTab`, `ObservationsTab`, `SignSubmitModal`, and `FDA483Page` import from there. Audit the observation-status schema vs badge map (currently 7 vs 4 values) and reconcile.

**Why first**: Eliminates the most dangerous code-rot vector in the module (3× inline duplicates that will silently drift). Also fixes the schema/UI status gap. Touches multiple files mechanically.

**Effort**: M — careful sweep + add 3 new status keys to the badge map.

### 2. Fix the broken "Open RCA Workspace" empty-state CTA (Cat 3 + Cat 9)

**What to change**: The CAPA-set empty state at [ObservationsTab:518-519](src/modules/fda-483/tabs/ObservationsTab.tsx#L518-L519) tells the user to "Open RCA Workspace" but there's no surface labeled "RCA Workspace". Replace with "Scroll to the RCA section below" or, better, make the empty-state button scroll to the RCA card via `scrollIntoView`. Same fix applies to the "Go to Observations" no-op button in the RCATab empty-state.

**Why second**: Single biggest user-confusion vector flagged by Cat 3. Low effort.

**Effort**: S — three string edits + optional `useRef` + `scrollIntoView`.

### 3. Replace 7 blocking Popups with non-blocking toasts (Cat 11)

**What to change**: In [FDA483Page:803-852](src/modules/fda-483/FDA483Page.tsx#L803-L852), replace `<Popup>` calls with `useToast()` calls. Every other module uses toasts; FDA 483 is the outlier. Toast is non-blocking and matches the cadence users have learned elsewhere.

**Why third**: Real UX consistency win that touches a single file. The 7 popups account for almost every confirmation flash a user sees while working in FDA 483.

**Effort**: S — replace 7 popups + delete the popup state vars + verify the tone matches the canonical form from Cat 6.

### 4. Promote `Use this draft` to confirmation + clarify the readiness checklist (Cat 4 + Cat 8)

**What to change**:
- Add confirmation to `Use this draft` when `responseDraft` is non-empty (real data-loss risk).
- Rework the Response Readiness checklist: split into "Your remaining work" (rows 1-5) vs "Final actions" (row 7 = Sign & Submit), and drop "Response within deadline" as an inline indicator above. Change "29%" to "N of M complete" or both.

**Why fourth**: Closest the module gets to a data-loss vector + the highest-leverage UX clarity fix for the most-confusing surface (the readiness panel).

**Effort**: M — confirmation dialog + restructure of one card.

### 5. Make the four form modals responsive + clean up `currentStep` dead state (Cat 10 + Cat 2)

**What to change**:
- All 4 modals: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.
- Remove the dead `currentStep` state, `Step` type, and the no-op `onGoToObservations` callback in `FDA483Page`. Tighten the breadcrumb / back-button text to match the page header (`FDA 483 & Regulatory`, drop "Events").

**Why fifth**: Mobile-usability + code-hygiene cleanup. Lower direct user value than the others, but combined the two save real complexity.

**Effort**: S-M — 4 grid-class changes + delete unused state + 3 string updates.

---

## Things NOT worth changing

The audit found multiple intentional design choices worth preserving:

1. **Three distinct stacked surfaces (Observations / RCA / Response) instead of tabs.** When the user opens an event, the page renders all three sub-surfaces vertically. This LOOKS like incomplete refactoring (the `currentStep` state suggests it was once tabbed), but for a regulator-response workflow, scrolling through a continuous narrative — observations → root cause → response draft — is actually correct. Regulators read responses end-to-end; the UI should mirror that. **Keep stacked, just remove the dead step state.**

2. **The deadline-alert banner at the top of the page.** Bright-red banner that calls out events within 5 days of the response deadline, prominently placed above the event list. This is the single most useful piece of FDA 483 UX in the product. Don't touch.

3. **The 7-row Response Readiness checklist as a CONCEPT.** The structure ("here are the gates between you and submission") is exactly right for a regulator-facing workflow. Only the presentation needs work (Cat 8), not the underlying model.

4. **The 15-working-day auto-deadline calculation.** Hard-coding the FDA's 15-working-day window into the deadline-field auto-fill is regulator-correct and a real time-saver. Don't make it user-configurable.

5. **The Part 11 Sign & Submit flow.** Identity + signature meaning + password + server-first signing + inline error on reject + credentials wiped on close — this is FDA-compliant and matches the CAPA Sign & Close flow exactly. The implementation duplicates code (Cat 11) but the BEHAVIOUR is correct. Refactoring to a shared `<Part11SignModal>` is a separate longer-term cleanup, not a UX fix.

6. **"Critical / High / Low" observation severity (3-tier, no Medium).** The audit prompt asked whether observations should be FDA-taxonomy (Critical/Major/Minor). The team's Cat 1 decision was to keep observations on GENERIC taxonomy. **This is defensible** — "Critical/Major/Minor" is FDA terminology for the OVERALL inspection finding, but per-observation severity within a 483 reasonably uses the generic risk scale. Don't switch.

7. **"Effective status" derivation that flips Open → Response Due when deadline approaches.** This is a useful at-a-glance signal even though it makes the rendered status differ from the stored status. Keep, but document inline so audit-trail readers can map the two.

8. **Regulator-flavoured jargon: "Commitments", "Observations", "RCA", "FDA 483".** These are the actual words the audience uses. Replacing them with general-purpose language would make the product LESS legible to QA professionals. Only "AGI Draft" warrants softening.

9. **Auto-population of observation number** (`defaultNumber={liveEvent.observations.length + 1}`). Saves a step for the common case. Don't change.

10. **The DocumentUpload primitive reuse.** FDA 483 correctly imports the shared `<DocumentUpload>` component instead of reinventing it. Don't refactor.

---

*Audit produced by reconnaissance pass over `src/modules/fda-483/**`. No source files modified. No schema changes proposed. The prioritized list above can drive 3-5 targeted fix rungs.*
