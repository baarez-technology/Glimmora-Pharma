import { useState } from "react";
import clsx from "clsx";
import { ShieldAlert, AlertCircle, CheckCircle2, Search, ClipboardCheck, Wrench, Pencil, X, Save } from "lucide-react";
import type { GxPSystem } from "@/types/csv-csa";
import type { Finding } from "@/store/findings.slice";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { Button } from "@/components/ui/Button";

/* ── Props ── */

export interface DIAuditPanelProps {
  system: GxPSystem;
  findings: Finding[];
  capas: CAPA[];  role: string;
  onNavigateGap: (findingId: string) => void;
  onNavigateCapa: (capaId: string) => void;
  onSaveRemediation: (patch: { remediationPlan?: string; remediationStatus?: string }) => void;
}

export function DIAuditPanel({ system, findings, capas, role, onNavigateGap, onNavigateCapa, onSaveRemediation }: DIAuditPanelProps) {
  const [editingRem, setEditingRem] = useState(false);
  const [remPlan, setRemPlan] = useState(system.remediationPlan ?? "");
  const [remStatus, setRemStatus] = useState(system.remediationStatus ?? "open");

  // Reset local form state when the drawer switches to a different system
  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) {
    setPrevId(system.id);
    setEditingRem(false);
    setRemPlan(system.remediationPlan ?? "");
    setRemStatus(system.remediationStatus ?? "open");
  }

  const saveRem = () => {
    onSaveRemediation({ remediationPlan: remPlan, remediationStatus: remStatus });
    setEditingRem(false);
  };
  const cancelRem = () => {
    setRemPlan(system.remediationPlan ?? "");
    setRemStatus(system.remediationStatus ?? "open");
    setEditingRem(false);
  };
  const p11 = system.part11Status;
  const a11 = system.annex11Status;
  // Audit trail status — derived from BOTH Part 11 and Annex 11 (either triggers non-compliant)
  const atBad = p11 === "Non-Compliant" || a11 === "Non-Compliant";
  const atAmber = !atBad && (p11 === "In Progress" || a11 === "In Progress");
  const atGood = !atBad && !atAmber && (p11 === "Compliant" || a11 === "Compliant");
  // E-signature status — derived from Part 11 only (21 CFR Part 11 §11.50/§11.70 govern e-sig)
  const esBad = p11 === "Non-Compliant";
  const esAmber = !esBad && p11 === "In Progress";
  const esGood = !esBad && !esAmber && p11 === "Compliant";
  // Keep isBad/isAmber aliases for unchanged downstream references
  const isBad = atBad;
  const isAmber = atAmber;
  const isGood = atGood;
  // Primary link: explicit linkedSystemId OR linkedSystemName on the finding.
  // Name match is a resilient fallback — survives system ID churn or legacy rows
  // that only captured the display name.
  const linkedFindings = findings.filter(
    (f) => f.linkedSystemId === system.id || (!!f.linkedSystemName && f.linkedSystemName === system.name),
  );
  // CAPAs linked to this system via any linked finding OR a direct linkedSystemId/Name on the CAPA.
  const linkedFindingIds = new Set(linkedFindings.map((f) => f.id));
  const linkedCAPAs = capas.filter(
    (c) =>
      (c.findingId && linkedFindingIds.has(c.findingId)) ||
      c.linkedSystemId === system.id ||
      (!!c.linkedSystemName && c.linkedSystemName === system.name),
  );
  const openDIGateCAPAs = linkedCAPAs.filter((c) => c.diGate && c.status !== "closed");

  function statusPanel(isBadS: boolean, isAmberS: boolean, icon: React.ReactNode, label: string, desc: string) {
    const bg = isBadS ? "var(--danger-bg)" : isAmberS ? "var(--warning-bg)" : "var(--success-bg)";
    const border = isBadS ? "var(--danger-bg)" : isAmberS ? "var(--warning-bg)" : "var(--success-bg)";
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg text-[12px]" style={{ background: bg, border: `1px solid ${border}` }}>
        {icon}
        <div>
          <span className="font-semibold block" style={{ color: isBadS ? "#ef4444" : isAmberS ? "#f59e0b" : "#10b981" }}>{label}</span>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">Data integrity status</span></div>{role !== "viewer" && (
        <button
          type="button"
          onClick={() => { if (editingRem) cancelRem(); else setEditingRem(true); }}
          aria-label={editingRem ? "Cancel editing remediation" : "Edit remediation details"}
          className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer", editingRem ? "text-[#64748b]" : "text-[#0ea5e9] hover:opacity-80")}
        >
          {editingRem ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{editingRem ? "Cancel" : "Edit"}</span>
        </button>
      )}</div><div className="card-body space-y-2">
        {statusPanel(isBad, isAmber,
          isBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : isAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          isBad ? "Audit trail non-compliant" : isAmber ? "Audit trail remediation in progress" : isGood ? "Audit trail compliant" : "Audit trail status not applicable",
          isBad ? "Part 11 / Annex 11 gap \u2014 CAPA required" : isAmber ? "Linked CAPA in progress" : isGood ? "Audit trail controls verified and validated" : "Not applicable for this system"
        )}
        {statusPanel(esBad, esAmber,
          esBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : esAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          esBad ? "E-signature non-compliant" : esAmber ? "E-signature remediation in progress" : esGood ? "E-signature compliant" : "E-signature status not applicable",
          esBad ? "E-sig not cryptographically bound to records" : esAmber ? "E-sig binding remediation in progress" : esGood ? "E-sig binding validated under Part 11" : "Not applicable"
        )}
        {statusPanel(openDIGateCAPAs.length > 0, false,
          openDIGateCAPAs.length > 0 ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          openDIGateCAPAs.length > 0 ? `DI gate open \u2014 ${openDIGateCAPAs.length} CAPA(s) pending` : "DI gate cleared",
          openDIGateCAPAs.length > 0 ? "Data integrity review must complete before closure" : "No open data integrity issues for this system"
        )}
        {editingRem ? (
          <div
            className="p-3 rounded-lg space-y-3"
            style={{ background: "var(--warning-bg)", border: "1px solid rgba(245,158,11,0.35)" }}
          >
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 shrink-0" style={{ color: "#854f0b" }} aria-hidden="true" />
              <span className="text-[12px] font-semibold" style={{ color: "#854f0b" }}>Remediation details</span>
            </div>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Linked CAPAs are derived automatically from Gap Assessment findings tied to this system.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label htmlFor="rem-status-inline" className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Status</label>
                <select id="rem-status-inline" value={remStatus} onChange={(e) => setRemStatus(e.target.value)} className="input text-[11px]">
                  <option value="open">Open</option>
                  <option value="in-progress">In progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label htmlFor="rem-plan-inline" className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Remediation plan</label>
                <textarea id="rem-plan-inline" rows={3} value={remPlan} onChange={(e) => setRemPlan(e.target.value)} className="input text-[11px] resize-none w-full" placeholder="Describe the remediation plan and actions..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" type="button" onClick={cancelRem}>Cancel</Button>
              <Button variant="primary" size="xs" icon={Save} type="button" onClick={saveRem}>Save</Button>
            </div>
          </div>
        ) : (system.remediationPlan || system.remediationStatus) ? (
          <div
            className="flex items-start gap-2 p-3 rounded-lg"
            style={{ background: "var(--warning-bg)", border: "1px solid rgba(245,158,11,0.35)" }}
            role="status"
          >
            <Wrench className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#854f0b" }} aria-hidden="true" />
            <div className="flex-1 text-[12px]">
              <p className="font-semibold mb-1 capitalize" style={{ color: "#854f0b" }}>
                Remediation: {system.remediationStatus ?? "open"}
              </p>
              {system.remediationPlan && (
                <p className="mt-1" style={{ color: "var(--text-secondary)" }}>{system.remediationPlan}</p>
              )}
            </div>
          </div>
        ) : null}
      </div></div>

      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Search className="w-4 h-4 text-[#a78bfa]" aria-hidden="true" /><span className="card-title">Linked findings</span>{linkedFindings.length > 0 && <Badge variant={linkedFindings.some((f) => f.severity === "Critical") ? "red" : "amber"}>{linkedFindings.length}</Badge>}</div></div><div className="card-body">
        {linkedFindings.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No findings linked yet. Add a finding in Gap Assessment and link it to this system.</p>
        ) : (
          <div className="space-y-2">{linkedFindings.map((f) => (
            <div key={f.id} onClick={() => onNavigateGap(f.id)} role="button" aria-label={`Open finding ${f.id} in Gap Assessment`}
              className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", "bg-(--bg-surface) border-(--bg-border)")}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{f.id}</span>
                <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{f.requirement}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <Badge variant={getSeverityVariant(f.severity, "generic")}>{normalizeSeverityForDisplay(f.severity, "generic") ?? f.severity}</Badge>
                <Badge variant={f.status === "Closed" ? "green" : f.status === "In Progress" ? "amber" : "blue"}>{f.status}</Badge>
              </div>
            </div>
          ))}</div>
        )}
      </div></div>

      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Linked CAPAs</span>{linkedCAPAs.length > 0 && <Badge variant={linkedCAPAs.some((c) => c.status !== "closed" && c.diGate) ? "red" : "blue"}>{linkedCAPAs.length}</Badge>}</div></div><div className="card-body">
        {linkedCAPAs.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No CAPAs linked yet. Go to Gap Assessment &rarr; finding &rarr; Raise CAPA to create one. It will appear here automatically.</p>
        ) : (
          <div className="space-y-2">{linkedCAPAs.map((c) => (
            <div key={c.id} onClick={() => onNavigateCapa(c.id)} role="button" aria-label={`Open ${c.id} in CAPA Tracker`}
              className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", "bg-(--bg-surface) border-(--bg-border)")}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{c.id}</span>
                <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                {c.diGate && c.status !== "closed" && <Badge variant="red">DI gate</Badge>}
                <Badge variant={c.status === "closed" ? "green" : c.status === "pending_qa_review" ? "purple" : c.status === "in_progress" ? "amber" : "blue"}>{CAPA_STATUS_LABEL[c.status]}</Badge>
              </div>
            </div>
          ))}</div>
        )}
      </div></div>
    </div>
  );
}
