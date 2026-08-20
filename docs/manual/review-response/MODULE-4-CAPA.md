# Module 4 — CAPA Management

New audit-trail section.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

Every CAPA carries its full history from creation to closure. Open any CAPA and
the **Audit trail** bar at the foot of the page shows that CAPA's events, on
every tab. It is the record you walk an inspector through when they ask how a
particular corrective action was arrived at, who did the work, who checked it and
on what basis it was closed.

### Traceability from creation to closure

A CAPA's trail answers, without leaving the record:

- **Where it came from** — the gap finding, deviation, regulatory observation or
  validation system that triggered it, and who decided a CAPA was warranted.
- **Who did what** — every action item, who it was assigned to, who reassigned it
  and when, what evidence they attached, and what QA said when sending it back.
- **Who checked it** — the root-cause review, the action-to-cause alignment
  review, the data-integrity gate, and who cleared each.
- **On whose signature it closed** — the closure signature, the verification
  signature and the effectiveness-review signature, each bound to a
  password-reauthenticated identity and a hash of what was signed.
- **What was refused** — attempts that the system blocked, and why.

### Events recorded

**Creation and linkage**

| Event | When |
| --- | --- |
| CAPA created | A CAPA is raised (by QA Head only) |
| Finding escalated to CAPA | A gap finding becomes a CAPA |
| CAPA raised from observation | A regulatory observation becomes a CAPA |
| CAPA raised from system | A validation system issue becomes a CAPA |
| CAPA linked to observation | An existing CAPA is linked to a regulatory observation |
| CAPA comments carried from finding | Discussion carries over from the source record |

**Ownership and assignment**

| Event | When |
| --- | --- |
| CAPA assigned | The CAPA is given an owner for the first time |
| CAPA reassigned | Ownership moves. Records both names, both roles, before and after |
| CAPA action item assigned | Work is assigned to an executor |
| CAPA action item reassigned | That work moves to someone else |
| CAPA action item added / updated / status changed / deleted / restored | The action-item lifecycle |
| CAPA action item invalidated by edit | An edit invalidates work already submitted against it |
| CAPA assignment carried / carry skipped | An assignment carried over from the source finding — or, with the reason, why it could not |

**Investigation and implementation**

| Event | When |
| --- | --- |
| CAPA updated | Any field is edited — records each changed field before and after |
| CAPA implementation started | Work begins |
| CAPA implementation completed | All action items are complete |
| CAPA RCA review cleared / override | QA accepts the root-cause analysis, or overrides a rejection with a recorded rationale |
| CAPA RCA review invalidated by edit | The root-cause analysis is edited after review, voiding it |
| Alignment status set / cleared / override | The action-to-cause alignment review |
| CAPA data-integrity gate cleared | The DI gate is satisfied |

**Review, approval and closure**

| Event | When |
| --- | --- |
| CAPA submitted for review | The owner submits it to QA |
| CAPA work returned for correction | QA sends work back to the assignee |
| CAPA work accepted | QA accepts an assignee's submitted work |
| CAPA rejected | QA rejects the CAPA |
| CAPA verified / verification signed | The implementation is verified and signed |
| CAPA verification revoked | A verification is withdrawn |
| CAPA effectiveness reviewed / review signed | The effectiveness check is recorded and signed |
| CAPA found ineffective | The effectiveness check fails |
| CAPA effectiveness review revoked | An effectiveness review is withdrawn |
| CAPA closed / closure signed | The CAPA is closed, with its signature |
| CAPA reopened | A closed CAPA is returned to open |
| Finding closed by CAPA | The source finding closes as a result |
| CAPA deleted / restored | The record is retired or brought back |

**Evidence** — see Module 8.

**Refused attempts**

These are recorded when the system blocks an action. They are part of the trail
and will be visible to an inspector:

| Event | What was attempted |
| --- | --- |
| CAPA close blocked — self close | Someone tried to close a CAPA they own |
| CAPA close blocked — RCA author | The author of the root-cause analysis tried to close it |
| CAPA close blocked — not approved | Closure attempted before approval |
| CAPA close blocked — incomplete actions | Closure attempted with action items outstanding |
| CAPA effectiveness blocked — same signer | The same person tried to sign both the verification and the effectiveness review |
| CAPA verification blocked — self / approver / status | Verification attempted by an ineligible signer, or at the wrong stage |
| CAPA submit blocked — not ready | Submission attempted before the CAPA was complete |
| CAPA SoD override used | A segregation-of-duties waiver was applied, with its recorded justification |
| Signing password failed | A signature attempt failed password re-authentication |

### CAPA statuses

| Status | Meaning |
| --- | --- |
| Open | Raised, not yet started |
| In Progress | Implementation under way |
| Pending QA Review | Submitted, awaiting QA |
| Closed | Approved and closed under signature |
| Rejected | Returned by QA for further work |

### A note on "approved"

The system does not record a single flat "CAPA approved" event. Approval of a
CAPA happens in named, separately-signed steps — the root-cause review, the
alignment review, the verification, the effectiveness review and the closure —
each with its own event and its own signature. This is deliberate: an inspector
asking *who approved this CAPA* should get five specific answers, not one vague
one.
