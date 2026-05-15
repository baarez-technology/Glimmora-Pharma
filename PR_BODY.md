## Summary

59 commits landing the CAPA Lifecycle substage stack (3.2 through 6.4) plus follow-up compliance and UX work.

## What's in this PR

### 6 CAPA Lifecycle substages
- **3.2** Data & Evidence Collection — 7 categories per CAPA with Part 11 ALCOA+ compliance, SHA-256 file hashing, 7-year retention, immutable note version history
- **4.6** Effectiveness Criteria Definition — measurable success criteria with two-layer locking (row + CAPA status)
- **4.7** Action-to-Cause Alignment — manual reviewer flow (Aligned/Cosmetic/Needs Review); AI-104 detection deferred as separate project
- **4.8** Change Control Linkage — full ChangeControl module with bidirectional CAPA↔CC linkage, state machine, soft-delete with link guards
- **5.2** Tiered Approval Routing — Critical: 1 qa_head + 1 RA; High/Med/Low: 1 qa_head. Plus §5.3 Comment Adjudication and §5.4 Part 11 e-Signatures on Approvals
- **6.4** Linked CC Execution Coordination — risk-proportionate dependency gate (Critical/High hard gate, Medium/Low soft override)

### Part 11 signing across 5 surfaces
Eliminates theatrical signing. Previously these collected passwords and discarded them server-side. Now all use verifyPasswordForSigning + computeContentHash + createSignedRecord:
- CAPA closure (signAndCloseCAPA)
- FDA 483 response submission
- Document approval (server + modal ready)
- Deviation closure
- Change Control consequential transitions (In Review→Approved, In Review→Rejected, Implemented→Closed)

### Multi-tenant security
- 6 child-row IDOR holes closed (addObservation, addCommitment, createRTMEntry, addRoadmapActivity, createSimulation, createTrainingRecord)
- New `src/lib/tenantScope.ts` helper with `assertTenantOwnsParent`
- Audit trail tenant attribution fix: super_admin actions now correctly track parent.tenantId, not actor's home tenant

### Silent-success pattern fix (compliance-critical UX)
14 surfaces across CAPAPage, DeviationPage, FDA483Page previously showed green "Saved!" popups when server returned errors. Optimistic Redux dispatched regardless. UI lied about whether regulated records persisted.
- Server-first refactor across all 14 sites
- Inline error display via shared Popup primitive
- Modal-level retry preservation for the 2 signing modals (SignCloseModal, SignSubmitModal)
- Most important fix: `signAndCloseCAPA` wrong-password no longer cascades false state changes

### Infrastructure
- 4 oversized files split (ActionsPanel.tsx 2,297 → shell + 6 siblings; capas.ts 1,572 → barrel + 6 modules; CAPADetailModal.tsx 1,454 → shell + 7 siblings; ChangeControlDetailModal.tsx 1,236 → shell + 10 siblings) — zero behavior change
- M1-M9 dead code cleanup (~150 LOC removed, axios dependency dropped, bcrypt centralized, audit naming standardized)
- 12 new Prisma models + 18 migrations

### UX improvements
- Schema reference scheme (CAPA-YYYY-NNN, CC-YYYY-NNN) — no more cuids in user-facing UI
- Sticky "Next step" banner across all CAPA tabs
- Unified submission checklist on Overview
- Collapsed-by-default Evidence categories
- Status label formatting (snake_case DB values → human-readable labels)
- CSV/CSA stage document uploads
- Hydration warnings suppressed for browser password manager attributes

### Change Control hidden from end users
Sidebar entry commented, LinkedChangeControlsSection disconnected from CAPA Modal, 6.4 dependency gate bypassed. Schema/code/routes preserved for future re-enable.

## What's NOT in this PR (backlog)

- Password lockout on failed logins (Annex 11 §12)
- Auth audit logging (login/OTP/logout currently silent)
- Password reset flow ("Forgot passcode?" currently dead link)
- 30+ residual silent-failure sites in admin/governance/CSV pages
- Risk-based classification panel painting same axis three times
- AlignmentReviewSection "Cosmetic" has no in-UI definition
- Deviation has no reference field
- AI-104 cosmetic detection (substage 4.7 AI half)
- 14 hard-delete calls on GxP records
- 8 missing tenantId+createdAt composite indexes
- 77 inline tenant scope checks to migrate to tenantScope.ts
- 107 inline auditLog.create calls to wrap

## Risk areas (flagged from merge inspection)

Auto-merge predicted clean with zero textual conflicts. 18 files cross-touched with dev. Specific risks:

1. **Lifecycle status enum drift** — dev fixed lifecycle status enums; our STATUS_LABEL mapping may have stale keys
2. **CAPAPage.tsx semantic drift** — our silent-success guards interact with dev's AI/lifecycle changes
3. **Auth handler migration** — dev moved `pages/api/auth/[...nextauth].ts` → `app/api/auth/[...nextauth]/route.ts`; verify our session code resolves the new path

## How to review

- 59 commits, ranged by feature; each commit is independently tsc + build clean
- Recommend reviewing by feature category, not commit-by-commit
- Local tsc + build pass on this branch
- CI workflow on dev will validate merged state post-PR creation

## Manual test coverage

End-to-end CAPA lifecycle test (create → fill → submit → approve → sign-close) walked through during development with Part 11 signatures captured at both approval and closure events. Real SignedRecord rows, real audit pairs (CAPA_APPROVED + CAPA_APPROVAL_SIGNED; CAPA_CLOSED + CAPA_CLOSURE_SIGNED).

## References

- Part 11: 21 CFR Part 11 (electronic records / signatures)
- ALCOA+: data integrity principles
- Annex 11: EU GMP guidance on computerised systems
