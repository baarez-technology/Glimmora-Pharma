# Response to the reviewer — four points we are not changing

Everything else in the review has been accepted and implemented. These four
describe behaviour the system deliberately does not have. In each case the
system's behaviour is the compliant one, and changing it to match the review
would weaken a control. We are proposing to correct the manual instead.

---

## 1. A CAPA cannot be assigned to the QA Head

**The review asks for:** *"Clarify that a CAPA may be assigned to: QA, QA Head,
other applicable authorized roles."*

**What the system does:** QA Head **raises** a CAPA and **assigns** each action
item. QA Head **cannot be an assignee**. The eligible executor set is Quality
Assurance, QC/Lab Director, CSV/Val Lead, Regulatory Affairs, IT/CDO and
Operations Head. This is enforced in the assignee dropdown and independently on
the server in three places, so it cannot be bypassed by a crafted request.

**Why we are keeping it:** it is segregation of duties. The role that approves,
verifies and closes a CAPA must not also be the role that performs the
corrective action — 21 CFR Part 11 §11.10(d), EU GMP Annex 11 §2, ICH Q10 §3.2.
An inspector who finds the same person raising, executing and closing a CAPA
will treat every CAPA in that system as unreliable.

The system also enforces the narrower forms of this: it blocks a CAPA being
closed by the person who authored its root-cause analysis, blocks self-closure,
and blocks the same signer performing both the verification and the
effectiveness review. Each refusal is written to the audit trail
(`CAPA_CLOSE_BLOCKED_SELF_CLOSE`, `CAPA_CLOSE_BLOCKED_RCA_AUTHOR`,
`CAPA_EFFECTIVENESS_BLOCKED_SAME_SIGNER`). Making QA Head assignable would open
a route around all of them.

**Proposed manual wording:** see [MODULE-3-DEVIATION.md](MODULE-3-DEVIATION.md),
§ *Raising and assigning a CAPA*.

---

## 2. The Worklist does not assign work, and does not prioritise it

**The review asks for:** *"the QA Head can locate assigned or available records,
prioritize records, open and review records, assign records/tasks to appropriate
team members."*

**What the system does:** the Worklist shows **only work assigned to the signed-in
user**. It is read-only aggregation. It has no team view, no assignment control,
and no way to change a priority — the Priority column is display, and the sort
order is fixed (returned-for-rework first, then open, then soonest due).

There is a second, sharper problem with the current wording: because QA Head
cannot own CAPA action items (see point 1), **a QA Head's worklist is normally
close to empty**. It picks up gap findings assigned to them and nothing else.
Screenshots taken from a QA Head account to illustrate "the QA Head worklist"
will show an empty page.

Assignment happens where the record lives:

| To assign | Go to |
| --- | --- |
| A CAPA action item | CAPA detail → **Assignments** tab |
| A deviation task | Deviation detail → **Assign Task** |
| Ownership of a deviation | Deviation detail → **Reassign** (QA Head, reason required) |
| A gap finding | Gap Assessment → the finding's assign control |
| A validation rework task | CSV/CSA system → **Execute** tab |
| Training | Inspection Readiness → Training → **Assign training** |

**Two ways forward.** Either the manual is corrected to describe the Worklist as
"My Work" — which is what it is — or a QA Head team worklist is built. The
second is real feature work (a team-scoped query, an assignment action, a new
audit event, and a role gate) and is not in this branch. We recommend correcting
the manual now and raising the team worklist separately if the customer wants it.

**Proposed manual wording:** see [MODULE-5-WORKLIST.md](MODULE-5-WORKLIST.md).

---

## 3. There is no "QA Lead" role, and no "Regulatory Affairs Owner" role

**The review asks for:** *"The current screenshots display QA Lead; these should
be replaced with screenshots captured from the appropriate Regulatory Affairs
Owner account."*

**What the system has:** ten roles, none of them named either of those.

| Stored role | Displayed as |
| --- | --- |
| `qa_head` | **QA Head** |
| `qa` | Quality Assurance |
| `qc_lab_director` | QC / Lab Director |
| `regulatory_affairs` | **Regulatory Affairs** |
| `csv_val_lead` | CSV / Val Lead |
| `it_cdo` | IT / CDO |
| `operations_head` | Operations Head |
| `customer_admin` | Customer Admin |
| `super_admin` | Platform Admin |
| `viewer` | Viewer |

"QA Lead" appears nowhere in the product. If the screenshots show it, they are
either mocked up or from a build that predates the current role labels — either
way they must be re-shot, and the reviewer is right about that.

**The substantive half of the point is accepted.** Regulatory Affairs *is* the
right role for most of Module 7, and can perform almost all of it: create the
inspection / 483 / Warning Letter record, add observations, draft and attach the
response, and **sign and submit** it.

**One step must stay with QA Head:** raising a CAPA from an observation. That
routes through the single CAPA-creation path, which is QA-only (point 1). A
Regulatory Affairs user gets *"Only QA Head can create a CAPA."* Deleting a 483
event is likewise QA Head only. So Module 7's screenshots should be re-shot from
a Regulatory Affairs account **except** those two steps, which need a QA Head
account and a sentence explaining the handoff.

**If the customer's own org chart calls this role "Regulatory Affairs Owner"**,
the clean fix is to change the display label in the product so the manual and the
screen agree. That is a one-line change and we can make it — but it should be a
decision, not a silent divergence between the manual and the UI.

**Proposed manual wording:** see [MODULE-7-INSPECTIONS.md](MODULE-7-INSPECTIONS.md).

---

## 4. Document "version superseded" is not a feature we can document

**The review asks for:** an audit event for *"Document version updated or
superseded, where applicable."*

**What the system has:** a `version` field on a document that is a **free-text
label**, defaulting to `v1.0`. There is no version-history table, no supersede
chain, and no way to retrieve a previous version of a document. Changing the
label from `v1.0` to `v2.0` overwrites a string; it does not create a version.

We are not going to document supersession as though it works. A manual that
describes document version control to an inspector, in a system that cannot
produce a superseded version on request, is a finding waiting to happen.

**This is a genuine gap, and the reviewer has identified it correctly** — EU GMP
Annex 11 §9 and Chapter 4 do expect version control over GxP documents. It needs
a version-history model, a supersede action, and retrieval of prior versions. It
is scoped but not built, and belongs in the Phase 2 backlog rather than in this
manual revision.

Module 8's audit section documents what the system genuinely records today, and
says plainly what it does not. See [MODULE-8-EVIDENCE.md](MODULE-8-EVIDENCE.md).
