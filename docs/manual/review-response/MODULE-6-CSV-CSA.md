# Module 6 — CSV/CSA Validation

New naming-convention, GAMP-category and audit-trail sections.

---

## Naming convention

> **New section.**

Every validated system is given a reference automatically when it is created.
You never type one, and it cannot be changed afterwards.

### `SYS-CHN-0002`

| Part | Means |
| --- | --- |
| **`SYS`** | **System.** The record is a GxP computerised system under validation — a LIMS, an ERP, a chromatography data system, a SCADA or MES, and so on. Every validation record in this module carries this prefix |
| **`CHN`** | **The site code** of the manufacturing or laboratory site the system belongs to. `CHN` is the Chennai QC Laboratory. Site codes are 2–6 letters, unique within your organisation, and set when the site is created |
| **`0002`** | **The sequence number** — the second system registered at that site. Four digits, zero-padded, allocated in order and never reused, even if a system is later retired |

**The sequence runs per site, not per organisation.** `SYS-CHN-0002` and
`SYS-MUM-0002` are different systems at different sites. This is intentional:
each site's validation inventory numbers independently, which is how site
inspections are run.

**There is no year in a system reference**, unlike deviations, CAPAs and
regulatory records. A validated system is a standing asset with a life measured
in years, so numbering it by year of registration would be misleading — the
number identifies the system, not when it was registered.

### Site codes across the other modules

The same site code appears in every module's reference, so you can tell at a
glance which site a record belongs to:

| Module | Format | Example |
| --- | --- | --- |
| CSV/CSA systems | `SYS-<site>-<nnnn>` | `SYS-CHN-0002` |
| Deviations | `DEV-<site>-<year>-<nnn>` | `DEV-CHN-2026-014` |
| CAPAs | `CAPA-<site>-<year>-<nnn>` | `CAPA-CHN-2026-007` |
| Gap findings | `FND-<site>-<year>-<nnn>` | `FND-CHN-2026-031` |
| Regulatory records | `<type>-<site>-<year>-<nnn>` | `483-CHN-2026-003` |

---

## GAMP software categories

> **New section.**

Every system is classified against a **GAMP 5** software category when it is
created. The category is not paperwork: it determines **how much validation the
system actually asks you to do**.

| Category | What it covers | Examples |
| --- | --- | --- |
| **Category 1 — Infrastructure** | Established, commercially available infrastructure software that other applications run on | Operating systems, database engines, network software, antivirus |
| **Category 3 — Non-configured** | Commercial off-the-shelf software used as supplied, with no configuration of business rules | An unconfigured balance or pH meter; a standard instrument package used with default settings |
| **Category 4 — Configured** | Commercial software configured to your process, without changing its code | A LIMS, ERP or QMS configured with your workflows, roles and specifications |
| **Category 5 — Custom** | Software written or bespoke-developed for you | A bespoke MES interface, a custom calculation module, an in-house application |

**Category 2 is not offered.** It covered firmware in earlier GAMP guidance and
was **retired in GAMP 5**; firmware is now assessed under the categories above.
Its absence from the dropdown is correct, not an omission.

### How the category drives the validation work

Selecting a category builds the system's validation plan. Stages that the
category does not require are **still created**, then automatically marked *Not
applicable* with a recorded rationale — so an inspector sees the complete V-model
and the documented reason each stage was scoped out, rather than a plan with
gaps in it.

| Category | Stages actively validated |
| --- | --- |
| **1 — Infrastructure** | IQ |
| **3 — Non-configured** | URS · IQ · OQ |
| **4 — Configured** | URS · FS · IQ · OQ · PQ |
| **5 — Custom** | URS · FS · DS · IQ · OQ · PQ · RTR |

| Stage | Full name |
| --- | --- |
| URS | User Requirement Specification |
| FS | Functional Specification |
| DS | Design Specification |
| IQ | Installation Qualification |
| OQ | Operational Qualification |
| PQ | Performance Qualification |
| RTR | Requirements Traceability Review |

This is risk-based scoping in the sense FDA's **Computer Software Assurance**
guidance intends: effort concentrated where the software actually carries risk to
product quality, patient safety or data integrity, rather than the same document
set produced for an operating system and a bespoke MES alike.

**If a category is missing or unrecognised**, the system falls back to the full
Category 5 V-model. It over-validates rather than under-validates — a
misconfigured record costs you extra work, never a compliance gap.

**Changing a category** after creation re-scopes the remaining stages, and both
the change and the re-scope are recorded on the audit trail.

---

## Audit trail

> For what an entry contains and where to find it, see the common audit-trail
> section.

Each system carries its own history — **System detail → Validation audit trail** —
covering the system, its validation stages, its requirements-traceability entries
and the electronic signatures raised against it.

### Events recorded

**The system record**

| Event | When |
| --- | --- |
| System created | A system is registered and its validation plan is built |
| System updated | Any field is edited — records each changed field before and after |
| System risk classification updated | The GxP risk classification changes |
| System risk factors updated | The underlying risk assessment changes |
| System review dates updated | Periodic review dates are set or moved |
| System remediation updated | Remediation planning changes |
| System deleted / restored | The record is retired or brought back |

**Validation status**

| Event | When |
| --- | --- |
| Validation status auto-derived | The status is recalculated from stage progress |
| Validation status auto-resumed | Automatic derivation resumes after a manual attestation |
| Validation status manually attested | A user overrides the derived status, with a recorded rationale |
| Validation sign-off signed | The system is signed as validated. Binds the signer's identity to a hash of the stage tallies signed for |
| Validation sign-off revoked | A sign-off is withdrawn |

**Validation stages**

| Event | When |
| --- | --- |
| Validation document uploaded | A protocol, report or record is attached to a stage |
| Validation document removed | A stage document is removed |
| Validation stage notes updated | Stage notes are edited |
| Validation stage submitted for review | The stage owner submits it to QA |
| Validation stage approved | QA approves it |
| Validation stage rejected | QA returns it — the stage reopens for work |
| Validation stage skipped | The stage is scoped out as not applicable, with its rationale |
| Validation rework task assigned | Rework on a rejected stage is assigned to a team member |

**Links to other quality records**

| Event | When |
| --- | --- |
| CAPA raised from system | A CAPA is raised against this system |
| Finding linked to system | A gap finding is associated with the system |
| Finding unlinked from system | That association is removed |

### Who can do what

| Action | Roles |
| --- | --- |
| Create and edit a system | CSV / Val Lead, QA Head |
| Upload stage documents, submit stages | CSV / Val Lead, QA Head |
| Approve or reject a stage | QA Head |
| Sign the validation sign-off | QA Head |
| View the module | QA Head, CSV / Val Lead, Customer Admin |
