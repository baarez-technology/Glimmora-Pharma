import { useState } from "react";
import { Download, TrendingUp, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { chartDefaults, CHART_COLORS } from "@/lib/chartColors";

const KPI_TREND = [
  { month: "Oct", capaOnTime: 68, training: 82, csvDrift: 12, diExceptions: 8 },
  { month: "Nov", capaOnTime: 71, training: 84, csvDrift: 10, diExceptions: 6 },
  { month: "Dec", capaOnTime: 65, training: 80, csvDrift: 14, diExceptions: 9 },
  { month: "Jan", capaOnTime: 72, training: 86, csvDrift: 11, diExceptions: 7 },
  { month: "Feb", capaOnTime: 74, training: 88, csvDrift: 9, diExceptions: 5 },
  { month: "Mar", capaOnTime: 74, training: 91, csvDrift: 8, diExceptions: 4 },
];

const RAID_LOG = [
  { id: "R-001", type: "Risk", description: "FDA inspection window opens in 14 days — CAPA-0042 still overdue", impact: "High", probability: "High", owner: "Dr. Priya Sharma", status: "Open", mitigation: "Escalated to Site Head. Daily review in place." },
  { id: "R-002", type: "Risk", description: "HPLC IQ/OQ not complete — system in use without validation", impact: "High", probability: "Medium", owner: "Anita Patel", status: "Open", mitigation: "CAPA-0041 in progress. Target 25 Mar 2026." },
  { id: "A-001", type: "Action", description: "Complete GMP refresher training for 32 Mumbai staff", impact: "Medium", probability: "—", owner: "Suresh Kumar", status: "In Progress", mitigation: "Schedule confirmed for 28 Mar 2026." },
  { id: "I-001", type: "Issue", description: "LIMS audit trail log incomplete for Dec 2025 – Mar 2026 period", impact: "High", probability: "—", owner: "Dr. Nisha Rao", status: "In Progress", mitigation: "Retrospective review in progress." },
  { id: "D-001", type: "Decision", description: "Agreed to prioritise HPLC and LIMS remediation above all other CSV activities in Q1 2026", impact: "—", probability: "—", owner: "Dr. Priya Sharma", status: "Closed", mitigation: "Documented in meeting minutes 01 Mar 2026." },
  { id: "R-003", type: "Risk", description: "SME availability constrained during inspection window — 2 senior QC staff on annual leave", impact: "Medium", probability: "Medium", owner: "Suresh Kumar", status: "Open", mitigation: "Backup SMEs identified and briefed." },
];

const SCORECARDS = [
  { label: "CAPA on-time closure", value: "74%", target: "≥ 90%", ok: false, trend: "+3% MoM" },
  { label: "Training compliance", value: "91%", target: "≥ 90%", ok: true, trend: "+3% MoM" },
  { label: "CSV drift indicators", value: "8", target: "≤ 5", ok: false, trend: "-1 MoM" },
  { label: "DI exceptions covered", value: "96%", target: "100%", ok: false, trend: "+1% MoM" },
  { label: "Overdue audit trail reviews", value: "2", target: "0", ok: false, trend: "-1 MoM" },
  { label: "Repeat observation rate", value: "12%", target: "≤ 5%", ok: false, trend: "0% MoM" },
];

const RAID_COLOR: Record<string, string> = { Risk: "badge-red", Action: "badge-blue", Issue: "badge-amber", Decision: "badge-green" };
const STATUS_COLOR: Record<string, string> = { Open: "badge-red", "In Progress": "badge-amber", Closed: "badge-green" };
const IMPACT_COLOR: Record<string, string> = { High: "badge-red", Medium: "badge-amber", Low: "badge-gray", "—": "badge-gray" };

export function GovernancePage() {
  const [activeTab, setActiveTab] = useState<"kpis" | "raid" | "reports">("kpis");
  const [raidTypeFilter, setRaidTypeFilter] = useState("");

  const filteredRaid = RAID_LOG.filter((r) => !raidTypeFilter || r.type === raidTypeFilter);

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Governance &amp; KPIs</h1>
          <p className="page-subtitle mt-1">Compliance scorecards, RAID log &amp; governance reporting</p>
        </div>
        <Button variant="secondary" size="sm" icon={Download}>Export report</Button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--bg-border)">
        {([
          { key: "kpis", label: "KPIs & Scorecards" },
          { key: "raid", label: "RAID & Risks" },
          { key: "reports", label: "Reports & Exports" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${activeTab === t.key ? "border-(--brand) text-(--brand)" : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "kpis" && (
        <div className="space-y-6">
          {/* Scorecards */}
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {SCORECARDS.map((s) => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className={`stat-value ${s.ok ? "text-(--success)" : "text-(--danger)"}`}>{s.value}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="stat-sub">Target: {s.target}</span>
                  <span className={`text-[10px] font-medium ${s.ok ? "text-(--success)" : "text-(--warning)"}`}>{s.trend}</span>
                </div>
              </div>
            ))}
          </section>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" />CAPA on-time &amp; training trend</h2>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={KPI_TREND}>
                    <CartesianGrid {...chartDefaults.cartesianGrid} />
                    <XAxis dataKey="month" {...chartDefaults.xAxis} />
                    <YAxis {...chartDefaults.yAxis} domain={[60, 100]} />
                    <Tooltip {...chartDefaults.tooltip} />
                    <Legend iconType="circle" iconSize={8} />
                    <Line type="monotone" dataKey="capaOnTime" name="CAPA on-time (%)" stroke={CHART_COLORS.warning} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="training" name="Training compliance (%)" stroke={CHART_COLORS.success} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title flex items-center gap-2"><BarChart2 className="w-3.5 h-3.5" />CSV drift &amp; DI exceptions</h2>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={KPI_TREND} barSize={16} barGap={4}>
                    <CartesianGrid {...chartDefaults.cartesianGrid} />
                    <XAxis dataKey="month" {...chartDefaults.xAxis} />
                    <YAxis {...chartDefaults.yAxis} />
                    <Tooltip {...chartDefaults.tooltip} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="csvDrift" name="CSV drift indicators" fill={CHART_COLORS.danger} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="diExceptions" name="DI exceptions" fill={CHART_COLORS.warning} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "raid" && (
        <section className="card">
          <div className="card-header flex-wrap gap-3">
            <h2 className="card-title">RAID Log — Risks, Actions, Issues, Decisions</h2>
            <select className="select text-sm py-1.5 w-auto" value={raidTypeFilter} onChange={(e) => setRaidTypeFilter(e.target.value)}>
              <option value="">All types</option>
              <option>Risk</option><option>Action</option><option>Issue</option><option>Decision</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th><th>Type</th><th>Description</th>
                  <th>Impact</th><th>Owner</th><th>Status</th><th>Mitigation / Decision</th>
                </tr>
              </thead>
              <tbody>
                {filteredRaid.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs text-(--brand)">{r.id}</td>
                    <td><span className={`badge ${RAID_COLOR[r.type]}`}>{r.type}</span></td>
                    <td className="text-sm max-w-[240px]">{r.description}</td>
                    <td><span className={`badge ${IMPACT_COLOR[r.impact]}`}>{r.impact}</span></td>
                    <td className="text-sm whitespace-nowrap">{r.owner}</td>
                    <td><span className={`badge ${STATUS_COLOR[r.status]}`}>{r.status}</span></td>
                    <td className="text-xs text-(--text-secondary) max-w-[200px]">{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "reports" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: "Weekly Status Report", desc: "Inspection readiness, CAPA status, open risks — for site leadership.", type: "PDF / DOCX", period: "Weekly" },
            { title: "Monthly Governance Report", desc: "Full KPI dashboard with trend analysis and RAID summary.", type: "PDF", period: "Monthly" },
            { title: "90-Day Action Plan", desc: "Priority actions with owners and due dates across all modules.", type: "XLSX", period: "Ad hoc" },
            { title: "Evidence Pack", desc: "Selected documents with metadata, hashes and compliance tags.", type: "ZIP", period: "Ad hoc" },
            { title: "Executive Compliance Scorecard", desc: "One-page scorecard for C-suite review.", type: "PDF", period: "Monthly" },
            { title: "CAPA Effectiveness Report", desc: "Status of all open effectiveness checks with AGI trend analysis.", type: "PDF / XLSX", period: "Quarterly" },
          ].map((r) => (
            <div key={r.title} className="card p-5 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-sm text-(--text-primary)">{r.title}</div>
                <p className="text-xs text-(--text-muted) mt-1 leading-relaxed">{r.desc}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="badge badge-gray text-[10px]">{r.type}</span>
                  <span className="badge badge-blue text-[10px]">{r.period}</span>
                </div>
              </div>
              <Button variant="secondary" size="xs" icon={Download} className="shrink-0">Generate</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
