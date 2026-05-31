# Merge Audit Handoff: feat/capa-substages-3.2-6.4 ↔ dev

## Context

Two parallel branches with significant divergence:

- **feat/capa-substages-3.2-6.4** (pushed to remote): 17 commits of compliance work
  - 6 CAPA substages (3.2, 4.6, 4.7 manual, 5.2, 4.8, 6.4)
  - Part 11 signing across 5 surfaces (CAPA close, FDA 483 submit, deviation close, doc approve, CC transitions)
  - 6 child-row IDOR fixes + tenantScope.ts helper
  - Silent-success pattern fix on 14 surfaces (CAPA/Deviation/FDA 483)
  - 4 oversized files split, M1-M9 cleanup, CSV/CSA uploads, CAPA modal UX

- **dev**: 12 commits of AI work + infrastructure
  - AI integrations (chatbot, voice, AI CAPA modal, AI Tools)
  - Auth handler migration (Pages Router → App Router)
  - Lifecycle status enum fixes
  - Admin/subscription work
  - New CI workflow

## Test merge result (devAI branch, abandoned)

A test merge was performed locally on a branch called `devAI` (not pushed). The merge auto-resolved with 14 conflicts that were manually addressed. After resolution:

- `npx tsc --noEmit`: 0 errors
- `npm run build`: 27 routes built
- Database: 18 migrations applied, schema in sync

However, a deep audit revealed **24 critical issues** and **26 suboptimal findings** that prevent shipping. Most originate from dev's side and surface because feat's stricter compliance posture exposes them.

## Critical blockers (must fix before any merge to dev or main)

### Compliance / Regulatory (highest priority)

1. **AI CAPA closure bypasses Part 11**
   File: `src/modules/ai-capa/AiCapaPage.tsx:752`
   UI claims "21 CFR Part 11" at L771 but the closure flow posts a free-text electronic_signature to an external AI backend. No password verification, no SHA-256 hash, no SignedRecord row, no CAPA_CLOSED_SIGNED audit pair.
   **Risk:** Regulatory falsity. FDA/EMA inspector finding.
   **Fix:** Route AI CAPA closures through the existing signing.ts pipeline.

2. **8 hard-delete sites on GxP records**
   Locations: `deviations.ts:320`, `capas/lifecycle.ts:438`, `fda483.ts:271/617/702/793`, `findings.ts:135`, `documents.ts:235`, `tenants.ts:199`
   Soft-delete infrastructure exists; these need to use it.
   **Risk:** ALCOA+ retention violation. Part 11 §11.10(e).

3. **Zero auth-event audit logging**
   File: `app/api/auth/[...nextauth]/route.ts`
   Login success/failure, OTP issuance/verification, logout — all silent. No audit log entries.
   **Risk:** 21 CFR §11.10(e) violation.

4. **No account lockout primitives**
   Schema lacks `failedLoginAttempts`, `lockoutUntil` columns.
   Brute force on the password path is unbounded.
   **Risk:** Annex 11 §12 violation.

5. **RESOLVED (partial) — AGI Console role gate added; "Accept/Reject doesn't write audit" claim was a false alarm**
   File: `app/(app)/agi-console/page.tsx`
   Investigation: the page was a Server Component with `requireAuth()` but no role check. Added a server-side `ALLOWED_ROLES` gate (matches `DEFAULT_MATRIX` in `src/store/permissions.slice.ts` — all 9 declared roles, none have `agi: "none"` today) + VIEW_DENIED audit-log on denial + `redirect("/?error=unauthorized")`, following the Rung 4j convention. The gate is functionally a no-op today since every role currently passes, but it makes the policy explicit and enforceable from one place if/when the matrix is tightened.
   The second half of the original finding ("Accept/Reject doesn't write audit log entries") was **incorrect against current code** — the two action-like flows in `AGIPage.tsx` (`onAlertSave` at line 100-106, `handleResolve` at line 108-114) DO call `auditLog({...})` which persists via `logAuditAction` to the AuditLog table. The merge audit either pre-dated those calls or conflated audit logging with model persistence.
   **Related findings surfaced but NOT fixed this pass (separate scope):**
   - The Drift Alerts UI continues to be vapor-CRUD (see item #15) — alerts exist as audit-log rows only, no `DriftAlert` Prisma model. The handlers don't role-gate either (a `viewer` could "resolve" a vapor alert). When the schema gap is closed, action-level role gates (full/limited tier only) should be added alongside.
   - [src/actions/agiConsole.ts:44](src/actions/agiConsole.ts#L44) `logAGISuggestion` — orphan server action with zero callers (verified via grep — only its own decl + own console.error). Same future-trap shape as the FDA 483 orphans deleted in items #18 / its follow-up. Candidate for deletion in the next sweep.
   - RESOLVED (follow-up rung) — all four AI surface pages now gated server-side: [app/(app)/ai-capa/page.tsx](app/(app)/ai-capa/page.tsx), [app/(app)/ai-capa/[capaId]/page.tsx](app/(app)/ai-capa/[capaId]/page.tsx), [app/(app)/ai-tools/page.tsx](app/(app)/ai-tools/page.tsx), [app/(app)/ai-policy/page.tsx](app/(app)/ai-policy/page.tsx). All four converted from Client Components to Server Components (Pattern A — their child modules already carried `"use client"` so no propagation was needed; the dynamic `/ai-capa/[capaId]` page was switched from `useParams()` to the Next 16 `params: Promise<{ capaId: string }>` prop pattern matching `app/(app)/capa/[id]/page.tsx`). Allowlists: `/ai-capa`, `/ai-capa/[capaId]`, `/ai-tools` use the matrix-derived 9-role set mirroring `agi` access; **`/ai-policy` is narrower — `super_admin` + `customer_admin` only, a deliberate policy decision (not matrix-derived) because the surface controls agent enable flags and policy modes**. All four gates use the extracted `requireRoleOrDeny()` helper (see below).

### Cross-cutting cleanup — role-gate helper extraction (follow-up rung)

25. **RESOLVED — `requireRoleOrDeny()` helper extracted from 4 hand-rolled gates**
    File: [src/lib/authz.ts](src/lib/authz.ts) (new, 57 lines)
    Companion to `requireAuth()` in `src/lib/auth.ts`: `requireAuth` answers "who are you?", `requireRoleOrDeny` answers "are you allowed?". Signature: `(session: AuthSession, allowedRoles: Set<string>, ctx: { module, recordId?, recordTitle?, redirectTo?, extra? }) => Promise<void>`. Writes a Part 11 §11.10(d) VIEW_DENIED audit row via `logAuditAction` (try/catch wrapped — logging failure cannot block the redirect), then calls `redirect(ctx.redirectTo ?? "/?error=unauthorized")` which throws Next.js's redirect exception.
    Refactored the four pre-existing inline gates to use the helper, preserving each site's exact context (allowlist, module string, recordId, recordTitle, extras) — behavioral diff is zero per-site. LOC deltas: `audit-trail/page.tsx` -15, `admin/customer/[id]/page.tsx` -16, `admin/page.tsx` -14, `agi-console/page.tsx` -16 (net -61 from refactored sites; +57 in the new helper file). The refactor breaks even on its own; the four newly-gated AI pages in the same rung each saved ~14 lines vs the inline pattern, so net code reduction across the 8 gated sites is ~-56 lines and rising as additional gates land. The `ALLOWED_ROLES` constants stayed at module scope per page — declared-policy pattern, not a code-smell.
    Verification: `npx tsc --noEmit` 0, `npm run build` 0 (all 28 routes compile cleanly, the four newly-gated AI pages register as `ƒ` server-rendered in the build output). `npm run lint` still exits 1 with the same 2 pre-existing errors documented under item #16's adjacent context — no new lint issues introduced.

### Security

6. **`/api/ai-proxy/[...path]/route.ts` has zero auth/tenant/audit**
   File: `app/api/ai-proxy/[...path]/route.ts:8-44`
   Forwards `auth` header verbatim with no tenant verification. A valid token from any tenant can request data from any other tenant via this proxy.
   **Risk:** Cross-tenant data leak. Major security issue.

7. **`pages/api/tenants.ts` DELETE is IDOR**
   File: `pages/api/tenants.ts:145`
   Any customer_admin can DELETE any tenant by ID. Cascades to signed records and audit logs.
   **Risk:** Malicious customer_admin wipes peer tenant data.

8. **`middleware.ts` doesn't exist (file is `proxy.ts`)**
   File: repo root
   Next 16 ignores `proxy.ts` unless `experimental.proxy` is enabled. The `/admin` role gate and unauthenticated-redirect mentioned in comments are silently disabled.

9. **customer_admin subscription gate inverted**
   File: `app/api/auth/[...nextauth]/route.ts:110-119`
   Lapsed tenants log in forever instead of being blocked.

10. **`admin/customer/[id]/page.tsx` is client-only**
    File: `app/(admin)/admin/customer/[id]/page.tsx:1-7`
    No server role gate; HTML shell leaks to any authenticated user.

11. **audit-trail route has no server-side role check**
    File: `app/(app)/audit-trail/page.tsx`

### CI / Build

12. **4 of 6 Playwright smoke tests FAIL**
    File: `tests/smoke.spec.ts:178/194/203/218`
    Login click never navigates. CI will turn red on merge to main.

### Critical UX

13. **25+ silent-failure paths in CSV/CSA, Governance, Readiness modules**
    Files: `CSVPage.tsx`, `GovernancePage.tsx`, `ReadinessPage.tsx`, `ValidationPanel.tsx`
    `console.error` + return, no user feedback. Users see frozen UIs.

14. **RESOLVED — Login form label / authorize() mismatch**
    File: `src/components/auth/LoginPage.tsx`, `app/api/auth/[...nextauth]/route.ts`
    Original finding (form labelled "Username or email" but authorize accepted email only; `superadmin` only worked via mock fallback) is fixed. `authorize()` now accepts both email and username via an `isEmail = email.includes("@")` sniff and routes the query to the matching @@unique column — the `superadmin` row works through the real Tenant-table path with no mock fallback.
    Subsequent drift: the form label was at one point narrowed to "Work email" while authorize() retained the dual-purpose behavior, re-introducing the mismatch in the opposite direction. Corrected by relabelling the input ("Email or username", placeholder hints at both shapes, autoComplete switched to "username") rather than narrowing authorize() — the dual-purpose behavior is the intended one.

15. **Drift Alerts UI is vapor-CRUD**
    File: `src/modules/agi-console/AGIPage.tsx:100-114`
    UI fires audit log entries but no Prisma `DriftAlert` model exists. Save action only writes to audit log; data doesn't persist anywhere readable.

16. **Documents flow lacks SHA-256 hash on upload**
    File: `src/actions/documents.ts:32-67`
    ALCOA+ integrity gap.

17. **RESOLVED — TitleCase status writes across Finding + CAPA action layer**
    Files: `src/actions/fda483.ts:877`, `src/actions/findings.ts:69`, `src/actions/findings.ts:164`, `src/actions/capas/lifecycle.ts:163`, `src/actions/capas/closure.ts:294`
    Original finding (`raiseCAPAFromObservation` writing TitleCase `"Open"` into a CAPA row) fixed by changing the literal to lowercase canonical `"open"` — CAPA has no backward-compat TitleCase key in `CAPA_STATUSES`, so the buggy row would have rendered as the unknown-status grey fallback.
    Same-pattern sweep found 4 additional Finding-status writes using backward-compat TitleCase keys — fixed in the same pass: `findings.ts:69` `"Open"`→`"open"` (create), `findings.ts:164` `"Closed"`→`"closed"` (closeFinding), `capas/lifecycle.ts:163` `"In Progress"`→`"in_progress"` (Finding update on CAPA link), `capas/closure.ts:294` `"Closed"`→`"closed"` (Finding update on CAPA close). The backward-compat TitleCase entries in `FINDING_STATUSES` remain — they cover READ-side rendering of pre-migration rows; WRITE sites now consistently use canonical lowercase.
    Data check on dev.db at fix time: 0 CAPA rows carried TitleCase status; 3 Finding rows still carried legacy TitleCase (`Open`=2, `In Progress`=1, `Closed`=0). No data backfill performed — separate decision, and dev.db may be stale relative to production Postgres.

18. **RESOLVED — `submitFDA483Response` orphan deleted (CASE Y — Part 11 framing was false alarm)**
    File: `src/actions/fda483.ts` (previously lines 148-181, now removed)
    Investigation: the unsigned function had ZERO callers in the entire repo (only references were its own definition + its own `console.error` line + this audit doc). The UI's submit-response action ([src/modules/fda-483/FDA483Page.tsx:778](src/modules/fda-483/FDA483Page.tsx#L778)) calls the SIGNED alternative `signSubmitFDA483Response` ([fda483.ts:367-505](src/actions/fda483.ts#L367)), which runs the full Part 11 ceremony: password reverification via `verifyPasswordForSigning`, `SignedRecord.create` + `FDA483Event.update` inside the same `prisma.$transaction` (atomic), `contentHash` over canonicalised event state + draft SHA-256, `contentSummary`, `responseSignatureId` FK linked back to the event, paired `FDA483_RESPONSE_SUBMITTED` (operational) + `FDA483_RESPONSE_SIGNED` (signing) audit-log rows.
    The audit doc's "Direct invocation submits without Part 11 signature" framing was technically accurate about the function's body but misleading about real exposure — nothing invoked it, no production code path bypassed signing. The fix was therefore just deletion: an exported but uncalled function is a future-trap (someone could import it by name and unwittingly bypass signing). Removed.
    **Related unsigned write paths surfaced during this audit (NOT fixed this pass — separate scope):**
    - `updateFDA483Status(id, status)` (previously at `src/actions/fda483.ts:122`) — also exported, also orphan (zero callers), accepted ANY status string including `"Response Submitted"`. Same future-trap shape as `submitFDA483Response`. **Deleted in a follow-up pass after verifying zero callers in src/modules/, src/actions/, and app/** — only references were its own decl, its own `console.error`, and this survey note. Removed in the same item #18 sweep.
    - [src/actions/fda483.ts:93](src/actions/fda483.ts#L93) `updateFDA483Event` — generic field update with no status gating; could in principle flip status without signing. Used for event metadata edits, but the schema permits status writes. Worth tightening the input schema to reject status mutations.
    - [src/actions/fda483.ts:295](src/actions/fda483.ts#L295) `saveResponseDraft`, [fda483.ts:330](src/actions/fda483.ts#L330) `saveAGIDraft` — save work-in-progress narrative; legitimately unsigned (drafts aren't yet committed responses).
    - [src/actions/fda483.ts:268](src/actions/fda483.ts#L268) `deleteFDA483Event` — hard delete on a GxP record. Already covered by audit item #2 (8 hard-delete sites).

19. **AIChatbot mounted globally in AdminShell with no permission gating**
    File: `src/components/layout/AdminShell.tsx:17`

20. **`CustomerAccountsPage.tsx` writes client-side `new Date().toISOString()` for createdAt**
    File: `src/modules/admin/CustomerAccountsPage.tsx:697,753,761,1172`
    4 sites. Violates compliance rule that timestamps come from server.

21. **RESOLVED — `transitionChangeControlStatus` double-write + concurrent-transition race**
    File: `src/actions/change-control.ts:548-826`
    Two issues were present (the audit named the first; the second is the deeper Part 11 concern):
    - **SHAPE 2 (duplicate write):** for signed transitions (Approved / Rejected / Closed) the function ran one `tx.changeControl.update` inside a `prisma.$transaction` (alongside `signedRecord.create`) and a SECOND `prisma.changeControl.update` outside the transaction immediately after. The second write only re-applied `status: toStatus` (same value) plus the rarely-firing `actualImplementationDate` / `closedAt` branches. The author's own comment at the time acknowledged "the second update just re-applies the same data idempotently."
    - **SHAPE 3 (read-then-update race):** the function reads `existing.status`, validates the `fromStatus → toStatus` transition against `ALLOWED_TRANSITIONS`, then writes — with no optimistic lock. Two concurrent reviewers each opening a CC in `In Review` could both pass validation (one transitioning to `Approved`, one to `Rejected`); both writes would succeed; the final on-disk status reflects whichever committed last while a SignedRecord ledger entry for the loser's verdict persists in the audit trail — a Part 11 §11.10(b) integrity gap (signed record asserting a state change that did not in fact happen).
    Fix applied: consolidated to a single `prisma.changeControl.updateMany({ where: { id, status: fromStatus, deletedAt: null }, data: {...} })` per path — administrative transitions use it directly, signed transitions wrap it in the same `prisma.$transaction` as the `signedRecord.create` so the SignedRecord and the status flip commit (or roll back) together. If `updateMany.count === 0` the function throws `STATE_CONFLICT`; the catch maps it to a user-facing "This Change Control was modified by another user. Refresh and try again." The redundant outer `update` is gone. Audit-log writes stay post-commit but are now individually wrapped in try/catch so a logging failure no longer surfaces as a transition failure. Only caller (`src/modules/change-control/ChangeControlDetailModal.tsx:186`) already surfaces `result.error` via `setTransitionError` — STATE_CONFLICT will display correctly with no UI changes needed.

22. **`signOut()` doesn't clear Redux or AI sessionStorage tokens**
    File: `src/lib/authClient.ts:65`
    Session survives logout.

23. **Zero focus management + zero aria-busy across all modals (incl. Sign & Close)**
    Files: all `src/modules/**/modals/`
    A11y defect for an e-sig app.

24. **Light-theme `--text-muted` on `--bg-elevated` fails WCAG AA (~2.4:1)**
    File: `src/index.css:14-17`
    Used as default placeholder color.

## Suboptimal (26 items, lower priority)

See full audit for all 50 findings. Notable:

- RESOLVED / INVALID — dead-deps claim was half-right. `axios` was genuinely dead (only `src/lib/axios.ts` imported it, and nothing imported the wrapper) — removed via `npm uninstall axios` plus deletion of `src/lib/axios.ts` and updates to two stale doc-comments in `src/components/auth/LoginPage.tsx:130` and `src/modules/admin/AdminShell.tsx:85` that named the deleted file. npm reported 23 packages removed (axios + transitives). `recharts` is NOT dead — 5 active importers (`src/modules/dashboard/DashboardPage.tsx`, `src/modules/agi-console/tabs/DriftMonitoringTab.tsx`, `src/modules/capa/tabs/CAPAMetricsTab.tsx`, `src/modules/governance/tabs/KPIScorecardTab.tsx`, `src/modules/gap-assessment/tabs/GapSummaryTab.tsx`); `react-is` kept because it's a `recharts` peer dependency. Broader sweep checked `@aws-sdk/client-s3` (alive via dynamic import in `src/lib/fileStorage.ts:69`) and `@sapphi-red/web-noise-suppressor` (alive via dynamic import in `src/components/chatbot/AIChatbot.tsx:343`); both kept.
- 8+ files >500 lines need splitting
- Deviation has no `reference` field (cuids leaking in 7+ places)
- `cc.status` rendered raw in 5+ places
- 92 raw role string literals across 30 files
- Theme slice causes hydration flicker
- Missing compound indexes on Finding, Deviation, CAPA, AuditLog
- `RAIDItem` has no entry in `src/constants/statusTaxonomy.ts` — write sites at `src/actions/raid.ts:38,107,138` use ad-hoc TitleCase (`"Open"`, `"Closed"`); define a `RAID_STATUSES` taxonomy and align writes
- `src/lib/queries/dashboard.ts:11-12` carries stale TitleCase status comments (`"Open" / "Closed" / "In Progress"`) that contradict the lowercase canonical now used in `FINDING_STATUSES`; misleading as guidance though no runtime impact
- RESOLVED — `DocumentUpload.tsx` client-side `uploadedAt` investigated as a potential Part 11 §11.10(b) / ALCOA+ Contemporaneous gap. **False alarm — CASE A dead write**, same pattern as CustomerAccountsPage. Two callers: `src/modules/deviation/DeviationPage.tsx:424` (Redux dispatch only — no `DeviationDocument` Prisma model exists; documented as BUG-001), and `src/modules/fda-483/tabs/ResponseTab.tsx:366` (the caller mapping at lines 370-377 forwards only `eventId/fileName/fileUrl/fileType/fileSize/type` to `addResponseDocument` — `uploadedAt` and `id` are dropped at the boundary; the `AddResponseDocSchema` Zod schema at `fda483.ts:731-738` doesn't declare them either; `FDA483Document.createdAt` is `@default(now())` server-stamped). Display-side `uploadedAt` shown by the UI comes from the server-side mapping at `FDA483Page.tsx:162` (`d.createdAt.toISOString()`), not from the client write. **No persisted records or AuditLog rows carry client-supplied timestamps** (confirmed in dev.db: 0 `FDA483Document` rows, 0 `DOCUMENT_ATTACHED` AuditLog rows). Fix applied: removed dead write at `DocumentUpload.tsx:184`, made `LinkedDocument.uploadedAt` optional at line 31, guarded the lone display site at line 255. Same `id: \`DOC-${Date.now()}-${Math.random()...}\`` field investigated — only used as React key / Redux placeholder; never reaches Prisma `id` (server generates `@default(cuid())`). Broader survey for `uploadedAt: new Date(...)` pattern across src/: **only 1 match in the whole repo** (the one we just fixed). CSV/CSA has its own `StageDocument` upload flow with a separate type; not investigated this pass.

## What's preserved and good

- All 4 oversized file splits survived the merge
- Part 11 signing pipeline for 5 manual surfaces works correctly
- IDOR fix is intact across 6 confirmed action sites
- NEXTAUTH_SECRET production guard works
- `sessionsValidAfter` MFA invalidation threaded correctly through JWT
- Tenant isolation in `src/lib/queries/` is consistent across 10+ spot-checked paths
- tsc clean, build succeeds

## Recommendation for the dev team

Before merging `feat/capa-substages-3.2-6.4` to `dev`:

**Wave 1 (must-fix, ~1-2 days):**
- Items #1, #6, #8, #9 — the AI CAPA + AI proxy + middleware + subscription cluster
- Item #12 — fix Playwright smoke tests
- Item #14 — login form label/auth alignment

**Wave 2 (before customer demo, ~3-5 days):**
- Items #2, #3, #4, #5, #7, #10–#11, #13, #15–#24

**Wave 3 (technical debt, ongoing):**
- The 26 suboptimal findings

Once Wave 1 is complete on `dev`, the merge from `feat/capa-substages-3.2-6.4` → `dev` should proceed smoothly. The merge resolution itself was straightforward; the blockers are pre-existing issues on dev's side.

## SME Review (this week)

### SECURITY FIX (this session) — LoginPage client-side auth bypass + email enumeration

**Trigger:** user-reported UX bug ("valid email + wrong password → 1s welcome flash → bounce to /login with no error"). Diagnosis traced the symptom to a client-side auth-hole — not a UX glitch.

**Root cause (latent, NOT a regression from this week's work).** `src/components/auth/LoginPage.tsx` had a four-tier credential-check fallback chain after the NextAuth call. The server's `authorize()` callback in `app/api/auth/[...nextauth]/route.ts` was correct (verified end-to-end — returns `null` for every failed-password branch, emits `LOGIN_FAILED` audit rows, never leaks a non-null user). The bugs were entirely on the client:

- **Auth-hole A — Redux-cache fallback accepted any password.** Tier 3 of the chain iterated `s.auth.tenants` from Redux looking for a matching `tenantUser`, then guarded the password check with `(!tenantUser.password || tenantUser.password === data.password)`. `TenantUserConfig.password` is declared optional in `src/store/auth.slice.ts` and server-side `getTenant` / `listTenants` strip it before returning — so `!tenantUser.password` was `true` for every server-hydrated tenant, and the OR short-circuited. **Effect:** anyone who knew a valid email in the Redux cache could "sign in" with any password (or no password). Middleware blocked the server routes after the optimistic `window.location.assign("/")`, but the client-side notion of "logged in" was set (Redux `setCredentials` dispatched), and the full-page navigation wiped any error state on bounce-back — exactly the reported "welcome flash with no error" symptom.

- **Auth-hole B — MOCK_ACCOUNTS backdoor in the production bundle.** Tier 1 of the chain compared the typed password against a hardcoded `MOCK_ACCOUNTS` map (`Admin@123`, `Demo@123`, `1`) — the same seed passwords from `prisma/seed.ts`. The map itself was NOT gated by `NODE_ENV` (only the dev-credentials UI table was). Any deployment where DB hashes had drifted from these seed values had a permanent backdoor for any email that lived in the map.

- **UX-bug C — CredentialsSignin error was silently swallowed.** When NextAuth correctly returned `ok:false` with `error: "CredentialsSignin"`, the handler only `console.warn`ed and fell through to the fallback chain — no `setError`, no `toast`, no `return`. With the fallback chain removed, the visible-error gap also had to be closed.

- **Dead-code D — `loginApi()` chased a non-existent `/api/auth/login`** endpoint, throwing on every login (caught + warned, fell through). Pure dead round-trip.

- **Compounding factor E — `window.location.assign(...)` on success paths** caused the full-page reload that wiped React error state when middleware bounced an erroneously-"successful" login back to /login. Combined with auth-holes A and B, this is what made the bug invisible: the user saw a "Welcome back" toast + loading spinner ("welcome page" in the user's words) for ~1s, then woke up on /login with an empty form and no toast.

**Fixes applied (this session):**

1. **Deleted** the Redux-cache fallback block in `src/components/auth/LoginPage.tsx` (was ~lines 362-409).
2. **Deleted** the `MOCK_ACCOUNTS` constant + `SUPER_ADMIN_SEED` + the bootstrap `useEffect` (was ~lines 62-87 + 152-160) AND its consumer block (was ~lines 296-323). No `NODE_ENV` conditional — the code is gone outright. Test access continues via `prisma/seed.ts`, whose seeded users authenticate through the real NextAuth path (bcrypt against the DB).
3. **Added** a generic `"Incorrect email or password"` error branch (setError + toast.error + return) for `CredentialsSignin` and any other non-specific NextAuth rejection. Same message for wrong-password and no-such-email to prevent account enumeration. `SUBSCRIPTION_INACTIVE` and `USER_INACTIVE` keep their specific, actionable messages.
4. **Deleted** the `loginApi()` call + its function definition in `src/lib/tenantApi.ts` (+ now-orphan `LoginResult` interface and `BASE` constant). Removed the import in `LoginPage.tsx`.
5. **Defense-in-depth** — converted the two surviving success-path `window.location.assign(...)` calls (super_admin → `/admin`, customer_admin → `/`) to `router.push(...)`. SPA navigation preserves React state across the navigation, so any future regression that erroneously "succeeds" will surface the middleware bounce + error instead of silently flashing. The `finishLogin` helper already used `router.push("/")`.

**Submit handler shape (after):**
- `try { result = await nextAuthLogin(...) } catch → setError + toast + return`
- `if (!result.ok)` → SUBSCRIPTION_INACTIVE / USER_INACTIVE specific messages, else generic "Incorrect email or password"; all return.
- NextAuth success → `await fetchCurrentUser()`; if null, show generic "profile could not be loaded" error.
- Dispatch `setCredentials`, toast.success, `router.push` by role.

**Important: this is NOT a regression from any of this week's work.** The local-cache fallback predates the `proxy.ts` → `middleware.ts` rename, the auth-event audit logging (uncommitted on this branch), the role-gate work (items #25 / item #5 follow-up), and the AI-page Server-Component conversion. The `LoginPage.tsx` fallback chain has been there since at least commit `cc31711 fix(auth): align MOCK_ACCOUNTS to seed`. It became visible the moment a real user typed a real email with a wrong password against a Redux store that had been hydrated from the server (which happens on every load of `/admin`).

**Verification:** `npx tsc --noEmit` exit 0; `npm run build` exit 0 (all 28 routes compile, all 23 static pages generate). No downstream breakage flagged — every `dispatch(setCredentials(...))` call in the file is now on the NextAuth-validated branch only.

26. **RESOLVED — "Action" / "Actions" → "Action Plan" / "Action Plans" rename (CAPA detail modal scope)**
    Files: `src/modules/capa/modals/CAPADetailModal.tsx:168`, `src/modules/capa/modals/helpers/getNextStep.ts:91, 94, 101, 104, 145, 155`
    SME asked to rename the standalone "Actions" tab in the CAPA detail modal to "Action Plans". Surgical rename — only user-facing label/description strings touched, preserving singular/plural exactly. **7 sites changed**, all within the same CAPA-detail-modal tab navigation surface (the tab label itself + 6 contextual-help descriptions and "Go to … tab" button labels in `getNextStep.ts`).
    **Untouched (deliberately):** the `correctiveActions` Prisma field and every Redux/form/mapper reference to it; the "Corrective Actions" defined term in CAPA Tracker captions, EditCAPAModal label, SubmissionChecklist, SignCloseModal dropdown options, ResponseTab placeholder; identifiers (`ActionsPanel` component name, `targetTab: "actions"`, `onChangeTab("actions")`, audit-log action codes); generic UI verbs (`title="Action failed"` popups, `header: "Actions"` data-table columns for Edit/Delete buttons, `sr-only "Actions"` accessibility labels); the RAID-A enum value (`"Risk" | "Action" | "Issue" | "Decision"` is a defined PMI acronym); ReadinessAction entity labels (distinct from CAPA Action Plan); AGI agent actions; CSV/CSA remediation actions; per-row `<th>Action</th>` column headers in tables already labeled "Action Plan" at the parent level (AI CAPA, AI Tools, Dashboard 90-day plan).
    **Visual gotchas to be aware of (no fix this pass):** the CAPA detail modal now shows "Action Plans" tab AND inline copy that still says "Corrective Actions" / "the corrective action" (CAPATrackerTab caption, SubmissionChecklist "At least 1 corrective action", SignCloseModal "approve the corrective actions as complete", getNextStep descriptions like "Add corrective actions" / "the corrective action targets the actual cause"). The two terms now coexist in the same modal — intentional distinction (CAPA = Corrective And Preventive Actions umbrella term; "Action Plans" = the operational tab where you document and track them) but worth checking with the SME that they understood the rename was tab-label-only, not a wholesale terminology shift.
    Verification: `npx tsc --noEmit` 0, `npm run build` 0. No layout concerns — "Action Plans" (12 chars) is shorter than the existing longest tab "Effectiveness Criteria" (22 chars) so the modal tab strip width is unaffected; the "Go to Action Plans tab" button label (22 chars) fits comfortably in the contextual-help card.

## Contact

Audit performed during merge resolution session. Original audit data available on request.
