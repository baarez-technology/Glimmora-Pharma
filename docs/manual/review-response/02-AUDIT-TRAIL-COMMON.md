# Audit trail — the common section

Include this **once** (suggested: as an appendix, or in the Getting Started
chapter). Each module's audit section then covers only its own events and
cross-references back here, instead of repeating the same four paragraphs nine
times.

---

## What the audit trail is

Every action that creates, changes, disposes of or deletes a quality record is
written to a secure, computer-generated, time-stamped audit trail. Entries are
written by the server at the moment the action succeeds, in the same database
transaction as the change itself — so a change cannot be saved without its audit
entry, and an audit entry cannot exist for a change that did not happen.

The trail is **append-only**. No screen, action or role in the application can
edit or delete an audit entry.

## What each entry records

The regulatory minimum is user, event, date and time. Every entry here records
more than that:

| Field | What it holds |
| --- | --- |
| **User name** | The name of the person who performed the action, stored on the entry itself so it stays readable after the user is renamed or deactivated |
| **User ID** | The person's unique account identifier |
| **User role** | Their role at the time of the action — not their role today |
| **Event / action** | What was done, e.g. *Deviation reassigned* |
| **Date and time stamp** | Recorded by the server in UTC and displayed in your organisation's configured time zone. The user's device clock is never used |
| **Module** | Which part of the system the action happened in |
| **Record** | The record the action was performed on, by its human-readable reference |
| **Previous value** | What the field held **before** the change |
| **New value** | What it holds after, plus any reason for change |
| **IP address** | Where the action came from, where available |

### Previous value and reason for change

21 CFR Part 11 §11.10(e) requires that recording a change must not obscure the
previously recorded information. Where a record is edited, the entry names each
field that changed and shows its value **before and after**:

> **Deviation updated** — Jane Okafor (QA Head) — 14 Aug 2026 09:42
> Severity: ~~Major~~ → Critical
> Due date: ~~2026-09-01~~ → 2026-08-20
> *Reason: reclassified after batch impact assessment*

Actions that transfer responsibility, reopen a closed record, waive a control or
retire a record **require** a reason before they will complete. Ordinary field
edits accept an optional one.

### Failed attempts

Refused actions are recorded too, not only successful ones. If someone tries to
close a CAPA they are not permitted to close, or enters the wrong password when
signing, the attempt is written to the trail (`SIGNING_PASSWORD_FAILED`,
`CAPA_CLOSE_BLOCKED_SELF_CLOSE`, and similar). This satisfies §11.300(d) and
means the trail shows what was *attempted*, not only what succeeded.

## Where to see it

**Per record.** Each record carries its own history, so you do not have to search
a system-wide log to answer "what happened to this one":

| Module | Where |
| --- | --- |
| Deviations | Deviation detail → *Audit trail for this deviation* |
| CAPAs | CAPA detail → the *Audit trail* bar at the foot of every tab |
| Inspections & Regulatory | Event detail → **Audit** tab (with its own export) |
| CSV/CSA Validation | System detail → *Validation audit trail* |

A record's own history includes its children — a deviation's tasks, a validation
system's stages and requirements, an inspection's observations and commitments —
and the electronic-signature entries raised against it, so a closure never
appears without the signature behind it.

**System-wide.** The **Audit Trail** module is the authoritative record for the
whole organisation, with filtering by module, action, user and date, and export
to CSV, Excel and PDF. It is available to **QA Head**, **Customer Admin** and
**Platform Admin**.

## Retention

Audit entries are retained for the life of the record they describe and are
included in the record's export. They are never purged on a schedule.

## Time zone

All entries are stored in UTC and rendered in the time zone configured for your
organisation in Settings. Two people in different countries reading the same
entry see the same moment in their own local time.
