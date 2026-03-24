import { useNavigate, useParams } from "react-router";
import { ArrowLeft, CheckCircle, Clock, AlertCircle, FileText, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";

const MOCK: Record<string, {
  id: string; source: string; risk: string; owner: string; dueDate: string;
  status: string; rcaMethod: string; diGate: boolean; desc: string;
  effectivenessCheck: string; area: string; regulation: string;
  rootCause: string; actions: { step: string; owner: string; due: string; status: string }[];
  history: { date: string; user: string; action: string }[];
}> = {
  "capa0042": {
    id: "CAPA-0042", source: "FDA 483", risk: "Critical", owner: "Dr. Priya Sharma", dueDate: "20 Mar 2026",
    status: "Overdue", rcaMethod: "5-Why", diGate: true, area: "QC Lab", regulation: "21 CFR Part 11 §11.10(e)",
    desc: "LIMS audit trail remediation — 21 CFR Part 11 §11.10(e) compliance",
    effectivenessCheck: "30 Jun 2026",
    rootCause: "LIMS v3.1 upgrade in Dec 2025 introduced a configuration error that disabled audit trail logging for field-level changes. The change was not captured in the change control register as a GxP-impacting modification.",
    actions: [
      { step: "Restore audit trail configuration in LIMS v3.1", owner: "Anita Patel", due: "15 Mar 2026", status: "Overdue" },
      { step: "Retrospective audit trail review for affected records (Dec 2025 – Mar 2026)", owner: "Dr. Nisha Rao", due: "18 Mar 2026", status: "Overdue" },
      { step: "Update CSV change control procedure to include mandatory GxP impact assessment", owner: "Dr. Priya Sharma", due: "25 Mar 2026", status: "In Progress" },
      { step: "Retraining of CSV team on Part 11 audit trail controls", owner: "Suresh Kumar", due: "28 Mar 2026", status: "Open" },
      { step: "Management review of LIMS validation package", owner: "Dr. Priya Sharma", due: "05 Apr 2026", status: "Open" },
    ],
    history: [
      { date: "20 Feb 2026", user: "Dr. Priya Sharma", action: "CAPA created from FDA 483 observation" },
      { date: "21 Feb 2026", user: "Dr. Nisha Rao", action: "Root cause investigation initiated" },
      { date: "28 Feb 2026", user: "Dr. Priya Sharma", action: "5-Why analysis completed. Root cause confirmed." },
      { date: "01 Mar 2026", user: "Anita Patel", action: "Action plan approved by QA Head" },
      { date: "17 Mar 2026", user: "System (AGI)", action: "Overdue alert triggered — Action step 1 past deadline" },
    ],
  },
};

const STATUS_COLOR: Record<string, string> = {
  Open: "badge-blue", "In Progress": "badge-amber", Overdue: "badge-red", Closed: "badge-green",
};
const RISK_COLOR: Record<string, string> = {
  Critical: "badge-red", Major: "badge-amber", Minor: "badge-gray",
};

export function CAPADetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canCloseCapa } = useRole();

  const key = (id ?? "").replace("-", "").toLowerCase();
  const capa = MOCK[key];

  if (!capa) {
    return (
      <div className="w-full max-w-[1440px] mx-auto py-20 text-center">
        <p className="text-(--text-muted) text-sm">CAPA not found.</p>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate("/capa")} className="mt-4">Back to CAPA list</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/capa")} className="btn-ghost p-2 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="page-title">{capa.id}</h1>
              <span className={`badge ${STATUS_COLOR[capa.status]}`}>{capa.status}</span>
              <span className={`badge ${RISK_COLOR[capa.risk]}`}>{capa.risk}</span>
              {capa.diGate && <span className="badge badge-purple">DI Gate</span>}
            </div>
            <p className="page-subtitle mt-1">{capa.desc}</p>
          </div>
        </div>
        {canCloseCapa && capa.status !== "Closed" && (
          <Button size="sm" icon={CheckCircle}>Close CAPA (e-sign)</Button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-header"><h2 className="card-title">CAPA details</h2></div>
          <div className="card-body grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: "Source", value: capa.source },
              { label: "Area", value: capa.area },
              { label: "Regulation / Requirement", value: capa.regulation },
              { label: "Owner", value: capa.owner },
              { label: "Due date", value: capa.dueDate },
              { label: "Effectiveness check", value: capa.effectivenessCheck },
              { label: "RCA method", value: capa.rcaMethod },
              { label: "DI gate required", value: capa.diGate ? "Yes" : "No" },
            ].map((d) => (
              <div key={d.label}>
                <div className="text-xs text-(--text-muted) mb-0.5">{d.label}</div>
                <div className="text-sm font-medium text-(--text-primary)">{d.value}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-(--bg-border) px-5 py-4">
            <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-2">Root cause (5-Why)</div>
            <p className="text-sm text-(--text-secondary) leading-relaxed">{capa.rootCause}</p>
          </div>

          <div className="border-t border-(--bg-border) px-5 py-4">
            <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-3">Action plan</div>
            <div className="space-y-3">
              {capa.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-(--text-muted) mt-0.5 w-4 shrink-0">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm">{a.step}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-(--text-muted)">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{a.owner}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.due}</span>
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${STATUS_COLOR[a.status]}`}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <div className="agi-panel">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-(--info)" />
              <span className="text-sm font-semibold">AGI Analysis</span>
            </div>
            <div className="space-y-2 text-xs text-(--text-secondary) leading-relaxed">
              <p>🔴 This CAPA is <strong className="text-(--danger)">3 days overdue</strong>. FDA inspection window opens in 14 days. Escalation to QA Head has been triggered.</p>
              <p>🔗 2 related findings (F-001, F-002) linked. Closing will improve readiness score by +4 points.</p>
              <p>📋 Effectiveness check template auto-prepared for 30 Jun 2026.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header py-3">
              <h2 className="card-title flex items-center gap-2"><FileText className="w-3.5 h-3.5" />Activity history</h2>
            </div>
            <div className="divide-y divide-(--bg-border)">
              {capa.history.map((h, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="text-xs font-medium text-(--text-primary)">{h.action}</div>
                  <div className="text-xs text-(--text-muted) mt-0.5">{h.user} · {h.date}</div>
                </div>
              ))}
            </div>
          </div>

          {canCloseCapa && (
            <div className="alert alert-info text-xs">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
              Closure requires e-signature (Part 11/Annex 11 compliant). All action steps must be completed first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
