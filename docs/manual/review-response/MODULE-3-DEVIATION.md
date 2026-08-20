# Module 3 — Deviation Management

Replacement copy for page 3 (CAPA assignment), page 6 (QA Head worklist) and the
new audit-trail section.

---

## Page 3 — Raising and assigning a CAPA

> **Replaces the current CAPA-ownership wording.**

Where a deviation requires corrective action, the **QA Head** raises a CAPA from
the deviation. Only QA Head can raise a CAPA — the option is not shown to other
roles, and the server refuses the request if it is attempted another way.

A CAPA is not assigned as a single unit. The QA Head raises it, then breaks the
work into **action items** on the CAPA's **Assignments** tab, each with its own
owner and due date. This is what makes a CAPA trackable: three people can be
working three parts of the same CAPA, each accountable for their own item.

**Who can be given a CAPA action item**

| Role | Can own an action item |
| --- | --- |
| Quality Assurance | Yes |
| QC / Lab Director | Yes |
| CSV / Val Lead | Yes |
| Regulatory Affairs | Yes |
| IT / CDO | Yes |
| Operations Head | Yes |
| **QA Head** | **No — see below** |
| Customer Admin, Platform Admin, Viewer | No |

**Why the QA Head cannot be an assignee.** QA Head is the approving authority: it
raises the CAPA, reviews the root-cause analysis, approves, verifies and signs
the closure. Segregation of duties requires that the role approving the work is
not the role performing it. If the QA Head could also execute action items, the
same person could raise, do and close a CAPA — which is precisely what the
control exists to prevent.

The system enforces the related separations too. It will refuse to let the person
who wrote a CAPA's root-cause analysis close it, refuse a self-closure, and
refuse the same signer to perform both the verification and the effectiveness
review. Each refusal is recorded on the audit trail.

**To assign an action item**

1. Open the CAPA → **Assignments**.
2. **Add action item**, describe the action, pick the owner and set a due date.
   The due date cannot fall after the CAPA's own due date.
3. The owner sees it on their **Worklist** immediately and is notified.

**To move an action item to someone else** — use **Reassign** on the item. It
takes a reason, and the same eligibility rules apply to the new owner.

---

## Page 6 — The QA Head's worklist

> **Replaces the current worklist-capability description.**

The **Worklist** is *your* work: it lists the items assigned to the person signed
in, drawn from every module — CAPA action items, deviation tasks, gap findings,
validation rework tasks and training. It does not show other people's work and it
is not where work is handed out.

From the Worklist you can:

- **See everything assigned to you in one place**, with the returned-for-rework
  items pinned at the top and everything else ordered by due date.
- **See what is overdue or due this week** on the summary cards.
- **Open an item and work it** — record progress, attach evidence, reply to QA's
  comments, and submit it back for review.
- **Start and acknowledge your own training.**

The Worklist does **not** assign work and does **not** change priorities. The
priority shown against an item is the one carried from its source record.

**Note for QA Head.** Because QA Head is the approving authority rather than an
executor, a QA Head's worklist is usually sparse — it shows gap findings assigned
to them, and little else. QA Head's day-to-day queue is the module dashboards:
the CAPA Tracker for CAPAs awaiting review, and the Deviation register filtered
to *Pending QA Review*.

**Where QA Head assigns and prioritises work**

| To do this | Go to |
| --- | --- |
| Assign a CAPA action item | CAPA detail → Assignments |
| Assign a deviation task | Deviation detail → Assign Task |
| Transfer ownership of a deviation | Deviation detail → **Reassign** |
| Set or change a due date | The record's edit form (records a reason) |
| Change a severity or priority | The record's edit form (records a reason) |

---

## Audit trail

> **New section.** For what an entry contains and where to find it, see the
> common audit-trail section.

The audit trail covers the whole Deviation Management lifecycle, including the
CAPAs raised from a deviation. A deviation's own history — reachable from
**Deviation detail → Audit trail for this deviation** — includes its investigation
tasks and the electronic signatures raised on closure or rejection, so a closed
deviation never appears without the signature behind it.

### Events recorded

**The deviation**

| Event | When |
| --- | --- |
| Deviation created | A deviation is reported |
| Deviation updated | Any field is edited — records each changed field before and after, with an optional reason |
| Deviation reassigned | Ownership is transferred to another person. Requires a reason. Records both names and roles |
| Deviation investigation started | QA Head moves it to *Under Investigation* |
| Deviation investigation saved | Investigation progress is saved |
| Deviation investigation completed | Investigation is submitted — moves the deviation to *Pending QA Review* |
| Deviation rejected | QA returns it. Requires a signature and a message |
| Deviation closed / Deviation closed & signed | QA closes it, with the closure signature |
| Deviation reopened | A closed or rejected deviation is returned to investigation. Requires a reason. The original closure signature is retained on the record |
| Deviation deleted / restored | The record is retired or brought back, with a reason |

**Investigation tasks raised from the deviation**

| Event | When |
| --- | --- |
| Deviation task assigned | Investigation work is assigned to a team member |
| Deviation task submitted for review | The assignee submits their work |
| Deviation task returned for rework | QA sends it back |
| Deviation evidence attached | A document is attached to the deviation or a task |

**The CAPA relationship**

| Event | When |
| --- | --- |
| CAPA decision recorded / updated | QA records whether the deviation requires a CAPA, and why |
| CAPA created | A CAPA is raised from this deviation |
| Deviation linked to prior CAPA as recurrence | The deviation is cited as a recurrence of an earlier CAPA |
| CAPA assigned / reassigned | Ownership of the linked CAPA moves |
| CAPA action item assigned / reassigned | Work on the linked CAPA moves |
| CAPA updated, approved, rejected, closed, reopened | The linked CAPA's own lifecycle — see Module 4 |

### Deviation statuses

| Status | Meaning |
| --- | --- |
| Open | Reported, not yet under investigation |
| Under Investigation | QA has started the investigation |
| Pending QA Review | Investigation complete, awaiting QA disposition |
| CAPA Pending | A CAPA has been raised and is not yet closed |
| Closed | Closed by QA with an electronic signature |
| Rejected | Returned by QA with a signature and a message |

### A note on "approved"

Deviations are **dispositioned**, not approved. QA Head either closes the
deviation — which requires an electronic signature and, for a Critical deviation,
a linked CAPA — or rejects it back for further work. There is no separate approval
step between the two, so there is no "Deviation approved" event; the closure
signature is the approval.
