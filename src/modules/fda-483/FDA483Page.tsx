import { useState } from "react";
import { AlertOctagon, ChevronDown, ChevronUp, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";

const EVENTS = [
  {
    id: "EV-001",
    type: "FDA 483",
    agency: "FDA",
    date: "15 Feb 2026",
    site: "Mumbai API Plant",
    responseDeadline: "17 Mar 2026",
    status: "Response In Progress",
    observations: [
      {
        num: 1,
        area: "QC Lab",
        text: "Failure to maintain complete records of laboratory data required by 21 CFR Part 11 §11.10(e). Audit trail logs disabled for LIMS field-level changes during Dec 2025 – Feb 2026.",
        severity: "Critical",
        capaRef: "CAPA-0042",
        rcaStatus: "Complete",
        responseStatus: "Drafting",
      },
      {
        num: 2,
        area: "Validation",
        text: "Computerized system (Empower 3 CDS) placed into production use without completion of Installation Qualification (IQ) or Operational Qualification (OQ) as required by 21 CFR Part 211.68.",
        severity: "Critical",
        capaRef: "CAPA-0041",
        rcaStatus: "In Progress",
        responseStatus: "Not Started",
      },
      {
        num: 3,
        area: "Training",
        text: "Training records for 12 QC analysts do not reflect completion of current revision of SOP-QC-044 Rev 5 (effective Jan 2026).",
        severity: "Major",
        capaRef: "CAPA-0040",
        rcaStatus: "Not Started",
        responseStatus: "Not Started",
      },
    ],
    commitments: [
      { action: "Restore LIMS audit trail configuration", owner: "Anita Patel", due: "15 Mar 2026", status: "Overdue" },
      { action: "Complete HPLC IQ/OQ", owner: "Dr. Nisha Rao", due: "25 Mar 2026", status: "In Progress" },
      { action: "Complete analyst training on SOP-QC-044 Rev 5", owner: "Suresh Kumar", due: "31 Mar 2026", status: "Open" },
    ],
  },
  {
    id: "EV-002",
    type: "EMA Inspection Finding",
    agency: "EMA/MHRA",
    date: "10 Nov 2025",
    site: "Pune Formulation Plant",
    responseDeadline: "10 Jan 2026",
    status: "Closed",
    observations: [
      {
        num: 1,
        area: "QMS",
        text: "CAPA system does not consistently assess effectiveness of corrective actions. 4 of 7 CAPAs reviewed had no documented effectiveness check within the required timeframe.",
        severity: "Major",
        capaRef: "CAPA-0035",
        rcaStatus: "Complete",
        responseStatus: "Accepted",
      },
    ],
    commitments: [
      { action: "Implement CAPA effectiveness check SOP", owner: "Dr. Priya Sharma", due: "15 Dec 2025", status: "Closed" },
    ],
  },
];

const SEV_COLOR: Record<string, string> = { Critical: "badge-red", Major: "badge-amber", Minor: "badge-gray" };
const STATUS_COLOR: Record<string, string> = {
  "Response In Progress": "badge-amber", Closed: "badge-green", Open: "badge-blue",
  Overdue: "badge-red", "In Progress": "badge-amber", "Not Started": "badge-gray",
  Drafting: "badge-amber", Accepted: "badge-green", Complete: "badge-green",
};

export function FDA483Page() {
  const { canView483, isViewOnly } = useRole();
  const [expanded, setExpanded] = useState<string | null>("EV-001");

  if (!canView483) {
    return (
      <div className="w-full max-w-[1440px] mx-auto py-20 text-center">
        <AlertOctagon className="w-8 h-8 text-(--text-muted) mx-auto mb-3" />
        <p className="text-(--text-muted) text-sm">You do not have access to FDA 483 / Warning Letter Support.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">FDA 483 / Warning Letter Support</h1>
          <p className="page-subtitle mt-1">Enforcement event tracker, RCA workspace &amp; response management</p>
        </div>
        <Button variant="secondary" size="sm" icon={Download}>Export commitment matrix</Button>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active enforcement events", value: EVENTS.filter((e) => e.status !== "Closed").length, color: "text-(--danger)" },
          { label: "Total observations", value: EVENTS.flatMap((e) => e.observations).length, color: "text-(--warning)" },
          { label: "Open commitments", value: EVENTS.flatMap((e) => e.commitments).filter((c) => c.status !== "Closed").length, color: "text-(--warning)" },
          { label: "Closed events", value: EVENTS.filter((e) => e.status === "Closed").length, color: "text-(--success)" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </section>

      {/* Event cards */}
      <div className="space-y-4">
        {EVENTS.map((ev) => (
          <div key={ev.id} className="card">
            {/* Event header */}
            <button
              className="w-full card-header hover:bg-(--bg-elevated) transition-colors"
              onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
            >
              <div className="flex items-center gap-3">
                <AlertOctagon className={`w-4 h-4 ${ev.status === "Closed" ? "text-(--success)" : "text-(--danger)"}`} />
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">{ev.type}</span>
                    <span className="badge badge-gray text-[10px]">{ev.agency}</span>
                    <span className={`badge ${STATUS_COLOR[ev.status]}`}>{ev.status}</span>
                  </div>
                  <div className="text-xs text-(--text-muted) mt-0.5">{ev.site} · Received {ev.date} · Response due {ev.responseDeadline}</div>
                </div>
              </div>
              {expanded === ev.id ? <ChevronUp className="w-4 h-4 text-(--text-muted)" /> : <ChevronDown className="w-4 h-4 text-(--text-muted)" />}
            </button>

            {expanded === ev.id && (
              <div className="divide-y divide-(--bg-border)">
                {/* Observations */}
                <div className="p-5">
                  <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-3">Observations</div>
                  <div className="space-y-4">
                    {ev.observations.map((obs) => (
                      <div key={obs.num} className="rounded-lg p-4" style={{ background: "var(--bg-elevated)" }}>
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-(--text-muted)">OBS {obs.num}</span>
                            <span className="badge badge-gray text-[10px]">{obs.area}</span>
                            <span className={`badge ${SEV_COLOR[obs.severity]}`}>{obs.severity}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <span className="text-xs text-(--text-muted)">CAPA: <span className="text-(--brand) font-mono">{obs.capaRef}</span></span>
                          </div>
                        </div>
                        <p className="text-sm text-(--text-secondary) leading-relaxed">{obs.text}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs">
                          <span>RCA: <span className={`badge ${STATUS_COLOR[obs.rcaStatus]}`}>{obs.rcaStatus}</span></span>
                          <span>Response: <span className={`badge ${STATUS_COLOR[obs.responseStatus]}`}>{obs.responseStatus}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Commitment matrix */}
                <div className="p-5">
                  <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-3">Commitment matrix</div>
                  <table className="data-table">
                    <thead><tr><th>Commitment</th><th>Owner</th><th>Due date</th><th>Status</th></tr></thead>
                    <tbody>
                      {ev.commitments.map((c, i) => (
                        <tr key={i}>
                          <td className="text-sm">{c.action}</td>
                          <td className="text-sm whitespace-nowrap">{c.owner}</td>
                          <td className="text-xs whitespace-nowrap">{c.due}</td>
                          <td><span className={`badge ${STATUS_COLOR[c.status]}`}>{c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* RCA workspace */}
                {ev.status !== "Closed" && !isViewOnly && (
                  <div className="p-5">
                    <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-3">RCA workspace</div>
                    <div className="grid grid-cols-3 gap-3">
                      {["5-Why Analysis", "Fishbone Diagram", "Fault Tree"].map((t) => (
                        <button key={t} className="card p-4 text-left hover:border-(--brand) transition-colors">
                          <FileText className="w-4 h-4 text-(--brand) mb-2" />
                          <div className="text-sm font-medium">{t}</div>
                          <div className="text-xs text-(--text-muted) mt-0.5">Open template</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
