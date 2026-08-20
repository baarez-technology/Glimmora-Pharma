# Module 3–9 review response — drop-in manual sections

Written against the code, not against the previous draft. Every event name,
role, status and identifier format below was read out of the source and, where
it did not exist, built. Verified as of commit `0b075c4` on
`feat/audit-trail-completeness`.

## What is in here

| File | Covers |
| --- | --- |
| [01-REVIEWER-RESPONSE.md](01-REVIEWER-RESPONSE.md) | The four review points that are **wrong against the build**, with the reasoning to send back |
| [02-AUDIT-TRAIL-COMMON.md](02-AUDIT-TRAIL-COMMON.md) | The shared audit-trail preamble — include once, cross-reference from each module |
| [MODULE-3-DEVIATION.md](MODULE-3-DEVIATION.md) | CAPA assignment wording, QA Head worklist wording, audit trail |
| [MODULE-4-CAPA.md](MODULE-4-CAPA.md) | Audit trail |
| [MODULE-5-WORKLIST.md](MODULE-5-WORKLIST.md) | Assignment roles, audit trail |
| [MODULE-6-CSV-CSA.md](MODULE-6-CSV-CSA.md) | `SYS-CHN-0002` naming, GAMP categories, audit trail |
| [MODULE-7-INSPECTIONS.md](MODULE-7-INSPECTIONS.md) | Regulatory Affairs ownership, `483-CHN-2026-003` naming, audit trail |
| [MODULE-8-EVIDENCE.md](MODULE-8-EVIDENCE.md) | Audit trail, and the document-versioning limit |
| [MODULE-9-TRAINING.md](MODULE-9-TRAINING.md) | Audit trail, and the rebuilt training lifecycle |
| [99-OUTSTANDING.md](99-OUTSTANDING.md) | What is **not** done, and what must happen before these sections can be published |

## How to use these

The reviewed documents (`Pharma_Glimmora_Module3…9_*.pdf`) have **no source in
this repository** — they were generated elsewhere. These files are therefore
written as drop-in replacement copy rather than as edits to an existing source.
Paste each module's sections into the corresponding manual, then re-shoot the
screenshots each file calls for.

## Read this before publishing

Two of these sections describe behaviour that **exists in code on this branch
but is not yet live**:

- The Training & Awareness lifecycle needs its migration applied to Postgres.
- The per-record audit panels and the evidence approval control ship with this
  branch and need no migration.

See [99-OUTSTANDING.md](99-OUTSTANDING.md) for the full gate list. Publishing a
manual that describes unreleased behaviour is worse than publishing a thin one —
it is the manual an inspector will hold you to.
