import { useState } from "react";
import { CheckSquare, BookOpen, GraduationCap, Users, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

const ROADMAP: Record<string, { immediate: string[]; mid: string[]; long: string[] }> = {
  People: {
    immediate: ["Appoint front-room lead and back-room coordinator", "Identify SMEs per functional area", "Complete SME coaching sessions (mock Q&A)"],
    mid: ["GMP refresher training — 32 staff Mumbai site", "Leadership briefing on inspection posture", "DI awareness session for all QC analysts"],
    long: ["Annual mock inspection exercise", "Simulation-based readiness assessment", "Role-specific inspection behavior training"],
  },
  Process: {
    immediate: ["Finalise front-room/back-room process flow", "Establish daily inspection status meeting cadence", "Draft commitment matrix template"],
    mid: ["Update CAPA intake process with DI gate checks", "Revise OOS/OOT SOP — align to USP <1010>", "Implement deviation categorisation scheme"],
    long: ["Embed QRM (ICH Q9) into deviation triage", "Launch management review cadence with DI KPIs", "Establish CAPA effectiveness review cycle"],
  },
  Data: {
    immediate: ["Audit trail remediation — LIMS v3.1 (CAPA-0042)", "Evidence kit assembly for likely DIL requests", "Data integrity gap register update"],
    mid: ["Retrospective audit trail review (Dec 2025 – Mar 2026)", "Hybrid record inventory and risk ranking", "Backup/restore test for all Part 11 systems"],
    long: ["DI continuous monitoring programme", "Cross-system audit trail coverage report", "Supplier data integrity oversight programme"],
  },
  Systems: {
    immediate: ["HPLC IQ/OQ completion (CAPA-0041)", "LIMS configuration verification post-remediation", "CSV system risk register update"],
    mid: ["ERP GMP module validation scope definition", "Periodic review schedule for all critical systems", "Part 11/Annex 11 gap remediation roadmap"],
    long: ["MES eBR module IQ/OQ/PQ", "Enterprise integration traceability map", "Validation debt dashboard implementation"],
  },
  Documentation: {
    immediate: ["Evidence index finalised per area", "SOP currency check — identify overdue reviews", "Batch record template revision"],
    mid: ["Quality Manual update — include DI section", "Inspection playbooks finalised (front/back room, SME)", "Opening/closing meeting deck templates"],
    long: ["SOP harmonisation across sites", "Document management periodic review cycle", "Annual evidence pack readiness drill"],
  },
};

const PLAYBOOKS = [
  {
    name: "Front Room Playbook",
    description: "Roles, behaviours, document handling and response rules for the front room during regulatory inspection.",
    steps: [
      "Brief investigators — welcome, introductions, scope confirmation",
      "Provide requested documents promptly and accurately",
      "Never speculate — answer only what is known",
      "Log all document requests and inspector comments in real time",
      "Escalate sensitive or unexpected observations to front-room lead immediately",
      "Maintain professional, cooperative demeanour at all times",
    ],
    attachments: ["Opening-Meeting-Deck-v3.pptx", "DIL-Request-Log-Template.xlsx", "Front-Room-Rules-SOP-QA-112.pdf"],
  },
  {
    name: "Back Room Playbook",
    description: "Evidence retrieval, review gates, redaction rules and commitment tracking for back-room support team.",
    steps: [
      "Receive DIL request from front-room lead — log immediately",
      "Retrieve documents within 15 minutes (standard) or 30 minutes (complex)",
      "Review gate: QA sign-off before submission of any original records",
      "Apply redaction per legal guidance — do not over-redact",
      "Track all commitments in commitment matrix with target dates",
      "Brief front-room lead before each session debrief",
    ],
    attachments: ["Back-Room-SOP-QA-113.pdf", "Commitment-Matrix-Template.xlsx", "Evidence-Retrieval-Checklist.xlsx"],
  },
  {
    name: "SME Coaching Guide",
    description: "Q&A patterns, escalation rules and dos and don'ts for subject matter experts during inspector interactions.",
    steps: [
      "Answer only the question asked — do not volunteer additional information",
      "If uncertain, say 'I will confirm and follow up' — never guess",
      "Escalate technical questions outside your scope to the front-room lead",
      "Do not discuss competitor practices, site incidents, or personal opinions",
      "Reference SOPs and controlled documents — bring printed copies if relevant",
      "Debrief with back-room team after each inspector interaction",
    ],
    attachments: ["SME-Q&A-Guide-v2.pdf", "Common-Inspector-Questions-Pharma.pdf"],
  },
  {
    name: "DIL Handling Procedure",
    description: "Document Inventory List request handling — evidence retrieval and compliance with inspection requests.",
    steps: [
      "Receive DIL in writing — acknowledge within 5 minutes",
      "Assess scope and assign retrieval owners per area",
      "Retrieve originals — never provide unofficial copies",
      "QA review of all documents before submission",
      "Log evidence reference, date/time, and receiver in DIL log",
      "Retain copies of all submitted documents",
    ],
    attachments: ["DIL-Template-QA-118.xlsx", "Evidence-Index-Master.xlsx"],
  },
];

const TRAINING = [
  { role: "QA Head", modules: ["GMP Core", "CAPA Closure", "Inspection Behaviour", "DI Awareness"], status: ["Complete", "Complete", "Complete", "In Progress"] },
  { role: "QC/Lab Director", modules: ["GMP Core", "OOS/OOT Handling", "DI Awareness", "Inspection Behaviour"], status: ["Complete", "In Progress", "Open", "Open"] },
  { role: "CSV/Val Lead", modules: ["GMP Core", "Part 11 Controls", "GAMP 5 Overview", "DI Awareness"], status: ["Complete", "Complete", "In Progress", "Open"] },
  { role: "Operations Head", modules: ["GMP Core", "Inspection Behaviour", "Batch Record Controls"], status: ["In Progress", "Open", "Open"] },
  { role: "Regulatory Affairs", modules: ["GMP Core", "FDA 483 Response", "Inspection Behaviour", "CAPA Closure"], status: ["Complete", "Complete", "Complete", "In Progress"] },
  { role: "IT/CDO", modules: ["GMP Core", "Part 11 Controls", "DI Awareness"], status: ["Open", "Open", "Open"] },
];

const STATUS_COLOR: Record<string, string> = {
  Complete: "badge-green", "In Progress": "badge-amber", Open: "badge-gray",
};

export function InspectionPage() {
  const [activeTab, setActiveTab] = useState<"roadmap" | "playbooks" | "training">("roadmap");
  const [selectedPlaybook, setSelectedPlaybook] = useState<number | null>(null);
  const [bucket, setBucket] = useState<"immediate" | "mid" | "long">("immediate");

  const BUCKETS = [
    { key: "immediate" as const, label: "Immediate (0–30d)" },
    { key: "mid" as const, label: "31–60 days" },
    { key: "long" as const, label: "61–90 days" },
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Inspection Readiness Program</h1>
          <p className="page-subtitle mt-1">Roadmap, playbooks, training matrix &amp; simulation</p>
        </div>
        <Button variant="secondary" size="sm" icon={Download}>Export readiness pack</Button>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: CheckSquare, label: "Immediate actions", value: Object.values(ROADMAP).flatMap((r) => r.immediate).length, color: "text-(--danger)" },
          { icon: BookOpen, label: "Active playbooks", value: PLAYBOOKS.length, color: "text-(--brand)" },
          { icon: GraduationCap, label: "Training sessions", value: 6, color: "text-(--warning)" },
          { icon: Users, label: "SMEs prepared", value: 4, color: "text-(--success)" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label flex items-center gap-1"><s.icon className={`w-3 h-3 ${s.color}`} />{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--bg-border)">
        {([
          { key: "roadmap", label: "Readiness Roadmap" },
          { key: "playbooks", label: "Inspection Playbooks" },
          { key: "training", label: "Training & Simulations" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${activeTab === t.key ? "border-(--brand) text-(--brand)" : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "roadmap" && (
        <div className="space-y-4">
          {/* Bucket selector */}
          <div className="flex gap-2">
            {BUCKETS.map((b) => (
              <button key={b.key} onClick={() => setBucket(b.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${bucket === b.key ? "bg-(--brand) text-white" : "bg-(--bg-elevated) text-(--text-secondary) border border-(--bg-border) hover:bg-(--bg-hover)"}`}>
                {b.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {Object.entries(ROADMAP).map(([lane, items]) => (
              <div key={lane} className="card">
                <div className="card-header py-3">
                  <h3 className="card-title">{lane}</h3>
                </div>
                <div className="card-body space-y-2 py-3">
                  {items[bucket].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-(--text-secondary) leading-relaxed">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-(--brand) shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "playbooks" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Playbook list */}
          <div className="space-y-3">
            {PLAYBOOKS.map((p, i) => (
              <button key={i} onClick={() => setSelectedPlaybook(i === selectedPlaybook ? null : i)}
                className={`w-full text-left card p-4 transition-colors ${selectedPlaybook === i ? "border-(--brand)" : "hover:border-(--bg-hover)"}`}>
                <div className="font-semibold text-sm text-(--text-primary)">{p.name}</div>
                <p className="text-xs text-(--text-muted) mt-1 leading-relaxed line-clamp-2">{p.description}</p>
                <div className="flex items-center gap-1 mt-2 text-xs text-(--brand)">
                  View playbook <ChevronRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>

          {/* Playbook detail */}
          <div className="lg:col-span-2">
            {selectedPlaybook !== null ? (
              <div className="card h-full">
                <div className="card-header">
                  <h2 className="card-title">{PLAYBOOKS[selectedPlaybook].name}</h2>
                </div>
                <div className="card-body space-y-4">
                  <p className="text-sm text-(--text-secondary)">{PLAYBOOKS[selectedPlaybook].description}</p>
                  <div>
                    <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-3">Steps</div>
                    <ol className="space-y-2">
                      {PLAYBOOKS[selectedPlaybook].steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <span className="text-xs font-bold text-(--brand) mt-0.5 w-4 shrink-0">{i + 1}.</span>
                          <span className="text-(--text-secondary)">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-2">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                      {PLAYBOOKS[selectedPlaybook].attachments.map((a) => (
                        <span key={a} className="badge badge-gray font-mono text-[10px]">{a}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card h-full flex items-center justify-center text-(--text-muted) text-sm py-20">
                Select a playbook to view its steps and attachments.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "training" && (
        <div className="space-y-6">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Training matrix — Roles × Modules × Status</h2>
              <Button variant="ghost" size="sm">Launch Simulation</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Module</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {TRAINING.flatMap((t) =>
                    t.modules.map((m, i) => (
                      <tr key={`${t.role}-${i}`}>
                        {i === 0 && <td rowSpan={t.modules.length} className="font-semibold text-sm align-top pt-4">{t.role}</td>}
                        <td className="text-sm">{m}</td>
                        <td><span className={`badge ${STATUS_COLOR[t.status[i]]}`}>{t.status[i]}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
