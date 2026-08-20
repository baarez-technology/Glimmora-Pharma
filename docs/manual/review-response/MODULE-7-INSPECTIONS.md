# Module 7 — Inspections & Regulatory

New role-ownership, naming-convention and audit-trail sections.

---

## Who owns this module

> **Replaces the current role description. New screenshots required — see below.**

**Regulatory Affairs** owns the inspection and regulatory-response workflow. The
role can:

- Create an inspection, FDA 483 or Warning Letter record
- Record and edit observations, including importing them from a 483 PDF
- Draft the response, attach supporting documents and record commitments
- **Sign and submit** the response under electronic signature
- Record the regulatory outcome

**Two steps stay with QA Head:**

| Step | Why |
| --- | --- |
| **Raising a CAPA from an observation** | Every CAPA in the system is raised by QA Head, from every source. A Regulatory Affairs user attempting it is told *"Only QA Head can create a CAPA."* |
| **Deleting a regulatory record** | Deletion of a GxP record is restricted to QA Head |

This is not a gap. Regulatory Affairs owns the response to the regulator; QA owns
the corrective action that response commits to. Keeping the two with different
roles is what makes the commitment credible.

**Screenshots.** Every screen in this module should be captured from a
**Regulatory Affairs** account, except the *Raise CAPA from observation* step,
which must be captured from a **QA Head** account and captioned to explain the
handoff.

> **Note on role names.** The role is displayed throughout the product as
> **Regulatory Affairs**. There is no role called "QA Lead" or "Regulatory
> Affairs Owner" — if either appears in the current screenshots they are out of
> date and must be re-shot.

---

## Naming convention

> **New section.**

Regulatory records are given a reference automatically when created.

### `483-CHN-2026-003`

| Part | Means |
| --- | --- |
| **`483`** | **The record type.** An FDA Form 483 — a list of inspectional observations issued at the close of an FDA inspection. This segment changes with the type of record (see the table below) |
| **`CHN`** | **The site code** of the site inspected. `CHN` is the Chennai QC Laboratory |
| **`2026`** | **The year** the record was created |
| **`003`** | **The sequence number** — the third record of this type, at this site, in this year. Three digits, zero-padded. The count restarts each January |

### The type segment is not always `483`

| Record type | Segment | Example |
| --- | --- | --- |
| FDA 483 | `483` | `483-CHN-2026-003` |
| Warning Letter | `WL` | `WL-CHN-2026-001` |
| EMA inspection | `EMA` | `EMA-CHN-2026-002` |
| MHRA inspection | `MHRA` | `MHRA-CHN-2026-001` |
| WHO inspection | `WHO` | `WHO-CHN-2026-001` |
| Health Canada inspection | `HC` | `HC-CHN-2026-001` |
| TGA inspection | `TGA` | `TGA-CHN-2026-001` |
| PMDA inspection | `PMDA` | `PMDA-CHN-2026-001` |
| CDSCO inspection | `CDSCO` | `CDSCO-CHN-2026-001` |
| ANVISA inspection | `ANVISA` | `ANVISA-CHN-2026-001` |
| Other inspection | `INS` | `INS-CHN-2026-001` |

### Using the regulator's own reference instead

You can **type your own reference** when creating the record — and you usually
should, when the regulator has issued one. Entering the real Warning Letter
number, or the FDA's own 483 identifier, keeps your record and the regulator's
correspondence on the same identifier, which matters when you are responding
under a deadline.

If you enter a reference, no code is generated. The automatic format above is the
fallback for records that have no external identifier yet — an inspection being
prepared for, or observations logged before the formal 483 arrives.

### Observations

Each observation within a record gets its own reference in the same format, so an
individual observation can be cited, assigned and tracked independently of the
event it belongs to.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

This module has a dedicated **Audit** tab on every regulatory record, grouped by
day and with its own export to CSV, Excel and PDF. It covers the event, its
observations, its commitments and its response documents.

### Events recorded

**The record**

| Event | When |
| --- | --- |
| FDA 483 event created | An inspection, 483 or Warning Letter record is created — the same event covers every record type |
| FDA 483 event updated | Any field is edited |
| FDA 483 event deleted | The record is deleted (QA Head only) |
| Stage handed off | The record moves to the next workflow stage and changes hands |

**Observations**

| Event | When |
| --- | --- |
| Observation added | An observation is recorded against the event |
| Observations imported from PDF | Observations are extracted in bulk from a 483 PDF |
| Observation updated | An observation is edited |
| Observation response drafted | A response to a specific observation is drafted |
| Observation closed | An observation is closed out |
| Observation deleted | An observation is removed |

**The response**

| Event | When |
| --- | --- |
| Response draft saved | The response is drafted or edited |
| AGI draft saved | An AI-assisted draft is saved. Always distinguishable from a human draft in the trail |
| Response document added / removed | Supporting evidence is attached to the response |
| FDA 483 response signed | The response is signed under electronic signature |
| FDA 483 response submitted | The response is submitted |
| FDA 483 outcome recorded / signed | The regulator's outcome is recorded and signed |

**Commitments made to the regulator**

| Event | When |
| --- | --- |
| Commitment added / updated | A commitment is made or revised |
| Commitment completed | A commitment is fulfilled |
| Commitment reopened | A completed commitment is reopened |
| Commitment deleted | A commitment is removed |

**Corrective action**

| Event | When |
| --- | --- |
| CAPA raised from observation | A CAPA is raised against an observation (QA Head) |
| CAPA linked to observation | An existing CAPA is linked to an observation |

### What "response submitted" means

**Response submitted** records that the response was completed, signed and
submitted **within this system**, on the date and by the person shown. The
platform does not transmit anything to a regulatory authority — filing with the
agency remains a separate, external step through the agency's own channel. Record
the date of that external submission in the response record so the two are
traceable to each other.

### On approval and rejection

Regulatory records do not have an approve/reject cycle. The workflow is **draft →
sign → submit → outcome**, and the electronic signature on the response is the
approval. There is therefore no "record approved" or "record rejected" event in
this module — where you would look for one, look for the response signature and
the recorded outcome.
