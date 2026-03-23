# SOW Flows — Visual Architecture & Process Maps

> ASCII diagrams representing the key flows from SOW - GXP-GMP_V3.0

---

## 1. Platform High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GLIMMORA PHARMA PLATFORM                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     FRONTEND (React + TypeScript)                       │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │  │ Dashboard│ │Inspection│ │ QMS/CAPA │ │ CSV/CSA  │ │AGI Console   │ │ │
│  │  │ Overview │ │Readiness │ │ Module   │ │ Module   │ │& Autonomy    │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │  │ Evidence │ │ FDA 483  │ │Governance│ │ Settings │ │ Command      │ │ │
│  │  │ & Docs   │ │ /WL      │ │ & KPIs   │ │ & Admin  │ │ Center       │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                              ┌─────┴─────┐                                   │
│                              │  API Layer │  (NestJS / REST / GraphQL)        │
│                              └─────┬─────┘                                   │
│                    ┌───────────────┼───────────────┐                         │
│                    │               │               │                         │
│  ┌─────────────────┴──┐  ┌────────┴────────┐  ┌───┴──────────────────────┐  │
│  │   BACKEND SERVICES  │  │  AI/AGI LAYER   │  │  COMPLIANCE ENGINE       │  │
│  │                     │  │  (Python/FastAPI)│  │                          │  │
│  │  - Auth (Keycloak)  │  │                 │  │  - Audit Trail (immut.)  │  │
│  │  - BullMQ Jobs      │  │  - NLP/LLM Orch│  │  - E-Signatures          │  │
│  │  - OpenSearch       │  │  - Risk Scoring │  │  - Evidence Packs        │  │
│  │  - Workflow Engine  │  │  - Drift Detect │  │  - DI Controls           │  │
│  │                     │  │  - Agent Orch.  │  │  - Change Control        │  │
│  └─────────┬───────────┘  └────────┬────────┘  └────────────┬─────────────┘  │
│            │                       │                         │               │
│  ┌─────────┴───────────────────────┴─────────────────────────┴────────────┐  │
│  │                         DATA LAYER                                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐    │  │
│  │  │PostgreSQL│  │  MinIO   │  │  Redis   │  │  Compliance Graph   │    │  │
│  │  │(SoR/GxP) │  │(S3 Docs) │  │(Cache)   │  │  (Entity Fabric)    │    │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────┴────────┐  ┌────────┴────────┐  ┌─────────┴───────┐
     │  Source Systems  │  │  Source Systems  │  │  Source Systems  │
     │  QMS / eDMS /LMS│  │ LIMS/CDS/MES/ERP│  │ CMMS/EMS/Supplier│
     └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 2. Role-Based Access Flow

```
                              ┌──────────┐
                              │  LOGIN   │
                              │ Email/SSO│
                              └────┬─────┘
                                   │
                              ┌────┴─────┐
                              │  SELECT  │
                              │ ORG/SITE │
                              └────┬─────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │         RBAC ENGINE          │
                    │        (Keycloak)            │
                    └──────────────┬──────────────┘
                                   │
        ┌──────────┬──────────┬────┴────┬──────────┬──────────┬──────────┬──────────┐
        │          │          │         │          │          │          │          │
   ┌────┴────┐┌───┴────┐┌────┴───┐┌────┴───┐┌────┴────┐┌────┴───┐┌────┴────┐┌────┴───┐
   │ SUPER   ││  QA    ││ QC/Lab ││  REG   ││ CSV/Val ││ IT/CDO ││  OPS   ││VIEWER  │
   │ ADMIN   ││ HEAD   ││DIRECTOR││AFFAIRS ││  LEAD   ││        ││  HEAD  ││        │
   └────┬────┘└───┬────┘└────┬───┘└────┬───┘└────┬────┘└───┬────┘└────┬───┘└───┬────┘
        │         │          │         │         │         │          │        │
        │  ALL    │ QMS/CAPA │ Lab/DI  │ 483/WL  │ CSV/CSA │ AGI/Sys │ Site   │READ
        │ ACCESS  │ Batch    │ OOS/OOT │ Commit  │ Valid.  │ AI Gov  │ Perf.  │ONLY
        │ + Admin │ Approval │ Instrum │ Response│ Part 11 │ Security│ Mfg    │
        │ + AGI   │ Mgmt Rev │ QC Comp │ Agency  │ Annex11 │ Arch    │ Ops    │
        │ Policy  │ Evidence │         │ Enforce │ Roadmap │         │        │
        └─────────┴──────────┴─────────┴─────────┴─────────┴─────────┴────────┘
```

---

## 3. Three-Week Sprint Timeline

```
 WEEK 1                          WEEK 2                          WEEK 3
 Discovery & Gap Assessment      Readiness & Blueprinting        Training & AGI Blueprint
 ───────────────────────────     ───────────────────────────     ───────────────────────────

 ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
 │ Kickoff Workshop        │    │ Finalize Findings       │    │ Training & Simulations  │
 │   - Scope & boundaries  │    │   - Map to regulations  │    │   - QA/QC behaviors     │
 │   - Roles confirmed     │    │   - DI expectations     │    │   - SME mock Q&A        │
 │   - Comms agreed        │    │                         │    │   - Leadership briefing  │
 ├─────────────────────────┤    ├─────────────────────────┤    ├─────────────────────────┤
 │ Document Review         │    │ Inspection Readiness    │    │ Refine Artifacts        │
 │   - Quality Manual      │    │   - Roadmap design      │    │   - Based on simulation │
 │   - SOPs, audits        │    │   - Governance model    │    │     feedback             │
 │   - Training matrices   │    │   - DIL/data readiness  │    │                         │
 │   - System inventory    │    │                         │    │                         │
 ├─────────────────────────┤    ├─────────────────────────┤    ├─────────────────────────┤
 │ Walkthroughs            │    │ Playbooks & Templates   │    │ Executive Governance    │
 │   - Manufacturing       │    │   - Front/back room     │    │   - KPIs defined        │
 │   - QC Lab              │    │   - DIL templates       │    │   - Heatmaps/scorecards │
 │   - Warehouse/Utilities │    │   - CAPA trackers       │    │   - Reporting templates │
 ├─────────────────────────┤    ├─────────────────────────┤    ├─────────────────────────┤
 │ Mock Inspection         │    │ QMS/CAPA Blueprint      │    │ AGI Blueprint Delivery  │
 │   - Front/back room     │    │   - CAPA lifecycle      │    │   - Capability map      │
 │   - SME coaching        │    │   - Risk triage rules   │    │   - Intended use stmts  │
 │   - Commitment logging  │    │   - Mgmt review design  │    │   - Risk classification │
 ├─────────────────────────┤    ├─────────────────────────┤    │   - HITL oversight      │
 │ Risk Classification     │    │ CSV/CSA Roadmap         │    │   - Drift concept       │
 │   - Critical/Major/Minor│    │   - System risk ranking │    │   - AI validation       │
 │   - Evidence indexing   │    │   - Part 11/Annex 11    │    ├─────────────────────────┤
 └────────────┬────────────┘    └────────────┬────────────┘    │ Final Pack              │
              │                              │                 │   - 90-day action plan  │
              ▼                              ▼                 │   - All deliverables    │
 ┌─────────────────────────┐    ┌─────────────────────────┐    │   - Digital twin arch   │
 │ DELIVERABLES:           │    │ DELIVERABLES:           │    │   - Command center      │
 │ - Draft Gap Assessment  │    │ - Final Gap Assessment  │    │   - Risk & ROI metrics  │
 │ - Draft Findings Reg.   │    │ - Readiness Plan        │    └─────────────────────────┘
 │ - Mock Inspection Rpt   │    │ - Playbooks/Templates   │
 │ - Readiness Scorecard   │    │ - QMS/CAPA Blueprint    │
 │ - Leadership Debrief    │    │ - CSV/CSA Risk Register │
 └─────────────────────────┘    │ - Platform Capability   │
                                │ - Data Model Concept    │
                                └─────────────────────────┘
```

---

## 4. AGI — Assisted vs Autonomous Decision Flow

```
                         ┌────────────────────┐
                         │   COMPLIANCE SIGNAL │
                         │   (from any source) │
                         └─────────┬──────────┘
                                   │
                         ┌─────────┴──────────┐
                         │  GLIMMORA AI/AGI    │
                         │  PROCESSING LAYER   │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
           ┌────────┴────────┐          ┌─────────┴────────┐
           │   AUTONOMOUS    │          │    ASSISTED       │
           │   (Controlled)  │          │ (Decision Support)│
           └────────┬────────┘          └─────────┬────────┘
                    │                             │
     ┌──────────────┼──────────────┐              │
     │              │              │              │
┌────┴─────┐ ┌─────┴────┐ ┌──────┴───┐   ┌──────┴──────────┐
│ Monitor  │ │Prioritize│ │Orchestr. │   │ Summarize       │
│ & Flag   │ │ & Score  │ │ & Alert  │   │ Classify        │
│          │ │          │ │          │   │ Recommend       │
│ -CAPA age│ │ -ICH Q9  │ │ -Evid.   │   │ Draft           │
│ -Overdue │ │  scoring │ │  kits    │   │ Explain         │
│ -Training│ │ -Patient │ │ -DIL     │   │                 │
│ -DI excep│ │  safety  │ │  drills  │   │ (with sources,  │
│ -Drift   │ │ -Quality │ │ -SME     │   │  confidence,    │
│          │ │ -Recurr. │ │  mapping │   │  timestamps)    │
└────┬─────┘ └─────┬────┘ └──────┬───┘   └──────┬──────────┘
     │              │              │              │
     └──────────────┴──────┬───────┘              │
                           │                      │
                   ┌───────┴───────┐      ┌───────┴───────┐
                   │  AUTO-ACTION  │      │   HITL GATE   │
                   │  (within      │      │   (Human      │
                   │   guardrails) │      │    Review     │
                   └───────┬───────┘      │    Required)  │
                           │              └───────┬───────┘
                           │                      │
                           │              ┌───────┴───────┐
                           │              │ HUMAN DECIDES  │
                           │              │ QA/QP/RA etc.  │
                           │              └───────┬───────┘
                           │                      │
                    ┌──────┴──────────────────────┴──────┐
                    │         IMMUTABLE AUDIT TRAIL       │
                    │  (who, what, when, why, data used)  │
                    └────────────────────────────────────┘

     ╔══════════════════════════════════════════════════╗
     ║        EXPLICITLY PROHIBITED (NEVER AUTO)        ║
     ║  ✗ Batch disposition / QP release                ║
     ║  ✗ Final QA disposition decisions                ║
     ║  ✗ CAPA closure without QA approval              ║
     ║  ✗ External regulator communications             ║
     ║  ✗ Unsupervised learning on production GxP data  ║
     ╚══════════════════════════════════════════════════╝
```

---

## 5. Digital Twin Architecture

```
                    ┌──────────────────────────────────┐
                    │       DIGITAL TWIN LAYER          │
                    │      (Compliance State Model)     │
                    └──────────────┬───────────────────┘
                                   │
     ┌─────────┬─────────┬─────────┼─────────┬─────────┬─────────┐
     │         │         │         │         │         │         │
┌────┴───┐┌───┴────┐┌───┴────┐┌───┴────┐┌───┴────┐┌───┴────┐┌───┴────┐
│ SITE   ││ BATCH  ││  LAB   ││VALIDAT.││SUPPLIER││TRAINING││INSPECT.│
│COMPLI- ││ RISK   ││INTEGR. ││        ││QUALITY ││COMPLI- ││READINE.│
│ANCE    ││        ││        ││        ││        ││ANCE    ││        │
│ TWIN   ││ TWIN   ││ TWIN   ││ TWIN   ││ TWIN   ││ TWIN   ││ TWIN   │
└───┬────┘└───┬────┘└───┬────┘└───┬────┘└───┬────┘└───┬────┘└───┬────┘
    │         │         │         │         │         │         │
    └─────────┴─────────┴────┬────┴─────────┴─────────┴─────────┘
                             │
              ┌──────────────┴──────────────┐
              │      SCORING ENGINE          │
              │                              │
              │  Dimensions:                 │
              │  - Patient safety risk       │
              │  - Product quality impact    │
              │  - DI risk                   │
              │  - Recurrence risk           │
              │  - Inspection exposure       │
              │  - Supplier continuity       │
              │  - Validation state risk     │
              │  - Training sufficiency      │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │       SIGNAL SOURCES         │
              │                              │
              │  ┌─────┐ ┌─────┐ ┌─────┐    │
              │  │ QMS │ │LIMS │ │ MES │    │
              │  └─────┘ └─────┘ └─────┘    │
              │  ┌─────┐ ┌─────┐ ┌─────┐    │
              │  │ ERP │ │eDMS │ │ LMS │    │
              │  └─────┘ └─────┘ └─────┘    │
              │  ┌─────┐ ┌─────┐ ┌─────┐    │
              │  │CMMS │ │EMS/ │ │Suppl│    │
              │  │     │ │BMS  │ │ Qual│    │
              │  └─────┘ └─────┘ └─────┘    │
              └─────────────────────────────┘
```

---

## 6. Enterprise Compliance Data Fabric (Entity Graph)

```
                                    ┌──────────┐
                           ┌────────│   SITE   │────────┐
                           │        └────┬─────┘        │
                           │             │              │
                      ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
                      │EQUIPMENT│   │  BATCH  │   │ PRODUCT │
                      └────┬────┘   └────┬────┘   │ FAMILY  │
                           │             │        └─────────┘
              ┌────────────┤        ┌────┴────────────┐
              │            │        │                  │
         ┌────┴─────┐┌────┴────┐ ┌─┴──────┐    ┌─────┴────┐
         │QUALIFIC. ││MAINTEN. │ │MATERIAL│    │DEVIATION │
         │          ││CALIBRAT.│ └────┬───┘    └────┬─────┘
         └──────────┘└─────────┘      │             │
                                      │        ┌────┴────┐
                                 ┌────┴────┐   │  CAPA   │
                                 │SUPPLIER │   └────┬────┘
                                 └─────────┘        │
                                               ┌────┴────────┐
                                               │             │
                                          ┌────┴────┐  ┌─────┴────┐
                                          │   SOP   │  │INSPECTION│
                                          └────┬────┘  └────┬─────┘
                                               │            │
                                          ┌────┴────┐  ┌────┴──────┐
                                          │TRAINING │  │COMMITMENT │
                                          └────┬────┘  └───────────┘
                                               │
                                          ┌────┴────┐
                                          │  USER   │
                                          └─────────┘

  ADDITIONAL ENTITIES:
  method ── instrument ── environment/monitoring event
  change control ── validation asset ── audit trail event ── quality event
```

---

## 7. Autonomous Agent Orchestration

```
                         ┌──────────────────────┐
                         │   ORCHESTRATOR        │
                         │   (Agent Controller)  │
                         │                       │
                         │   Rules + Risk Logic  │
                         │   Guardrails Engine   │
                         └──────────┬───────────┘
                                    │
          ┌────────┬────────┬───────┼───────┬────────┬────────┬────────┐
          │        │        │       │       │        │        │        │
     ┌────┴──┐┌───┴───┐┌───┴──┐┌───┴──┐┌───┴──┐┌───┴───┐┌───┴──┐┌───┴──┐
     │DEVIAT.││ CAPA  ││VALID.││TRAIN.││SUPPL.││LAB    ││REG.  ││INSP. │
     │AGENT  ││ AGENT ││AGENT ││AGENT ││AGENT ││INTEG. ││INTEL.││AGENT │
     │       ││       ││      ││      ││      ││AGENT  ││AGENT ││      │
     │Recur- ││Effect.││Change││Role  ││Vendor││DI     ││Guide.││Simul.│
     │rence  ││Monit. ││Impact││Qual. ││Qual. ││Surv.  ││Monit.││      │
     └───┬───┘└───┬───┘└──┬───┘└──┬───┘└──┬───┘└───┬───┘└──┬───┘└──┬───┘
         │        │       │       │       │        │       │       │
         └────────┴───────┴───┬───┴───────┴────────┴───────┴───────┘
                              │
                     ┌────────┴────────┐
                     │  HITL APPROVAL  │
                     │  GATES          │
                     │  (per Section   │
                     │   9.4 controls) │
                     └────────┬────────┘
                              │
                     ┌────────┴────────┐
                     │ AUDIT TRAIL     │
                     │ (immutable log) │
                     └─────────────────┘

  OPTIONAL AGENTS:
  ┌──────────────┐ ┌────────────────┐ ┌───────────────┐ ┌──────────────┐
  │Batch Readines│ │Mfg Intelligence│ │Data Integrity │ │Quality Risk  │
  │Agent         │ │Agent           │ │Agent          │ │Forecast Agent│
  └──────────────┘ └────────────────┘ └───────────────┘ └──────────────┘
```

---

## 8. Screen Navigation Flow

```
                              ┌─────────┐
                              │  LOGIN  │
                              └────┬────┘
                                   │
                              ┌────┴────┐
                              │  SITE   │
                              │ SELECT  │
                              └────┬────┘
                                   │
                    ┌──────────────┴──────────────────┐
                    │         SIDEBAR NAV              │
                    └──────────────┬──────────────────┘
                                   │
     ┌────────┬────────┬───────────┼───────────┬────────┬────────┬────────┐
     │        │        │           │           │        │        │        │
 ┌───┴──┐┌───┴──┐┌────┴───┐ ┌─────┴────┐ ┌────┴──┐┌───┴──┐┌───┴──┐┌───┴──┐
 │Over- ││Insp. ││GxP Gap ││QMS/CAPA  ││CSV/CSA││AGI   ││Evid. ││483/WL│
 │view  ││Ready.││& Find. ││Blueprint ││& Sys. ││Consol││& Docs││Suppt.│
 │Dash  ││      ││        ││          ││       ││      ││      ││      │
 └──┬───┘└──┬───┘└───┬────┘└────┬─────┘└──┬────┘└──┬───┘└──┬───┘└──┬───┘
    │       │        │          │         │        │       │       │
    │  ┌────┴────┐   │    ┌─────┴────┐    │   ┌────┴───┐   │  ┌────┴───┐
    │  │Roadmap  │   │    │CAPA Track│    │   │Intended│   │  │RCA     │
    │  │Govern.  │   │    │QMS Map   │    │   │Use     │   │  │Canvas  │
    │  │Playbook │   │    │Mgmt Rev  │    │   │HITL    │   │  │Commit  │
    │  │Training │   │    │          │    │   │Drift   │   │  │Matrix  │
    │  └─────────┘   │    └──────────┘    │   └────────┘   │  └────────┘
    │                │                    │                │
    │           ┌────┴───┐          ┌─────┴────┐     ┌─────┴────┐
    │           │Findings│          │Sys Detail│     │Pack      │
    │           │Register│          │CSV Road. │     │Builder   │
    │           │Evidence│          └──────────┘     └──────────┘
    │           │Index   │
    │           └────────┘
    │
    └──────────────┬──────────────┐
              ┌────┴───┐    ┌─────┴────┐
              │Govern. │    │Settings  │
              │& KPIs  │    │& Admin   │
              │        │    │          │
              │Scores  │    │Tenant    │
              │RAID    │    │Users     │
              │Reports │    │Reg. Frmwk│
              └────────┘    │AGI Policy│
                            └──────────┘
```

---

## 9. CAPA Lifecycle Flow

```
  ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
  │  TRIGGER   │────▶│  INTAKE &  │────▶│    RCA     │────▶│   ACTION   │
  │            │     │   TRIAGE   │     │            │     │   PLAN     │
  │ -Deviation │     │            │     │ -5-Why     │     │            │
  │ -483/WL    │     │ -Risk rank │     │ -Fishbone  │     │ -Assign    │
  │ -Audit     │     │ -Classify  │     │ -Fault tree│     │ -Schedule  │
  │ -OOS/OOT   │     │ -DI gate   │     │ -Barrier   │     │ -Track     │
  │ -Complaint │     │            │     │  analysis  │     │            │
  └────────────┘     └────────────┘     └────────────┘     └─────┬──────┘
                                                                  │
  ┌────────────┐     ┌────────────┐     ┌────────────┐           │
  │  CLOSURE   │◀────│EFFECTIVE-  │◀────│ IMPLEMENT  │◀──────────┘
  │            │     │NESS CHECK  │     │            │
  │ -QA review │     │            │     │ -Execute   │
  │ -Evidence  │     │ -Verify    │     │ -Document  │
  │ -Sign-off  │     │ -Recurrence│     │ -Evidence  │
  │ (HITL req.)│     │  monitor   │     │            │
  └────────────┘     └────────────┘     └────────────┘

  AGI SUPPORT AT EACH STAGE:
  ┌──────────────────────────────────────────────────────────┐
  │ Trigger    → Autonomous detection & flagging              │
  │ Triage     → Risk scoring & prioritization                │
  │ RCA        → Pattern matching & root cause suggestions    │
  │ Action     → Template generation & scheduling             │
  │ Implement  → Progress monitoring & overdue alerts         │
  │ Effective. → Recurrence monitoring & weak RCA detection   │
  │ Closure    → Evidence completeness check (HUMAN APPROVES) │
  └──────────────────────────────────────────────────────────┘
```

---

## 10. Batch Review & Release Flow

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                     BATCH SIGNALS                                │
  │                                                                  │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │  │  Batch   │ │Deviations│ │  Env.    │ │ Training │           │
  │  │  Record  │ │(resolved?│ │Monitoring│ │Compliance│           │
  │  │Completene│ │)         │ │Correlat. │ │Verified? │           │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
  │       │            │            │            │                  │
  │       └────────────┴──────┬─────┴────────────┘                  │
  │                           │                                     │
  │                    ┌──────┴──────┐                               │
  │                    │ Equipment   │                               │
  │                    │Qualification│                               │
  │                    │ Verified?   │                               │
  │                    └──────┬──────┘                               │
  └───────────────────────────┼─────────────────────────────────────┘
                              │
                     ┌────────┴────────┐
                     │  BATCH RELEASE  │
                     │  READINESS      │
                     │  SCORE          │
                     │  (0-100)        │
                     └────────┬────────┘
                              │
                     ┌────────┴────────┐
                     │  QA / QP        │
                     │  HUMAN REVIEW   │ ◀── FINAL DECISION IS ALWAYS HUMAN
                     │  & DISPOSITION  │
                     └────────┬────────┘
                              │
                   ┌──────────┴──────────┐
                   │                     │
              ┌────┴─────┐         ┌─────┴────┐
              │ APPROVED │         │ REJECTED │
              │ (Release)│         │ (Hold)   │
              └──────────┘         └──────────┘
```

---

## 11. Multi-Site Command Center View

```
  ┌──────────────────────────────────────────────────────────────┐
  │                ENTERPRISE COMMAND CENTER                      │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │              GLOBAL QUALITY COUNCIL VIEW                │  │
  │  └────────────────────────┬───────────────────────────────┘  │
  │                           │                                  │
  │     ┌─────────────────────┼─────────────────────┐            │
  │     │                     │                     │            │
  │  ┌──┴──────────┐  ┌──────┴──────┐  ┌───────────┴──┐         │
  │  │  SITE A     │  │  SITE B     │  │  SITE C      │         │
  │  │  Oral Solids│  │  Biologics  │  │  Sterile Mfg │         │
  │  │             │  │             │  │              │         │
  │  │ Ready: 78%  │  │ Ready: 62%  │  │ Ready: 85%   │         │
  │  │ CAPAs: 12   │  │ CAPAs: 23   │  │ CAPAs: 8     │         │
  │  │ DI Risk: Lo │  │ DI Risk: Hi │  │ DI Risk: Med │         │
  │  └─────────────┘  └─────────────┘  └──────────────┘         │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ CROSS-SITE ANALYTICS                                    │  │
  │  │                                                         │  │
  │  │ - Deviation trend comparison                            │  │
  │  │ - CAPA backlog benchmarking                             │  │
  │  │ - Supplier risk (network-wide)                          │  │
  │  │ - Inspection risk comparison                            │  │
  │  │ - Harmonization tracking                                │  │
  │  │ - Recurring finding memory across sites                 │  │
  │  │ - Enterprise compliance heatmaps                        │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ QUALITY ECONOMICS                                       │  │
  │  │                                                         │  │
  │  │ Cost of Poor Quality  │  Batch Delay Cost  │  CAPA ROI  │  │
  │  │ Supplier Leakage      │  Validation Debt   │  Risk $    │  │
  │  └────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
```

---

## 12. Data Flow: Source Systems → Platform → Outputs

```
  SOURCE SYSTEMS                    PLATFORM                      OUTPUTS
  ══════════════                    ════════                      ═══════

  ┌─────────┐                                                ┌─────────────┐
  │  QMS    │──┐                                             │ Dashboards  │
  └─────────┘  │                                             │ & KPIs      │
  ┌─────────┐  │    ┌────────────┐    ┌──────────────┐       └─────────────┘
  │  LIMS   │──┤    │ Integration│    │  Compliance  │       ┌─────────────┐
  └─────────┘  ├───▶│ Layer      │───▶│  Graph /     │──────▶│ Risk Scores │
  ┌─────────┐  │    │ (API/Event)│    │  Data Fabric │       │ & Heatmaps  │
  │  MES    │──┤    └────────────┘    └──────┬───────┘       └─────────────┘
  └─────────┘  │                             │               ┌─────────────┐
  ┌─────────┐  │                      ┌──────┴───────┐       │ Digital     │
  │  ERP    │──┤                      │  AI/AGI      │──────▶│ Twin Scores │
  └─────────┘  │                      │  Processing  │       └─────────────┘
  ┌─────────┐  │                      └──────┬───────┘       ┌─────────────┐
  │  eDMS   │──┤                             │               │ Evidence    │
  └─────────┘  │                      ┌──────┴───────┐       │ Packs       │
  ┌─────────┐  │                      │  Agent       │──────▶└─────────────┘
  │  LMS    │──┤                      │  Orchestrat. │       ┌─────────────┐
  └─────────┘  │                      └──────────────┘       │ Alerts &    │
  ┌─────────┐  │                                             │ Escalations │
  │  CDS    │──┤                                             └─────────────┘
  └─────────┘  │                                             ┌─────────────┐
  ┌─────────┐  │                                             │ Regulatory  │
  │  CMMS   │──┤                                             │ Reports     │
  └─────────┘  │                                             └─────────────┘
  ┌─────────┐  │                                             ┌─────────────┐
  │ EMS/BMS │──┤                                             │ Audit Trail │
  └─────────┘  │                                             │ (Immutable) │
  ┌─────────┐  │                                             └─────────────┘
  │Supplier │──┘
  │Quality  │
  └─────────┘
```

---

## 13. Regulatory Framework Coverage Map

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    REGULATORY FRAMEWORK COVERAGE                        │
  │                                                                         │
  │    Module               Frameworks Applied                              │
  │    ──────               ──────────────────                              │
  │                                                                         │
  │    Manufacturing  ◄───  21 CFR 210/211, EU GMP, WHO GMP, ICH Q10       │
  │                                                                         │
  │    QC / Lab       ◄───  21 CFR 211, ALCOA+, ICH Q9                     │
  │                                                                         │
  │    QMS / CAPA     ◄───  ICH Q9, ICH Q10, 21 CFR 211                    │
  │                                                                         │
  │    CSV / CSA      ◄───  21 CFR Part 11, EU Annex 11, GAMP 5            │
  │                                                                         │
  │    Validation     ◄───  EU Annex 15, GAMP 5, 21 CFR Part 11            │
  │                                                                         │
  │    Data Integrity ◄───  ALCOA+, 21 CFR Part 11, EU Annex 11            │
  │                                                                         │
  │    AI / AGI       ◄───  ICH Q9 (risk-based), GAMP 5 (validation),      │
  │                         21 CFR Part 11 (audit trail), ICH Q10 (PQS)    │
  │                                                                         │
  │    Training       ◄───  21 CFR 211, EU GMP, WHO GMP                    │
  │                                                                         │
  │    Supplier       ◄───  ICH Q10, 21 CFR 211, EU GMP                    │
  └─────────────────────────────────────────────────────────────────────────┘
```
