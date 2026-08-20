# Module 9 — Training & Awareness

New audit-trail section, and revised copy for the training lifecycle — which was
rebuilt to support it.

> **Publication gate.** This describes behaviour that exists on
> `feat/audit-trail-completeness` and needs its database migration applied before
> it is true of the live system. See [99-OUTSTANDING.md](99-OUTSTANDING.md).

---

## What a training record holds

A training record is evidence that a named person was trained on a named
curriculum, on a date, and confirmed it. It records:

| Field | Why it is there |
| --- | --- |
| **Trainee** | Who was trained — name and role, captured at assignment |
| **Training module** | What they were trained on |
| **SOP reference and version** | *Which version* of the procedure. An inspector asking "trained on which revision?" needs this, and the module name alone cannot answer it |
| **Trainer** | Who delivered the training |
| **Assigned by** | Who assigned it |
| **Due date** | When it must be complete by |
| **Started / Completed** | When work began and when it finished |
| **Acknowledged** | When the trainee confirmed it themselves — see below |
| **Score** | Where an assessment was scored |

## Assignment and acknowledgement

**QA Head assigns** training, from **Inspection Readiness → Training → Assign
training**. Training may be tied to an inspection, or standing awareness training
tied to no particular event.

**The trainee completes it themselves**, from their **Worklist → My training**.
The Worklist is the trainee's own page, and it is where Start and *Complete &
acknowledge* live.

**Completion and acknowledgement are not the same thing, and the record keeps
them apart.**

- When the **trainee** completes their own record, it is **acknowledged** — the
  record carries their own attestation that they received and understood the
  training.
- When **QA** records a completion on someone's behalf — transcribing a paper
  record, say — the record shows *Recorded by QA — not acknowledged by the
  trainee*.

Both are legitimate. They are different claims, and an inspector reads them
differently, so the system does not let one masquerade as the other.

## Overdue

A record is **Overdue** when its due date has passed and it is not yet complete.
This is calculated live rather than stored, so extending a due date clears the
overdue flag immediately and correctly — there is no stale status left behind.

A record completed after its due date is **not** shown as overdue; it is
completed, and the lateness is recorded on the audit entry as the number of days
it ran over.

## Retraining

Use **Retrain** on a completed record to assign fresh training on the same
subject. This creates a **new record linked to the original** — the original is
retained in full and never overwritten. Retraining is recorded as its own audit
event, distinct from a first assignment, so "was this person retrained after the
deviation?" is a question the trail answers directly.

## Reopening and archiving

**Reopen** returns a completed record to In Progress and clears both the
completion and the acknowledgement. Requires a reason. The original acknowledgement
remains on the audit trail — reopening records a new event; it does not erase
what came before.

**Archive** retires a record. Requires a reason. The record is removed from the
active training position and from the trainee's worklist, and remains retrievable
as evidence. Training records are never permanently deleted.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

Training and awareness activity is recorded under the **Training & Awareness**
module, so filtering the Audit Trail by that module returns the complete training
history for the organisation.

### Events recorded

| Event | When |
| --- | --- |
| **Training assigned** | Training is assigned to a person. Records the trainee, their role, the training module, the SOP reference and version, the trainer and the due date |
| **Retraining assigned** | Fresh training is assigned on a subject already completed. Records which record it supersedes |
| **Training reassigned** | The training moves to a different person. Requires a reason. Records both names; any progress is reset, because it belonged to the previous trainee |
| **Training record updated** | The curriculum, due date, trainer, SOP reference or notes change — records each field before and after, with an optional reason |
| **Training started** | The trainee begins. Records whether the record was already past due at that point |
| **Training completed** | The training is completed. Records the score where one was given, whether the trainee completed it themselves or QA recorded it on their behalf, and — if it ran past its due date — by how many days |
| **Training acknowledged by trainee** | The trainee confirms their own training. Written only on a self-completion. Records the SOP reference and version acknowledged |
| **Training completed overdue** | Written alongside the completion when a record is completed after its due date, so the lapse is a first-class event rather than something an auditor must derive by comparing two dates |
| **Training record reopened** | A completed record is returned to In Progress. Requires a reason. Records the completion and acknowledgement that were cleared |
| **Training record archived** | A record is retired. Requires a reason. Records whether it had been completed |

### Statuses

| Status | Meaning |
| --- | --- |
| Assigned | Assigned to the trainee, not yet started |
| In Progress | The trainee has started |
| Completed | Finished. *Acknowledged* if the trainee completed it themselves |
| **Overdue** | Past its due date and not complete. Calculated live, not stored |

### Who can do what

| Action | Roles |
| --- | --- |
| Assign, reassign, edit, reopen, archive training | QA Head |
| Record a completion on someone's behalf | QA Head |
| Start and complete **your own** training | Any active user, from their Worklist |
| View the organisation's training position | QA Head, Customer Admin |
| View the audit trail | QA Head, Customer Admin, Platform Admin |
