# SOW Screens — Figma Blueprint Reference

> All screens mapped from Section 18 of the SOW

---

## Global UX Structure

- **App Shell:** Left sidebar + Top header + Main content + Optional right context rail
- **Sidebar:** 64-80px collapsed / 240-280px expanded
- **Header:** 48-64px with environment tag (DEV/UAT/PROD), search, notifications, profile
- **Content:** Max 1440px, 12-column grid, 24px gutters
- **Context Rail:** 320px (details, comments, AI side panel)

### Sidebar Navigation (maps 1:1 to SOW sections)

| # | Section | SOW Reference |
|---|---|---|
| 1 | Overview | Executive Dashboard |
| 2 | Inspection Readiness | Section 5.1-5.3 |
| 3 | GxP/GMP Gaps & Findings | Section 5.1 |
| 4 | QMS & CAPA | Section 7 |
| 5 | CSV/CSA & Systems | Section 8 |
| 6 | Glimmora AGI & Autonomy | Section 9 |
| 7 | Evidence & Documents | Evidence Index |
| 8 | Governance & KPIs | Section 11 |
| 9 | FDA 483 / WL Support | Section 6 |
| 10 | Settings & Admin | Section 12 (Figma) |

**Optional expanded nav items:** Pharma Operations Intelligence, Batch Readiness, Lab Integrity, Supplier Quality, Validation Intelligence, Regulatory Intelligence, Digital Twins, Command Center, Value & ROI Analytics

---

## Screen 1 — Login & Workspace Selection

### Sign In
- Brand logo + "Glimmora - GxP Compliance Command Center"
- Email / Password fields
- "Sign in with SSO" button (OIDC/OAuth2)
- Environment picker (region/tenant)
- Legal links: Terms, Privacy, Data Processing

### Organization / Site Selection Modal
- Card list of client sites (e.g., "Site A - Oral Solids", "Site B - Biologics")
- Tags: Country, GMP scope, risk level
- Optional: multi-site network view, product-family grouping, enterprise/region/plant selection

---

## Screen 2 — Executive Overview Dashboard

### Layout: Hero summary top, multi-card grid, chart + table region

**KPI Cards (top row, 4-5):**
- Overall Readiness Score (0-100, color-coded)
- Critical GxP Open Findings
- CAPA Overdue (%) and count
- CSV High Risk Systems (open actions)
- Training Compliance (%)

**Heatmap:** Area vs Readiness (Manufacturing, QC Lab, Warehouse, Utilities, QMS, CSV/IT) — Red/Amber/Green

**Chart:** Observation Volume & Severity by Month (stacked bar/line — Critical/Major/Minor)

**90-Day Action Plan Table:** Priority | Area | Action | Owner | Due Date | Status | AGI Suggested Risk — row chips link to modules

**Context Rail:** AGI Insight panel, filters (timeframe, site, severity)

**Optional Enterprise Cards:** Batch Readiness Risk, Supplier Quality Risk, Validation Debt, Regulatory Heat Index, COPQ, Cross-Site Benchmark

---

## Screen 3 — Inspection Readiness Program

### Tabs: Roadmap | Governance | Playbooks | Training

**Roadmap:** Swimlane view (People, Process, Data, Systems, Documentation) x time buckets (0-30d, 31-60d, 61-90d). Cards: action, owner, AGI risk score.

**Governance:** RACI diagram (War Room), front-room/back-room flow diagram, escalation paths, daily touchpoints.

**Playbooks:** List table (Front room, Back room, SMEs, DIL handling). Detail: 2-column (steps + attachments).

**Training:** Calendar view (sessions), Training matrix (Roles x Modules x Status), "Launch Simulation" button.

---

## Screen 4 — GxP/GMP Gap Assessment & Findings

**Filters Bar:** Site, Area, Framework, Severity, Status

**Summary Tiles:** Total Findings by Severity, Top 5 Risk Drivers

**Findings Register Table:** ID | Area | Requirement | Severity | Status | Owner | Target Date | Evidence Link. Row detail: requirement text, AGI summary, risk explanation, CAPA link suggestion.

**Evidence Index:** Tree/table hybrid. Nodes: area (Manufacturing, QC Lab, QMS, Systems). Under each: documents by type (SOP, Record, Audit Trail, Validation, Report). Evidence Pack Status chip (Complete/Partial/Missing).

---

## Screen 5 — QMS & CAPA Blueprint

**QMS Overview:** Process map (CAPA lifecycle, Deviation, Change Control, Complaints). Cards: "Target State Design" + "Current Gap" per step.

**CAPA Tracker:** Table (CAPA ID, Source, Risk, Owner, Due Date, Status, Effectiveness Check). Side panel: RBC triage, RCA method, DI gate.

**Management Review & Metrics:** KPI bar (On-time CAPA closure, repeat observation rate, DI exceptions). Trend chart: Risk Signals Over Time. Optional: CAPA effectiveness score, recurring deviation clusters, RCA weakness heatmap.

---

## Screen 6 — CSV/CSA & Systems Risk

**System Inventory:** Table (System name, Type, GxP relevance, Part 11/Annex 11 status, Risk Level, Validation Status). Filters: criticality, validation state, vendor type.

**System Detail:** Tabs (Overview, Risk & Controls, Validation, DI & Audit Trail). Shows: intended use, GxP scope, critical functions, risk factors, planned validation actions.

**CSV Roadmap:** Timeline component (validation/CSA activities by system). Optional: validation debt dashboard, periodic review tracker, revalidation triggers, traceability graph.

---

## Screen 7 — Glimmora AGI & Autonomy Console

**AGI Overview:** KPI cards (AI Insights Generated, Actions Triggered, HITL Approvals, Drift Alerts). Capability tiles (Monitoring, Risk Prioritization, Readiness Orchestration, Drift Detection).

**Intended Use & Boundaries:** Table (Name, GxP Category, Assisted vs Autonomous, Allowed Actions, Prohibited Scope).

**Human Oversight Model:** HITL gates diagram. Role-to-approval mapping table (QA, IT, RA, Leadership).

**Drift & Monitoring:** Performance/drift chart over time. Alerts table (drift events, action, owner, status).

**Optional Modules:** Agent Registry, Prompt Version Control, Model Release Governance, Confidence Thresholds, AI Validation Evidence Tracker.

---

## Screen 8 — Evidence & Document Workspace

- Search bar with facets (Area, Document Type, System, Date)
- Grid/list view with icons and compliance tags
- "Evidence Pack Builder" mode (multi-select, preview, metadata generation)
- Optional: digital twin-linked drilldown, cross-system lineage, DIL fulfillment board

---

## Screen 9 — FDA 483 / Warning Letter Support

- Card view of events (483, WL, EMA/MHRA observations)
- Per event: summary, due dates, commitments, CAPA sets, response drafts
- RCA workspace canvas (5-Why, Fishbone templates)
- Optional: enforcement trend library, regulatory hot spot mapping, response readiness score

---

## Screen 10 — Governance & KPIs

### Tabs: KPIs & Scorecards | RAID & Risks | Reports & Exports

**KPIs:** Multi-widget layout with dynamic charts (CAPA timeliness, training, CSV drift, DI exceptions)

**RAID:** Classic RAID log table with filter and status

**Optional Tabs:** Cross-Site Benchmarking, Supplier Quality, Batch Readiness, Validation Intelligence, ROI & Economics

---

## Screen 11 — Settings & Admin

**Tenant & Site Settings:** Site metadata, regulatory scope, timezone, date formats

**Users & Roles:** Users table with role chips and GxP access flags

**Regulatory Framework Toggles:** Checklist for 21 CFR Part 210/211, Part 11, EU Annex 11, Annex 15, ICH Q9/Q10, WHO GMP

**AGI Policy:** Assisted vs Autonomous toggles per domain (CAPA, CSV, Training), logging levels, retention, privacy. Agent-by-agent enablement, confidence thresholds, escalation rules, prompt version selection, twin scoring config.

---

## Design Tokens (Figma Hand-off)

| Token | Value |
|---|---|
| Colors | Compliance Green, Risk Amber, Critical Red, Info Blue, Neutral Greys |
| Typography | Inter (or similar), 12-32px scale |
| Components | Sidebar, top bar, cards, tables, chips, filter bars, tab sets, steppers, charts |
| Layout | Auto Layout on cards, rows, side panels (responsive) |
| Prototyping | Link navigation, modals, detail panels, HITL flows |
