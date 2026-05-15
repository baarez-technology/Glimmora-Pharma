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

5. **AGI Console missing canViewAGI gate**
   File: `app/(app)/agi-console/page.tsx:10`
   AGI Accept/Reject doesn't write audit log entries.

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

14. **Login form labels "Username or email" but authorize() queries by email only**
    File: `src/components/auth/LoginPage.tsx:25`, `app/api/auth/[...nextauth]/route.ts:84`
    `superadmin` username (no @) only works through mock fallback.

15. **Drift Alerts UI is vapor-CRUD**
    File: `src/modules/agi-console/AGIPage.tsx:100-114`
    UI fires audit log entries but no Prisma `DriftAlert` model exists. Save action only writes to audit log; data doesn't persist anywhere readable.

16. **Documents flow lacks SHA-256 hash on upload**
    File: `src/actions/documents.ts:32-67`
    ALCOA+ integrity gap.

17. **`raiseCAPAFromObservation` writes status "Open" (TitleCase)**
    File: `src/actions/fda483.ts:868`
    Violates feat's snake_case taxonomy.

18. **`submitFDA483Response` is orphan but exported**
    File: `src/actions/fda483.ts`
    Direct invocation submits without Part 11 signature. Should be removed or routed through `signSubmitFDA483Response`.

19. **AIChatbot mounted globally in AdminShell with no permission gating**
    File: `src/components/layout/AdminShell.tsx:17`

20. **`CustomerAccountsPage.tsx` writes client-side `new Date().toISOString()` for createdAt**
    File: `src/modules/admin/CustomerAccountsPage.tsx:697,753,761,1172`
    4 sites. Violates compliance rule that timestamps come from server.

21. **`transitionChangeControlStatus` writes status TWICE**
    File: `src/actions/change-control.ts:702-744`
    One inside transaction, one outside. Race condition.

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

- `axios` + `recharts` are dead dependencies (109 kB gzip)
- 8+ files >500 lines need splitting
- Deviation has no `reference` field (cuids leaking in 7+ places)
- `cc.status` rendered raw in 5+ places
- 92 raw role string literals across 30 files
- Theme slice causes hydration flicker
- Missing compound indexes on Finding, Deviation, CAPA, AuditLog

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

## Contact

Audit performed during merge resolution session. Original audit data available on request.
