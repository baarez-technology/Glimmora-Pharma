# SOW Requirements — Functional & Non-Functional

> Extracted from: **SOW - GXP-GMP_V3.0.docx**

---

## Platform Roles & Access (RBAC)

| # | Role Value | Label | Description |
|---|---|---|---|
| 1 | `super_admin` | Super Admin | Full platform access, tenant config, AGI policy, user management |
| 2 | `qa_head` | QA Head | QMS oversight, CAPA approval, batch disposition, management review |
| 3 | `qc_lab_director` | QC/Lab Director | Lab compliance, OOS/OOT, data integrity controls, instrument qualification |
| 4 | `regulatory_affairs` | Regulatory Affairs | Agency interactions, commitments, response coordination, 483/WL support |
| 5 | `csv_val_lead` | CSV/Val Lead | Computerized systems compliance, validation lifecycle, Part 11/Annex 11 |
| 6 | `it_cdo` | IT/CDO | Digital strategy, security, AI governance, system architecture |
| 7 | `operations_head` | Operations Head | Operational discipline, site performance, manufacturing oversight |
| 8 | `viewer` | Viewer | Read-only access to dashboards, reports, and evidence |

---

## Functional Requirements by Module

### FR-01: Authentication & Workspace

| ID | Requirement | Roles |
|---|---|---|
| FR-01.1 | Email + password login | All |
| FR-01.2 | SSO via OIDC/OAuth2 (enterprise IdP) | All |
| FR-01.3 | Environment picker (region/tenant) | All |
| FR-01.4 | Organization/Site selection modal (multi-site) | All |
| FR-01.5 | Site cards with country, GMP scope tags, risk level | All |
| FR-01.6 | Environment tag display (DEV/UAT/PROD) in header | All |

### FR-02: Executive Overview Dashboard

| ID | Requirement | Roles |
|---|---|---|
| FR-02.1 | Overall Readiness Score (0-100, color-coded) | All |
| FR-02.2 | KPI cards: Critical GxP Findings, CAPA Overdue %, CSV High Risk Systems, Training Compliance % | All |
| FR-02.3 | Area vs Readiness heatmap (Manufacturing, QC Lab, Warehouse, Utilities, QMS, CSV/IT) | All |
| FR-02.4 | Observation Volume & Severity trend chart by month (Critical/Major/Minor) | All |
| FR-02.5 | 90-Day Action Plan table (Priority, Area, Action, Owner, Due Date, Status, AGI Risk) | qa_head, super_admin, operations_head |
| FR-02.6 | AGI Insight panel (context rail) with key risks and suggestions | All |
| FR-02.7 | Filters: timeframe, site, severity threshold | All |
| FR-02.8 | Optional cards: Batch Readiness Risk, Supplier Quality Risk, Validation Debt, Regulatory Heat Index, COPQ, Cross-Site Benchmark | All |

### FR-03: Inspection Readiness Program

| ID | Requirement | Roles |
|---|---|---|
| FR-03.1 | Roadmap swimlane view (People, Process, Data, Systems, Documentation x 0-30d, 31-60d, 61-90d) | qa_head, operations_head, super_admin |
| FR-03.2 | RACI diagram for War Room governance | qa_head, super_admin |
| FR-03.3 | Front-room/back-room process flow diagram | All |
| FR-03.4 | Inspection playbook list (Front room, Back room, SMEs, DIL handling) | All |
| FR-03.5 | Playbook detail view (steps, do/don't bullets, attachments) | All |
| FR-03.6 | Training calendar (Mock Inspections, SME Coaching, QA/QC Workshops) | All |
| FR-03.7 | Training matrix: Roles x Modules x Status | qa_head, super_admin |
| FR-03.8 | Launch Simulation capability | qa_head, super_admin |

### FR-04: GxP/GMP Gap Assessment & Findings

| ID | Requirement | Roles |
|---|---|---|
| FR-04.1 | Filters: Site, Area, Framework (21 CFR 210/211, Annex 11, etc.), Severity, Status | All |
| FR-04.2 | Summary tiles: Total Findings by Severity, Top 5 Risk Drivers | All |
| FR-04.3 | Findings Register table (ID, Area, Requirement, Severity, Status, Owner, Target Date, Evidence Link) | All |
| FR-04.4 | Row detail panel (requirement text, AGI summary, risk explanation, CAPA link) | All |
| FR-04.5 | Evidence Index tree/table (Area > Document Type, Evidence Pack Status) | All |
| FR-04.6 | Risk-based classification: Critical / Major / Minor | qa_head, super_admin |

### FR-05: QMS & CAPA Blueprint

| ID | Requirement | Roles |
|---|---|---|
| FR-05.1 | Process map: CAPA lifecycle, Deviation, Change Control, Complaints | qa_head, super_admin |
| FR-05.2 | Target State Design and Current Gap per process step | qa_head |
| FR-05.3 | CAPA Tracker table (ID, Source, Risk, Owner, Due Date, Status, Effectiveness Check) | qa_head, super_admin |
| FR-05.4 | CAPA detail panel (RBC triage, RCA method, DI gate) | qa_head |
| FR-05.5 | Management Review dashboard (On-time CAPA closure, repeat observation rate, DI exceptions) | qa_head, super_admin |
| FR-05.6 | Risk Signals Over Time trend chart | All |
| FR-05.7 | Optional: CAPA effectiveness score, recurring deviation clusters, RCA weakness heatmap | qa_head |

### FR-06: CSV/CSA & Systems Risk

| ID | Requirement | Roles |
|---|---|---|
| FR-06.1 | System Inventory table (Name, Type, GxP relevance, Part 11/Annex 11 status, Risk Level, Validation Status) | csv_val_lead, it_cdo, super_admin |
| FR-06.2 | Filters by criticality, validation state, vendor type | csv_val_lead, it_cdo |
| FR-06.3 | System Detail view (Overview, Risk & Controls, Validation, DI & Audit Trail tabs) | csv_val_lead, it_cdo |
| FR-06.4 | CSV Roadmap timeline (validation/CSA activities by system) | csv_val_lead, super_admin |
| FR-06.5 | Optional: validation debt dashboard, periodic review tracker, revalidation trigger alerts, traceability graph | csv_val_lead |

### FR-07: Glimmora AGI & Autonomy Console

| ID | Requirement | Roles |
|---|---|---|
| FR-07.1 | KPI cards: AI Insights Generated, Actions Triggered, HITL Approvals, Drift Alerts | it_cdo, super_admin |
| FR-07.2 | AGI Capability tiles (Monitoring, Risk Prioritization, Readiness Orchestration, Drift Detection) | it_cdo, super_admin |
| FR-07.3 | Intended Use & Boundaries table (Name, GxP Category, Assisted vs Autonomous, Allowed/Prohibited) | it_cdo, super_admin |
| FR-07.4 | Human Oversight Model diagram (HITL gates) | super_admin |
| FR-07.5 | Role-to-approval mapping table | super_admin |
| FR-07.6 | Drift monitoring chart (model performance over time) | it_cdo, super_admin |
| FR-07.7 | Alerts table (drift events, action, owner, status) | it_cdo, super_admin |
| FR-07.8 | Optional: Agent Registry, Prompt Version Control, Model Release Governance, Confidence Thresholds | super_admin |

### FR-08: Evidence & Document Workspace

| ID | Requirement | Roles |
|---|---|---|
| FR-08.1 | Search with facets (Area, Document Type, System, Date) | All |
| FR-08.2 | Grid/list view with compliance tags | All |
| FR-08.3 | Evidence Pack Builder (multi-select, preview, metadata) | qa_head, csv_val_lead, super_admin |

### FR-09: FDA 483 / Warning Letter Support

| ID | Requirement | Roles |
|---|---|---|
| FR-09.1 | Event card view (483, WL, EMA/MHRA observations) | regulatory_affairs, qa_head, super_admin |
| FR-09.2 | Per-event: summary, due dates, commitments, CAPA sets, response drafts | regulatory_affairs, qa_head |
| FR-09.3 | RCA workspace (5-Why, Fishbone templates) | qa_head, regulatory_affairs |

### FR-10: Governance & KPIs

| ID | Requirement | Roles |
|---|---|---|
| FR-10.1 | KPIs & Scorecards tab (CAPA timeliness, training, CSV drift, DI exceptions) | All |
| FR-10.2 | RAID log table (filter, status) | qa_head, super_admin, operations_head |
| FR-10.3 | Reports & Exports tab | All |

### FR-11: Settings & Admin

| ID | Requirement | Roles |
|---|---|---|
| FR-11.1 | Tenant & Site Settings (metadata, regulatory scope, timezone, date formats) | super_admin |
| FR-11.2 | Users & Roles management (role chips, GxP access flags) | super_admin |
| FR-11.3 | Regulatory Framework Toggles (21 CFR 210/211, Part 11, Annex 11/15, ICH Q9/Q10, WHO GMP) | super_admin |
| FR-11.4 | AGI Policy (Assisted vs Autonomous toggles per domain, logging levels, retention, privacy) | super_admin, it_cdo |
| FR-11.5 | Agent-by-agent enablement, confidence thresholds, escalation rules | super_admin |

---

## Non-Functional Requirements

### NFR-01: Security & Access Control
- RBAC enforced at application and data layers
- Keycloak IAM with SSO and enterprise directory integration
- TLS everywhere, OWASP-aligned security
- Least-privilege access model
- Secrets management (HashiCorp Vault optional)

### NFR-02: Audit Trail & Compliance
- Append-only / immutable audit trail for all create/update/approve/sign events
- E-signature support (Part 11/Annex 11): signer identity, intent, timestamp, content hash
- NTP time synchronization
- Evidence pack generation with hashing, versioning, metadata
- Audit logging of all AI interactions involving GxP records

### NFR-03: Data Governance
- Data minimization — only required compliance signals processed
- Segregation of regulated data from non-GxP datasets
- Encryption in transit and at rest
- Retention policies aligned with regulatory requirements
- No personal health data unless explicitly configured

### NFR-04: AI Governance
- Human-in-the-loop gates for all GxP-affecting outputs
- Explainability (sources, reasoning, confidence, timestamps)
- Immutable audit trail for AGI prompts/outputs/dispositions
- Change control for model/prompt logic updates
- Bias monitoring, drift detection, periodic performance review
- Model lifecycle governance (DEV/UAT/PROD promotion)

### NFR-05: Architecture
- Separation between operational systems of record and analytics/AI layers
- API-first design
- Validation-friendly SDLC
- 12-column grid layout, max 1440px content width
- Left sidebar navigation (64-80px collapsed, 240-280px expanded)
- Optional right context rail (320px)

### NFR-06: Regulatory Compliance Checklist
The platform must support compliance validation against:
- **21 CFR Part 210** — cGMP general provisions, definitions reflected in master data/SOPs/config
- **21 CFR Part 211** — Controls for org, personnel, facilities, equipment, production, lab, records
- **21 CFR Part 11** — Electronic records trustworthy/reliable, e-signatures unique/identity-verified/bound
- **EU GMP Annex 11** — Validated computerized systems, system inventory, roles, vendor management
- **EU GMP Annex 15** — VMP, IQ/OQ/PQ protocols, change control, deviation management
- **ICH Q9** — Science/risk-based approach, scale effort to risk level
- **ICH Q10** — Integrated PQS, continual improvement, management review
- **WHO GMP** — Process/equipment/utility/cleaning/analytical validation, documentation/traceability

---

## Client Dependencies & Assumptions

### Client Must Provide:
- Documents, system inventories, SOPs, validation records, audit reports (within 48h of kickoff)
- SME availability during workshops/interviews/mock inspections (Week 1)
- Facility/lab/digital system access for walkthroughs
- Client Engagement Lead empowered for operational decisions

### System Access Required (read-only):
- QMS platforms
- LIMS / CDS environments
- ERP systems (GMP processes)
- Training management systems
- Document management systems
- MES / eBR / manufacturing execution (for blueprint)
- Environmental monitoring, CMMS, supplier quality tools (for blueprint)

### Data Required:
- Audit trail samples, CAPA histories, deviation trends
- Training records, supplier qualification records
- Batch metadata, OOS/OOT history, validation inventories
- Change control histories, supplier event histories, inspection findings history
