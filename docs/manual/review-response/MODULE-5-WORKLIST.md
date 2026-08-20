# Module 5 — Worklist

New "assignment roles" and audit-trail sections.

---

## What this module is

The Worklist is **your work**. It gathers everything currently assigned to the
person signed in, from every module, into one list — so nobody has to open five
modules to find out what they owe.

It is a **receiving** surface, not a dispatching one. Work is assigned to you
elsewhere and appears here; you cannot assign work to anyone from this page.

---

## Assignment roles

> **New section.** The roles eligible to *receive* work in the Worklist.

### What can arrive here

| Work type | Assigned from | Who can receive it |
| --- | --- | --- |
| **CAPA action item** | CAPA detail → Assignments | Quality Assurance, QC/Lab Director, CSV/Val Lead, Regulatory Affairs, IT/CDO, Operations Head |
| **Gap finding** | Gap Assessment | The same set, **plus QA Head** |
| **Deviation task** | Deviation detail → Assign Task | Any operational role |
| **Validation rework task** | CSV/CSA → Execute tab | Any operational role |
| **Training** | Inspection Readiness → Training | Any active user |

### Role-specific restrictions

**QA Head is not eligible for CAPA action items.** QA Head raises, reviews,
approves and closes CAPAs; it does not execute them. Assigning a CAPA action item
to the role that will approve it collapses segregation of duties. QA Head *is*
assignable on gap findings, where it is acting as an investigator rather than as
the approving authority.

**Viewer** receives nothing. The role is read-only throughout the system.

**Customer Admin** receives nothing. It administers the organisation's settings
and users; it is read-only outside Settings.

**Platform Admin** receives nothing and cannot author any GxP record. It is a
support identity belonging to the platform operator, not to your organisation,
and it is walled out of quality-record authorship by design.

**Quality Assurance (`qa`)** is an executor. It can be assigned work and can
complete it, but it cannot raise, approve, sign, close or delete quality records
— those are QA Head's.

---

## What you can do here

- **See everything assigned to you**, across CAPAs, deviations, gap findings,
  validation rework and training.
- **See what needs rework first** — items QA has returned are pinned at the top
  in their own section.
- **See what is overdue and what is due this week**, on the summary cards.
- **Open an item and work it**: record progress and completion notes, attach
  evidence, read and reply to QA's comments, and submit it back for review.
- **Start and acknowledge your own training** — the *My training* panel.

## What you cannot do here

- Assign work to anyone, including yourself.
- Change an item's priority or due date. Both come from the source record and are
  changed there, by the role that owns it.
- See anyone else's work.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

**The Worklist keeps no separate audit trail of its own**, and this is
deliberate: it holds no records. It is a view onto work that lives in the CAPA,
Deviation, Gap Assessment, CSV/CSA and Training modules.

Everything you do here is fully audited — against the record it belongs to. When
you submit an action item from the Worklist, the entry is written to that CAPA's
trail; when you attach evidence, it is written to that CAPA's evidence history;
when you acknowledge training, it is written to that training record. Nothing is
lost by the trail living with the record: it is where an inspector looks for it,
and it means one record's history is complete in one place.

| Work you do here | Where its audit entries appear |
| --- | --- |
| Working, submitting or completing a CAPA action item | Module 4 — CAPA Management |
| Attaching or removing evidence | Module 8 — Evidence & Documents |
| Working or submitting a deviation task | Module 3 — Deviation Management |
| Working a gap finding | Module 2 — Gap Assessment |
| Submitting a validation rework task | Module 6 — CSV/CSA Validation |
| Starting, completing or acknowledging training | Module 9 — Training & Awareness |

To see everything one person did across every module in a period, use the
**Audit Trail** module and filter by user — that is the view the per-record trails
cannot give you, and it is available to QA Head, Customer Admin and Platform
Admin.
