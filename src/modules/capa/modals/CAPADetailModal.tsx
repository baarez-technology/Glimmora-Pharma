"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Clock, FileText,
  Link2, Pencil, Send, ShieldCheck, TrendingUp, X,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useRole } from "@/hooks/useRole";
import { EvidenceCollectionPanel } from "../tabs/EvidenceCollectionPanel";
import { CAPA_RISK_VARIANT as RISK_VARIANT, CAPA_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/badgeVariants";
import type { CAPA } from "@/store/capa.slice";
import type { AuthUser } from "@/store/auth.slice";
import type { UserConfig } from "@/store/settings.slice";

// LocalStorage key for the "evidence files moved" one-time notice. Per-user
// dismissal — the key is global because the notice itself is identical
// across CAPAs and tenants. If the explanation copy ever changes
// materially (e.g. a re-org of categories), bump the key suffix so the
// notice re-shows.
const MIGRATION_NOTICE_KEY = "capa-evidence-tab-notice-dismissed-v1";

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

type DetailSubTab = "overview" | "evidence" | "rca" | "actions";

interface EvidenceCounts {
  complete: number;
  inProgress: number;
  pending: number;
  total: number;
}

export interface CAPADetailModalProps {
  capa: CAPA;
  isDark: boolean;
  user: AuthUser | null;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  onClose: () => void;
  onEditOpen: () => void;
  onSignOpen: () => void;
  onSubmitForReview: (id: string) => void;
  onNavigateGap: (findingId: string) => void;
}

export function CAPADetailModal({
  capa, isDark, user, users, timezone, dateFormat,
  onClose, onEditOpen, onSignOpen, onSubmitForReview, onNavigateGap,
}: CAPADetailModalProps) {
  const { canSign, canCloseCapa, isViewOnly } = useRole();
  const [activeTab, setActiveTab] = useState<DetailSubTab>("overview");
  const [evidenceCounts, setEvidenceCounts] = useState<EvidenceCounts | null>(null);
  // null = unread (don't render the notice until we know either way, avoids
  // a show→hide flash on first paint). true = dismissed previously. false =
  // not yet dismissed → show.
  const [migrationDismissed, setMigrationDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setActiveTab("overview");
    setEvidenceCounts(null);
  }, [capa.id]);

  useEffect(() => {
    try {
      setMigrationDismissed(localStorage.getItem(MIGRATION_NOTICE_KEY) === "1");
    } catch {
      // private mode / quota — treat as dismissed so we don't pester
      setMigrationDismissed(true);
    }
  }, []);

  function dismissNotice() {
    setMigrationDismissed(true);
    try { localStorage.setItem(MIGRATION_NOTICE_KEY, "1"); } catch { /* ignore */ }
  }

  const referenceDisplay = capa.reference ?? capa.id;
  const ownerName = users.find((u) => u.id === capa.owner)?.name ?? capa.owner;
  const dueText = dayjs.utc(capa.dueDate).tz(timezone).format(dateFormat);
  const isOverdue = capa.status !== "Closed" && capa.dueDate
    ? dayjs.utc(capa.dueDate).isBefore(dayjs())
    : false;
  const editAllowed = !isViewOnly && capa.status !== "Closed";
  const closeReadOnly = isViewOnly || capa.status === "Closed";

  const evidenceBadge = evidenceCounts ? `${evidenceCounts.complete}/${evidenceCounts.total}` : null;
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;
  const actionLines = (capa.correctiveActions ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const actionsBadge = actionLines.length > 0 ? String(actionLines.length) : null;

  const tabs: { id: DetailSubTab; label: string; badge: string | null }[] = [
    { id: "overview", label: "Overview", badge: null },
    { id: "evidence", label: "Evidence", badge: evidenceBadge },
    { id: "rca", label: "RCA", badge: hasRca ? "✓" : null },
    { id: "actions", label: "Actions", badge: actionsBadge },
  ];

  const header = (
    <div className="px-5 pt-4 pb-3 border-b border-(--bg-border)">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-mono text-[12px] font-semibold text-(--text-primary)">{referenceDisplay}</span>
          <Badge variant={RISK_VARIANT[capa.risk]}>{capa.risk}</Badge>
          <Badge variant={STATUS_VARIANT[capa.status]}>{capa.status}</Badge>
          {isOverdue && <Badge variant="red">Overdue</Badge>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editAllowed && (
            <button
              type="button"
              onClick={onEditOpen}
              aria-label={`Edit ${referenceDisplay}`}
              className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150"
            >
              <Pencil className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[15px] font-medium text-(--text-primary) leading-tight line-clamp-2">{capa.description}</p>
      <p className="mt-1.5 text-[12px] text-(--text-secondary)">
        {sourceLabel(capa.source)} <span aria-hidden="true">·</span> {ownerName} <span aria-hidden="true">·</span> Due {dueText}
      </p>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`CAPA ${referenceDisplay}`} header={header} className="max-w-2xl">
      <div role="tablist" aria-label="CAPA detail sections" className="flex gap-1 mb-4 border-b border-(--bg-border)">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`subtab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`subpanel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer outline-none transition-colors duration-150",
              activeTab === t.id
                ? "font-medium border-b-(--brand) text-(--text-primary)"
                : "font-normal border-b-transparent text-(--text-secondary) hover:text-(--text-primary)",
            )}
          >
            {t.label}
            {t.badge && (
              <span className="inline-flex items-center justify-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-elevated) text-(--text-muted) min-w-[18px]">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewBody
          capa={capa}
          isDark={isDark}
          users={users}
          timezone={timezone}
          dateFormat={dateFormat}
          showMigrationNotice={migrationDismissed === false}
          onDismissNotice={dismissNotice}
          onNavigateGap={onNavigateGap}
        />
      )}
      {activeTab === "evidence" && (
        <div role="tabpanel" id="subpanel-evidence" aria-labelledby="subtab-evidence" tabIndex={0}>
          <EvidenceCollectionPanel
            capaId={capa.id}
            readOnly={closeReadOnly}
            onCountsChange={setEvidenceCounts}
          />
        </div>
      )}
      {activeTab === "rca" && <RcaBody capa={capa} isDark={isDark} />}
      {activeTab === "actions" && (
        <ActionsBody
          capa={capa}
          isDark={isDark}
          actionLines={actionLines}
          users={users}
          dateFormat={dateFormat}
          canSign={canSign}
          canCloseCapa={canCloseCapa}
          isOwner={user?.id === capa.owner}
          onSubmitForReview={() => onSubmitForReview(capa.id)}
          onSignOpen={onSignOpen}
        />
      )}
    </Modal>
  );
}

// ── Tab bodies ──────────────────────────────────────────────────────────

interface OverviewBodyProps {
  capa: CAPA;
  isDark: boolean;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  showMigrationNotice: boolean;
  onDismissNotice: () => void;
  onNavigateGap: (findingId: string) => void;
}

function OverviewBody({ capa, isDark, users, timezone, dateFormat, showMigrationNotice, onDismissNotice, onNavigateGap }: OverviewBodyProps) {
  const ownerName = users.find((u) => u.id === capa.owner)?.name ?? capa.owner;
  const baseVariant = RISK_VARIANT[capa.risk];
  const riskLevel = capa.risk === "Critical" ? "Critical" : capa.risk === "High" ? "High" : "Low";
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;

  return (
    <div role="tabpanel" id="subpanel-overview" aria-labelledby="subtab-overview" tabIndex={0} className="space-y-4">
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

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Description</h3>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{capa.description}</p>
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

      {!hasRca && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-medium text-[#f59e0b]">RCA not yet documented</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Open the RCA tab to add root cause analysis.</p>
          </div>
        </div>
      )}

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

function RcaBody({ capa, isDark }: { capa: CAPA; isDark: boolean }) {
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;
  return (
    <div role="tabpanel" id="subpanel-rca" aria-labelledby="subtab-rca" tabIndex={0} className="space-y-3">
      {capa.rcaMethod && (
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Method:</span>
          <Badge variant="purple">{capa.rcaMethod}</Badge>
        </div>
      )}
      {hasRca ? (
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{capa.rca}</p>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-medium text-[#f59e0b]">RCA not yet documented</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Use Edit to add root cause analysis (5 Whys, Fishbone, Fault Tree).</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionsBodyProps {
  capa: CAPA;
  isDark: boolean;
  actionLines: string[];
  users: UserConfig[];
  dateFormat: string;
  canSign: boolean;
  canCloseCapa: boolean;
  isOwner: boolean;
  onSubmitForReview: () => void;
  onSignOpen: () => void;
}

function ActionsBody({ capa, isDark, actionLines, users, dateFormat, canSign, canCloseCapa, isOwner, onSubmitForReview, onSignOpen }: ActionsBodyProps) {
  const canSubmit = (capa.status === "Open" || capa.status === "In Progress") && (isOwner || canCloseCapa);
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;

  return (
    <div role="tabpanel" id="subpanel-actions" aria-labelledby="subtab-actions" tabIndex={0} className="space-y-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Corrective actions</h3>
        {actionLines.length > 0 ? (
          <ul className="space-y-1.5">
            {actionLines.map((line, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>No corrective actions documented yet. Use Edit to add.</p>
        )}
      </div>

      {capa.effectivenessCheck && capa.status === "Closed" && capa.effectivenessDate && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <TrendingUp className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
          <span>Effectiveness check: {dayjs.utc(capa.effectivenessDate).format(dateFormat)}</span>
        </div>
      )}

      {canSubmit && (
        hasRca ? (
          <Button variant="secondary" icon={Send} fullWidth onClick={onSubmitForReview}>Submit for QA review</Button>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
            <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-[#f59e0b]">RCA required to submit</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Add root cause analysis on the RCA tab before submitting for QA review.</p>
            </div>
          </div>
        )
      )}

      {canSign && canCloseCapa && capa.status === "Pending QA Review" && (
        <Button variant="primary" icon={ShieldCheck} fullWidth onClick={onSignOpen}>Sign &amp; Close CAPA</Button>
      )}

      {capa.status === "Closed" && capa.closedBy && (
        <div className="flex items-center gap-2 text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
          <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" aria-hidden="true" />
          <span>
            Closed by <span style={{ color: "var(--text-secondary)" }}>{users.find((u) => u.id === capa.closedBy)?.name ?? capa.closedBy}</span>
            {capa.closedAt && <> on {dayjs.utc(capa.closedAt).format(dateFormat)}</>}
          </span>
        </div>
      )}
    </div>
  );
}
