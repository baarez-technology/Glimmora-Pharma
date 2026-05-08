"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Pencil,
  X,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { CAPA_RISK_VARIANT as RISK_VARIANT } from "@/lib/badgeVariants";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { SubmissionChecklist } from "../components/SubmissionChecklist";
import { LinkedChangeControlsSection } from "./LinkedChangeControlsSection";
import type { DetailSubTab } from "../helpers/getNextStep";

const SOURCE_LABEL: Record<string, string> = {
  "483": "FDA 483 Observation",
  "Gap Assessment": "Gap Assessment Finding",
  Deviation: "Deviation Report",
  "Internal Audit": "Internal Audit",
  Complaint: "Complaint",
  OOS: "OOS",
  "Change Control": "Change Control",
};
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

interface OverviewBodyProps {
  capa: CAPA;
  isDark: boolean;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  showMigrationNotice: boolean;
  onDismissNotice: () => void;
  onNavigateGap: (findingId: string) => void;
  onChangeTab: (tab: DetailSubTab) => void;
  onEditOpen: () => void;
  editAllowed: boolean;
  hasMeaningfulDescription: boolean;
  hasRca: boolean;
  hasActions: boolean;
  hasCriteria: boolean;
  hasAlignment: boolean;
}

export function OverviewBody({
  capa,
  isDark,
  users,
  timezone,
  dateFormat,
  showMigrationNotice,
  onDismissNotice,
  onNavigateGap,
  onChangeTab,
  onEditOpen,
  editAllowed,
  hasMeaningfulDescription,
  hasRca,
  hasActions,
  hasCriteria,
  hasAlignment,
}: OverviewBodyProps) {
  const ownerName = users.find((u) => u.id === capa.owner)?.name ?? capa.owner;
  const baseVariant = RISK_VARIANT[capa.risk];
  const riskLevel = capa.risk === "Critical" ? "Critical" : capa.risk === "High" ? "High" : "Low";

  // Submission checklist visible only while the CAPA is editable. Once
  // submitted (pending_qa_review / closed / rejected) the panel is
  // hidden entirely — the next-step banner takes over for those states.
  const showChecklist = capa.status === "open" || capa.status === "in_progress";

  return (
    <div role="tabpanel" id="subpanel-overview" aria-labelledby="subtab-overview" tabIndex={0} className="space-y-4">
      {showChecklist && (
        <SubmissionChecklist
          hasDescription={hasMeaningfulDescription}
          hasRca={hasRca}
          hasActions={hasActions}
          hasCriteria={hasCriteria}
          hasAlignment={hasAlignment}
          onChangeTab={onChangeTab}
        />
      )}

      {showMigrationNotice && (
        <aside
          className="flex items-start gap-2.5 p-3 rounded-lg border"
          style={{ background: "var(--info-bg)", borderColor: "var(--brand-border)" }}
        >
          <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>Looking for evidence files?</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              All file uploads now live in the Evidence tab, organized by category. The old &quot;Attached documents&quot; area has moved.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss notice"
            className="w-6 h-6 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150 shrink-0"
          >
            <X className="w-3 h-3 text-(--text-muted)" aria-hidden="true" />
          </button>
        </aside>
      )}

      {/* Description card with a visible "Edit details" affordance.
          The header pencil icon is preserved (Fix 6) but is too small
          to find on first contact; this surfaces the same edit modal
          via a button in the body where users actually look. */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">Description</h3>
          {editAllowed && (
            <button
              type="button"
              onClick={onEditOpen}
              aria-label="Edit CAPA details"
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md border bg-transparent cursor-pointer transition-colors duration-150 hover:bg-(--bg-hover)"
              style={{
                color: "var(--brand)",
                borderColor: "var(--brand-border)",
              }}
            >
              <Pencil className="w-3 h-3" aria-hidden="true" />
              Edit details
            </button>
          )}
        </div>
        {(capa.description ?? "").trim().length > 0 ? (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{capa.description}</p>
        ) : (
          <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
            No description yet — click Edit details above to add one.
          </p>
        )}
      </div>

      <section aria-labelledby="rbc-heading">
        <h3 id="rbc-heading" className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Risk-based classification</h3>
        {[
          { label: "Patient safety risk", variant: baseVariant, text: riskLevel },
          { label: "Product quality impact", variant: baseVariant, text: riskLevel },
          { label: "Regulatory exposure", variant: (capa.diGate ? "red" : baseVariant) as "red" | "amber" | "green", text: capa.diGate ? "High" : riskLevel },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center py-2 border-b" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{row.label}</span>
            <Badge variant={row.variant}>{row.text}</Badge>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Source</p>
          <Badge variant="gray">{sourceLabel(capa.source)}</Badge>
        </div>
        {capa.findingId && (
          <div>
            <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Linked finding</p>
            <button type="button" onClick={() => onNavigateGap(capa.findingId!)} className="flex items-center gap-1.5 text-[12px] text-[#0ea5e9] hover:underline bg-transparent border-none cursor-pointer p-0">
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{capa.findingId}
            </button>
          </div>
        )}
      </div>

      {capa.diGate && (() => {
        const diOpen = capa.diGateStatus !== "cleared";
        return (
          <div className={clsx("flex items-start gap-2 p-3 rounded-lg text-[12px] border", diOpen ? (isDark ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border-[#fca5a5]") : (isDark ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.2)]" : "bg-[#f0fdf4] border-[#a7f3d0]"))}>
            {diOpen ? <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
              <span className="font-semibold block" style={{ color: diOpen ? "#ef4444" : "#10b981" }}>
                {diOpen ? "DI gate required" : "DI gate cleared"}
              </span>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {diOpen ? "Data integrity review must be completed before QA can close — use Edit to clear" : "CAPA can proceed to QA review"}
              </p>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Owner</p>
          <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{ownerName}</p>
        </div>
        <div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Due</p>
          <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{dayjs.utc(capa.dueDate).tz(timezone).format(dateFormat)}</p>
        </div>
        {capa.createdAt && (
          <div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Created</p>
            <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{dayjs.utc(capa.createdAt).fromNow()}</p>
          </div>
        )}
      </div>

      {/* Substage 4.8 — Linked Change Controls. Inline section in the
       *  Overview body so the linkage is discoverable without opening a
       *  separate tab. */}
      <LinkedChangeControlsSection capa={capa} />

      {/* Audit trail — collapsed placeholder. Per-record audit log loading
       *  is deferred; today the full tenant audit log lives at Governance >
       *  Audit log. This <details> is rendered closed by default and serves
       *  as a discoverable pointer until the per-record query exists. */}
      <details className="rounded-lg border" style={{ borderColor: "var(--bg-border)" }}>
        <summary className="cursor-pointer px-3 py-2 flex items-center gap-2 text-[12px] font-medium select-none list-none" style={{ color: "var(--text-secondary)" }}>
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          Audit trail
          <span className="ml-auto text-[10px] text-(--text-muted)">click to expand</span>
        </summary>
        <div className="px-3 pb-3 pt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Per-record audit log loading is deferred — see the Governance &gt; Audit log page for the full tenant log filtered to this CAPA.
        </div>
      </details>
    </div>
  );
}
