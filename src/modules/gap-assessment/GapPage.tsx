import { useState } from "react";
import { Search, Download, Eye, FileText, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";

const FINDINGS = [
  { id: "F-001", area: "QC Lab", req: "21 CFR Part 11 §11.10(e)", severity: "Critical", status: "Open", owner: "Dr. Nisha Rao", dueDate: "20 Mar 2026", evidence: "AuditTrail-LIMS-001", agiSummary: "Audit trail incomplete for 14 LIMS records. Direct Part 11 non-compliance." },
  { id: "F-002", area: "QMS", req: "EU GMP Annex 11 §10", severity: "Critical", status: "In Progress", owner: "Dr. Priya Sharma", dueDate: "25 Mar 2026", evidence: "CAPA-0042", agiSummary: "CAPA closure rate 62%. 3 overdue critical CAPAs linked to repeat observations." },
  { id: "F-003", area: "CSV/IT", req: "GAMP 5 Chapter 4", severity: "Major", status: "Open", owner: "Anita Patel", dueDate: "05 Apr 2026", evidence: "ValPkg-HPLC-01", agiSummary: "IQ/OQ not completed for HPLC system commissioned 45 days ago." },
  { id: "F-004", area: "Training", req: "21 CFR Part 211.68", severity: "Major", status: "Open", owner: "Suresh Kumar", dueDate: "10 Apr 2026", evidence: "TRN-Matrix-Q1", agiSummary: "32 staff overdue GMP refresher. Training compliance at 78% — below 90% target." },
  { id: "F-005", area: "Warehouse", req: "WHO GMP §14.13", severity: "Major", status: "Open", owner: "Rahul Mehta", dueDate: "15 Apr 2026", evidence: "SOP-WH-004-v2", agiSummary: "Temperature excursion log has 3 uninvestigated entries in Q1 2026." },
  { id: "F-006", area: "Manufacturing", req: "ICH Q9 §4.1", severity: "Minor", status: "Open", owner: "Suresh Kumar", dueDate: "30 Apr 2026", evidence: "RiskReg-Mfg-Q1", agiSummary: "Annual risk review 28 days overdue. No patient safety impact identified." },
  { id: "F-007", area: "QMS", req: "ICH Q10 §3.2", severity: "Minor", status: "Closed", owner: "Dr. Priya Sharma", dueDate: "01 Mar 2026", evidence: "MgmtRev-Feb26", agiSummary: "Management review metrics updated. Closed with effective actions." },
  { id: "F-008", area: "Utilities", req: "EU GMP Annex 15 §4", severity: "Major", status: "Open", owner: "Anita Patel", dueDate: "20 Apr 2026", evidence: "EM-SOP-Util-003", agiSummary: "Environmental monitoring SOP not revised since 2023. Periodic review overdue." },
];

const RISK_DRIVERS = [
  { area: "Data Integrity", count: 4, pct: 32 },
  { area: "Training Gaps", count: 3, pct: 24 },
  { area: "Validation Backlog", count: 3, pct: 24 },
  { area: "SOP Currency", count: 2, pct: 16 },
  { area: "Supplier Oversight", count: 1, pct: 8 },
];

const EVIDENCE_NODES = [
  { area: "QC Lab", docs: ["AuditTrail-LIMS-001", "OOS-Log-Q1-2026", "LIMS-Config-v3"], status: "Partial" },
  { area: "QMS", docs: ["CAPA-0042", "CAPA-0038", "MgmtRev-Feb26", "DevLog-2026"], status: "Complete" },
  { area: "CSV/IT", docs: ["ValPkg-HPLC-01", "SysInv-2026", "Part11-Gap-Report"], status: "Missing" },
  { area: "Training", docs: ["TRN-Matrix-Q1", "GMP-Rec-List-Mar26"], status: "Partial" },
  { area: "Manufacturing", docs: ["RiskReg-Mfg-Q1", "BatchRec-Template-v4"], status: "Complete" },
];

const SEV_COLOR: Record<string, string> = {
  Critical: "badge-red",
  Major: "badge-amber",
  Minor: "badge-gray",
};
const STATUS_COLOR: Record<string, string> = {
  Open: "badge-blue",
  "In Progress": "badge-amber",
  Closed: "badge-green",
};
const EVIDENCE_COLOR: Record<string, string> = {
  Complete: "badge-green",
  Partial: "badge-amber",
  Missing: "badge-red",
};

export function GapPage() {
  const { isViewOnly } = useRole();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"findings" | "evidence">("findings");

  const filtered = FINDINGS.filter((f) => {
    const matchSearch = f.id.toLowerCase().includes(search.toLowerCase()) || f.area.toLowerCase().includes(search.toLowerCase()) || f.req.toLowerCase().includes(search.toLowerCase());
    const matchArea = !areaFilter || f.area === areaFilter;
    const matchSev = !sevFilter || f.severity === sevFilter;
    const matchStatus = !statusFilter || f.status === statusFilter;
    return matchSearch && matchArea && matchSev && matchStatus;
  });

  const selectedFinding = FINDINGS.find((f) => f.id === selected);
  const critical = FINDINGS.filter((f) => f.severity === "Critical").length;
  const major = FINDINGS.filter((f) => f.severity === "Major").length;
  const minor = FINDINGS.filter((f) => f.severity === "Minor").length;
  const open = FINDINGS.filter((f) => f.status !== "Closed").length;

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">GxP / GMP Gap Assessment</h1>
          <p className="page-subtitle mt-1">Findings register, evidence index &amp; risk drivers</p>
        </div>
        <Button variant="secondary" size="sm" icon={Download}>Export register</Button>
      </header>

      {/* Summary tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><AlertCircle className="w-3 h-3 text-(--danger)" />Critical findings</div>
          <div className="stat-value text-(--danger)">{critical}</div>
          <div className="stat-sub">Immediate action required</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-(--warning)" />Major findings</div>
          <div className="stat-value text-(--warning)">{major}</div>
          <div className="stat-sub">Address within 30 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><Info className="w-3 h-3 text-(--text-muted)" />Minor findings</div>
          <div className="stat-value">{minor}</div>
          <div className="stat-sub">Address within 90 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open findings</div>
          <div className="stat-value text-(--warning)">{open}</div>
          <div className="stat-sub">{FINDINGS.length - open} closed</div>
        </div>
      </section>

      {/* Top risk drivers */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Top 5 risk drivers</h2>
        </div>
        <div className="card-body space-y-3">
          {RISK_DRIVERS.map((d) => (
            <div key={d.area} className="flex items-center gap-3">
              <span className="text-sm text-(--text-secondary) w-40 shrink-0">{d.area}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.pct >= 30 ? "var(--danger)" : d.pct >= 20 ? "var(--warning)" : "var(--brand)" }} />
              </div>
              <span className="text-xs text-(--text-muted) w-8 text-right">{d.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--bg-border)">
        {(["findings", "evidence"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${activeTab === t ? "border-(--brand) text-(--brand)" : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"}`}
          >
            {t === "findings" ? "Findings Register" : "Evidence Index"}
          </button>
        ))}
      </div>

      {activeTab === "findings" && (
        <section className="card">
          {/* Filters */}
          <div className="card-header flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-(--text-muted) shrink-0" />
              <input className="input text-sm py-1.5" placeholder="Search ID, area, requirement…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select className="select text-sm py-1.5 w-auto" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                <option value="">All areas</option>
                {["QC Lab", "QMS", "CSV/IT", "Training", "Warehouse", "Manufacturing", "Utilities"].map((a) => <option key={a}>{a}</option>)}
              </select>
              <select className="select text-sm py-1.5 w-auto" value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
                <option value="">All severities</option>
                <option>Critical</option><option>Major</option><option>Minor</option>
              </select>
              <select className="select text-sm py-1.5 w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option>Open</option><option>In Progress</option><option>Closed</option>
              </select>
            </div>
          </div>

          <div className="flex">
            {/* Table */}
            <div className={`overflow-x-auto ${selectedFinding ? "flex-1" : "w-full"}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Area</th><th>Requirement</th><th>Severity</th>
                    <th>Status</th><th>Owner</th><th>Target date</th><th>Evidence</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr key={f.id} className={selected === f.id ? "bg-(--brand-muted)" : ""}>
                      <td className="font-mono text-xs text-(--brand)">{f.id}</td>
                      <td className="whitespace-nowrap">{f.area}</td>
                      <td className="text-xs text-(--text-secondary) max-w-[160px] truncate" title={f.req}>{f.req}</td>
                      <td><span className={`badge ${SEV_COLOR[f.severity]}`}>{f.severity}</span></td>
                      <td><span className={`badge ${STATUS_COLOR[f.status]}`}>{f.status}</span></td>
                      <td className="whitespace-nowrap text-sm">{f.owner}</td>
                      <td className="whitespace-nowrap text-xs">{f.dueDate}</td>
                      <td className="font-mono text-xs text-(--text-muted)">{f.evidence}</td>
                      <td>
                        <button onClick={() => setSelected(selected === f.id ? null : f.id)} className="btn-ghost text-xs py-1 px-2">
                          <Eye className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-(--text-muted) text-sm">No findings match your filters.</div>
              )}
            </div>

            {/* Detail panel */}
            {selectedFinding && (
              <aside className="w-72 border-l border-(--bg-border) p-5 space-y-4 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-(--brand)">{selectedFinding.id}</span>
                  <button onClick={() => setSelected(null)} className="text-(--text-muted) text-lg leading-none">&times;</button>
                </div>
                <div>
                  <div className="text-xs text-(--text-muted) mb-1">Requirement</div>
                  <div className="text-sm font-medium">{selectedFinding.req}</div>
                </div>
                <div className="flex gap-2">
                  <span className={`badge ${SEV_COLOR[selectedFinding.severity]}`}>{selectedFinding.severity}</span>
                  <span className={`badge ${STATUS_COLOR[selectedFinding.status]}`}>{selectedFinding.status}</span>
                </div>
                <div>
                  <div className="text-xs text-(--text-muted) mb-1">Owner</div>
                  <div className="text-sm">{selectedFinding.owner}</div>
                </div>
                <div>
                  <div className="text-xs text-(--text-muted) mb-1">Target date</div>
                  <div className="text-sm">{selectedFinding.dueDate}</div>
                </div>
                <div>
                  <div className="text-xs text-(--text-muted) mb-1">Evidence ref</div>
                  <div className="text-sm font-mono text-(--brand)">{selectedFinding.evidence}</div>
                </div>
                <div className="agi-panel">
                  <div className="text-xs font-semibold text-(--info) mb-1">AGI Summary</div>
                  <p className="text-xs text-(--text-secondary) leading-relaxed">{selectedFinding.agiSummary}</p>
                </div>
                {!isViewOnly && (
                  <Button size="sm" fullWidth>Link to CAPA</Button>
                )}
              </aside>
            )}
          </div>
        </section>
      )}

      {activeTab === "evidence" && (
        <section className="space-y-3">
          {EVIDENCE_NODES.map((node) => (
            <div key={node.area} className="card">
              <div className="card-header py-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-(--text-muted)" />
                  <span className="card-title">{node.area}</span>
                </div>
                <span className={`badge ${EVIDENCE_COLOR[node.status]}`}>{node.status}</span>
              </div>
              <div className="card-body py-3">
                <div className="flex flex-wrap gap-2">
                  {node.docs.map((doc) => (
                    <span key={doc} className="badge badge-gray font-mono text-xs">{doc}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
