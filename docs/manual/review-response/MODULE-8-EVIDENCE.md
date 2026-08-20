# Module 8 — Evidence & Documents

New audit-trail section.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

Evidence is what a closed CAPA rests on, so its history is tracked as closely as
the CAPA's own. Every upload, status change, review decision and removal is
recorded, and evidence entries appear in the parent CAPA's audit trail — an
inspector reviewing a CAPA sees the evidence history in the same place, without
having to cross-reference a separate log.

### Full traceability

For any piece of evidence you can establish, from the record itself:

- **Who provided it and when**, and against which CAPA and which evidence
  category.
- **That the file has not changed** — every uploaded file is fingerprinted with a
  SHA-256 content hash at upload. The hash is stored with the file and can be
  recomputed at any time to demonstrate the file is byte-for-byte what was
  submitted.
- **Who reviewed it, when, and what they decided** — approved or rejected, with
  the reason on a rejection.
- **What was said about it** — notes are versioned, so an earlier note is not
  overwritten by a later one.
- **Why a category was not applicable**, where one was scoped out.

### Events recorded

**Evidence**

| Event | When |
| --- | --- |
| Evidence categories initialised | The evidence structure is created for a CAPA |
| Evidence uploaded | A file is attached to an evidence category |
| Evidence status changed | A category moves between Pending, In Progress, Complete and Not Applicable — records the previous status and the new one |
| Evidence notes updated | Notes are edited. Previous versions are retained |
| **Evidence approved** | QA accepts an evidence category. Records who reviewed it and when, and whether the approval was of submitted evidence or of a *Not applicable* judgement |
| Evidence rejected | QA rejects a category. Requires a reason. Reopens **only that category** for rework — the CAPA stays in QA review and every other category stays locked |
| Evidence removed | A file is removed. The record is retained, not erased |

A category moving to or from **Not Applicable** requires a written rationale of
at least ten characters, stored as a note version alongside the status change.

**Documents**

| Event | When |
| --- | --- |
| Document uploaded | A document is added to the workspace |
| Document updated | Document metadata is edited |
| Document approved | QA approves a document |
| Document approval signed | The approval is bound to an electronic signature |
| Document rejected | QA rejects a document |
| Document deleted / restored | The document is retired or brought back |
| Signing password failed | A signature attempt failed re-authentication |

### Evidence statuses

| Status | Meaning |
| --- | --- |
| Pending | Required, nothing provided yet |
| In Progress | Partially provided |
| Complete | Provided in full and ready for QA review |
| Not Applicable | Scoped out, with a recorded rationale |
| Rejected | Reviewed by QA and returned for rework |

### Who can do what

| Action | Roles |
| --- | --- |
| Upload evidence, set a category's status | The CAPA's owner and assignees, and compliance authors |
| Propose *Not Applicable* | The CAPA's driver, with a rationale |
| Approve or reject an evidence category | QA Head, while the CAPA is under QA review |
| Approve, reject or sign a document | QA Head |

### Evidence locking

When a CAPA is submitted for QA review, its evidence **locks**: no further
uploads, status changes or removals. This is what makes the evidence set QA
reviews the same set that was submitted. If QA rejects one category, only that
category unlocks for rework — the rest stays locked, and the CAPA does not bounce
back out of review.

---

## What this module does not do

> **Include this. Do not describe document versioning as a feature.**

**There is no document version history.** A document carries a version *label*
(`v1.0` by default) that you can edit, but editing it overwrites a piece of text.
The system does not retain previous versions of a document, does not maintain a
supersede chain, and cannot produce an earlier version of a document on request.

If your quality system requires retrievable document version control — and under
EU GMP Annex 11 §9 and Chapter 4 it generally will — manage controlled documents
in your document management system and use this workspace for the evidence
attached to quality records. Do not treat the version field as a version control
system.

*(Evidence notes are the exception: they are genuinely versioned, and an earlier
note is recoverable.)*
