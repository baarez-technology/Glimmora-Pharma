# What is not done

Publication gates, and the review items that need work beyond this branch.

---

## Gates — must clear before the manual sections are published

### 1. Apply the Training migration to Postgres

`prisma/migrations/20260820100000_add_training_lifecycle/migration.sql` is
**hand-authored and unapplied**, following the convention of the existing
unapplied lineage in this repository. Local development runs SQLite; this
lineage targets Neon Postgres, and nobody on the build had credentials.

It needs someone with Postgres access to run `prisma migrate deploy` and then
verify:

- [ ] Assign a training record; confirm trainee name, role, SOP reference and
      version, trainer, due date and assigner are all stored
- [ ] Start it as the trainee; confirm `startedAt` and the `TRAINING_STARTED` entry
- [ ] Complete it **as the trainee**; confirm `acknowledgedAt` is set and both
      `TRAINING_COMPLETED` and `TRAINING_ACKNOWLEDGED` are written
- [ ] Complete a different one **as QA**; confirm `acknowledgedAt` stays null and
      the UI reads *"Recorded by QA — not acknowledged by the trainee"*
- [ ] Reassign one; confirm progress resets and both names appear on the entry
- [ ] Retrain a completed record; confirm `supersedesId` points at the original
      and the event is `TRAINING_RETRAINING_ASSIGNED`
- [ ] Set a past due date; confirm Overdue appears, then extend it and confirm
      Overdue clears without any other action
- [ ] Complete one past its due date; confirm `TRAINING_OVERDUE_RECORDED` and the
      day count

Note that this migration stacks on an **already-unapplied lineage** — the
migrations before it have not been deployed either. That backlog has to be worked
through in order.

### 2. Fix the CAPA auto-close in the AI backend

`pharma_glimmora_ai_backend/app/routers/effectiveness_router.py:237` closes CAPAs
**without an electronic signature**, per this workspace's own
`docs/PRODUCTION-ISSUES-REPORT.md`. It is in the other repository and out of scope
for this branch.

**Module 4's audit section states that a CAPA closes under signature.** While that
route is live, that statement is not reliably true. Either fix the route or
disable it before publishing Module 4.

### 3. Re-shoot the screenshots

| Module | What |
| --- | --- |
| 3 | The CAPA Assignments tab, showing the assignee dropdown *without* QA Head in it |
| 3 | The deviation detail footer, showing Reassign and Reopen |
| 5 | A worklist with training in it, from a **non-QA** account |
| 6 | The GAMP category dropdown, showing categories 1, 3, 4, 5 and no category 2 |
| 6 | A system's validation plan, showing auto-skipped stages with their rationale |
| 7 | Every screen from a **Regulatory Affairs** account — except *Raise CAPA from observation*, which needs **QA Head** and a caption explaining the handoff |
| 9 | Assign training, the trainee's *My training* panel, and a completed record showing the acknowledgement line |

Any screenshot currently showing a role called **"QA Lead"** must go — no such
role exists.

---

## Review items deliberately not implemented

| Item | Why |
| --- | --- |
| CAPA assignable to QA Head | Would break segregation of duties. See [01-REVIEWER-RESPONSE.md](01-REVIEWER-RESPONSE.md) §1 |
| Worklist prioritisation | The Worklist is a read-only view of your own work; priority belongs to the source record |
| Worklist assignment / QA Head team view | Real feature work, not a documentation fix. Raise separately if the customer wants it |
| Document version / supersede events | The feature does not exist. See §4 of the reviewer response |

---

## Genuine gaps still open

Ordered by how likely each is to be found at inspection.

### 1. Document version control — not built

`Document.version` is a free-text label with no history, no supersede chain and
no retrieval of prior versions. EU GMP Annex 11 §9 and Chapter 4 expect version
control over GxP documents.

Needs a version-history model, a supersede action, retrieval of prior versions,
and a UI. Module 8's section says plainly that the system does not do this, so
nothing published overstates it — but the gap is real.

### 2. Previous-value capture is still partial

This branch fixed the highest-traffic edit paths — `updateDeviation`,
`updateCAPA`, `updateTrainingRecord` — and `updateFinding` and the evidence paths
already had it. 199 of 265 audit writes still record no previous value.

Most of those are creations and state transitions where there is no meaningful
previous value, so the real number needing work is smaller. But it has not been
audited line by line. Anything that edits a GxP field and writes a bare event
should be worked through with the shared helper in `src/lib/auditDiff.ts` — that
is what it was extracted for.

### 3. Reason-for-change is not universal

Captured on the actions where it matters most: reassignment, reopening, archiving,
deletion, segregation-of-duties overrides, evidence *Not Applicable* transitions,
and finding edits. Ordinary field edits on deviations, CAPAs and training records
accept an optional reason but do not require one.

Whether it should be mandatory on every GxP field edit is a decision for the
quality organisation, not a technical one — mandatory reasons on every save is a
real usability cost. Worth raising with the customer's QA function explicitly
rather than deciding by default.

### 4. Deviation has no separate approval step

The lifecycle is *closed under signature* or *rejected*, with no distinct approval
between investigation and closure. Module 3's section documents it as it is. If
the customer's SOP calls for a separate deviation approval before closure, that
is a workflow change, not a wording one.

### 5. Site codes cannot be set from Settings

A site's code — the `CHN` in every reference — is set when the site is
provisioned and is not editable from the tenant Settings screen. If customers
expect to choose their own site codes at onboarding, this needs an admin control.
