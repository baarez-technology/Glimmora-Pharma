# Merge to dev is blocked — coordination needed

## Status (as of this writing)

- feat/capa-substages-3.2-6.4: 17 commits pushed to origin. Includes 6 CAPA substages, Part 11 signing across 5 surfaces, IDOR fix, silent-success fix, file splits, CAPA modal UX wins, CSV/CSA uploads, small UX batch.
- dev: 12 commits ahead since merge base. Includes AI integrations (chatbot, voice, AI CAPA modal), auth handler migration (pages → app router), lifecycle status enum fixes, admin/subscription work, new CI workflow.
- Tried merge into dev01 branch: 9 content conflicts + 3 modify/delete conflicts. Abandoned.

## Why merge was abandoned

The merge surfaces architecture conflicts, not just textual ones. Modify/delete conflicts on axios.ts, tenantApi.ts, pages/api/tenants.ts mean:
- feat side dropped axios during M1-M9 cleanup
- dev side kept axios and built AI client on it
- Resolution requires choosing: keep axios (rewind cleanup) OR rewrite dev's AI client to use fetch

Content conflicts on LoginPage.tsx, CAPAPage.tsx, CAPATrackerTab.tsx, Providers.tsx mean both sides reshaped the same components — solo merge would likely break dev's AI features OR feat's compliance fixes.

## What needs to happen before merge can proceed

1. Talk to whoever owns the AI integration work on dev.
2. Decide: which way does the architecture go on axios + tenantApi.ts?
3. Decide: how do feat's silent-success error guards interact with dev's AI CAPA modal handlers?
4. Verify: does the auth handler migration (app/api/auth/[...nextauth]/route.ts) break any audit-logging or session checks in feat's code?

Alternatively: open a PR to dev anyway. CI will fail, conflicts will appear in GitHub's UI, and resolution can happen there with reviewer involvement.

## Files with conflicts (for reference)

Content conflicts:
- package.json + package-lock.json
- src/components/Providers.tsx
- src/components/auth/LoginPage.tsx
- src/lib/audit.ts
- src/lib/authClient.ts
- src/modules/admin/CustomerAccountsPage.tsx
- src/modules/audit-trail/AuditTrailPage.tsx
- src/modules/capa/CAPAPage.tsx
- src/modules/capa/tabs/CAPATrackerTab.tsx
- src/modules/settings/tabs/UsersTab.tsx

Modify/delete conflicts:
- pages/api/tenants.ts (deleted by feat, kept by dev)
- src/lib/axios.ts (deleted by feat, kept by dev)
- src/lib/tenantApi.ts (deleted by feat, extended by dev)
