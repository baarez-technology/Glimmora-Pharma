"use client";

import { useEffect, useState } from "react";
// CHANGE CONTROL HIDDEN — ShieldAlert dropped because its only consumer
// (the "Implemented with override" badge below) is commented out. To
// re-enable, restore `ShieldAlert` to this import and uncomment the
// badge JSX a few lines below.
import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useRole } from "@/hooks/useRole";
import { EvidenceCollectionPanel } from "../tabs/EvidenceCollectionPanel";
import { EffectivenessCriteriaPanel } from "../tabs/EffectivenessCriteriaPanel";
import { ActionsPanel } from "../tabs/ActionsPanel";
import { CAPA_RISK_VARIANT as RISK_VARIANT, CAPA_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/badgeVariants";
import { isOverdue as isOverdueHelper, STATUS_LABEL } from "@/types/capa";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";
import type { AuthUser } from "@/store/auth.slice";
import type { UserConfig } from "@/store/settings.slice";
import { OverviewBody } from "./sections/OverviewBody";
import { RcaBody } from "./sections/RcaBody";
import { NextStepBanner } from "./components/NextStepBanner";
import { getNextStep, type DetailSubTab } from "./helpers/getNextStep";

/* ── CAPA detail modal shell ──
 *
 * Renders the modal frame, header, tab bar, and dispatches to per-tab
 * bodies. Each body lives in its own file under sections/ + components/
 * + helpers/. Cross-tab state (active tab, evidence/criteria counts,
 * migration-notice dismissal, derived submission readiness) lives here
 * in the shell so the next-step banner and submission checklist can
 * reflect the same single source of truth.
 */

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
  /** Substage 6.4 — accepts an optional CC-block override threaded from
   *  ActionsPanel's pre-flight gate. */
  onSignOpen: (override?: { reason: string }) => void;
  onSubmitForReview: (id: string) => void;
  onNavigateGap: (findingId: string) => void;
}

export function CAPADetailModal({
  capa, isDark, user, users, timezone, dateFormat,
  onClose, onEditOpen, onSignOpen, onSubmitForReview, onNavigateGap,
}: CAPADetailModalProps) {
  const { canSign, canCloseCapa, isViewOnly } = useRole();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DetailSubTab>("overview");
  const [evidenceCounts, setEvidenceCounts] = useState<EvidenceCounts | null>(null);
  const [criteriaCount, setCriteriaCount] = useState<number | null>(null);
  // null = unread (don't render the notice until we know either way, avoids
  // a show→hide flash on first paint). true = dismissed previously. false =
  // not yet dismissed → show.
  const [migrationDismissed, setMigrationDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setActiveTab("overview");
    setEvidenceCounts(null);
    setCriteriaCount(null);
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

  // Reference display: prefer the per-tenant CAPA-YYYY-NNN reference;
  // for legacy rows that pre-date the reference column (or any row whose
  // reference is null for any reason), fall back to "CAPA-LEGACY-<8>" so
  // the header never exposes a raw cuid to operators. The cuid is still
  // used as the modal title for screen readers + browser title-bar.
  const referenceDisplay =
    capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`;
  const descriptionText = (capa.description ?? "").trim();
  const hasDescription = descriptionText.length > 0;
  const truncatedDescription =
    descriptionText.length > 80
      ? `${descriptionText.slice(0, 80).trimEnd()}…`
      : descriptionText;
  const ownerName = users.find((u) => u.id === capa.owner)?.name ?? capa.owner;
  const dueText = dayjs.utc(capa.dueDate).tz(timezone).format(dateFormat);
  const overdue = isOverdueHelper(capa);
  const editAllowed = !isViewOnly && capa.status !== "closed";
  const closeReadOnly = isViewOnly || capa.status === "closed";

  const evidenceBadge = evidenceCounts ? `${evidenceCounts.complete}/${evidenceCounts.total}` : null;
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;
  const actionLines = (capa.correctiveActions ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const hasActions = actionLines.length > 0;
  const actionsBadge = hasActions ? String(actionLines.length) : null;

  const criteriaBadge = criteriaCount !== null ? String(criteriaCount) : null;
  // 20-char minimum mirrors the Submission checklist threshold so a CAPA
  // with a one-word description still nudges the user to expand it before
  // submission. The header itself shows whatever was typed (truncated).
  const hasMeaningfulDescription = descriptionText.length >= 20;
  const hasCriteria = criteriaCount !== null && criteriaCount > 0;
  const hasAlignment = Boolean(capa.alignmentStatus);

  // Lifted from OverviewBody so the next-step banner can render above
  // EVERY tab body, not just Overview. The banner becomes a persistent
  // guide instead of disappearing when the user clicks away from Overview.
  const nextStep = getNextStep({
    capa,
    hasDescription: hasMeaningfulDescription,
    hasRca,
    hasActions,
    hasCriteria,
    hasAlignment,
    timezone,
    dateFormat,
    onChangeTab: setActiveTab,
    onSubmitForReview: () => onSubmitForReview(capa.id),
  });

  const tabs: { id: DetailSubTab; label: string; badge: string | null }[] = [
    { id: "overview", label: "Overview", badge: null },
    { id: "evidence", label: "Evidence", badge: evidenceBadge },
    { id: "rca", label: "RCA", badge: hasRca ? "✓" : null },
    { id: "actions", label: "Actions", badge: actionsBadge },
    { id: "criteria", label: "Effectiveness Criteria", badge: criteriaBadge },
  ];

  const header = (
    <div className="px-5 pt-4 pb-3 border-b border-(--bg-border)">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Reference: monospace, secondary text colour — the human-
              readable per-tenant identifier (CAPA-YYYY-NNN) replaces the
              raw cuid that used to render here. */}
          <span className="font-mono text-[12px] text-(--text-secondary)">{referenceDisplay}</span>
          <Badge variant={RISK_VARIANT[capa.risk]}>{capa.risk}</Badge>
          <Badge variant={STATUS_VARIANT[capa.status]}>{STATUS_LABEL[capa.status]}</Badge>
          {overdue && <Badge variant="red">Overdue</Badge>}
          {/* CHANGE CONTROL HIDDEN — "Implemented with override" badge
              suppressed alongside the rest of the CC user-facing surface.
              `capa.ccBlockOverrideReason` is still written to by legacy
              closures; the column stays in the schema. To re-enable,
              uncomment this block and re-add `ShieldAlert` to the
              lucide-react import above.
          {capa.ccBlockOverrideReason && (
            <Badge variant="amber">
              <ShieldAlert className="w-3 h-3 inline mr-0.5" aria-hidden="true" />
              Implemented with override
            </Badge>
          )}
          */}
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
      {/* Description acts as the visual heading. Truncated to ~80 chars
          so a runaway description doesn't push the tab strip off-screen.
          Empty descriptions show italic placeholder text rather than
          collapsing into invisible whitespace — the latter made the
          modal look broken when the user opened a CAPA they hadn't
          edited yet. */}
      {hasDescription ? (
        <h2
          className="mt-2 text-[15px] font-medium text-(--text-primary) leading-tight line-clamp-2"
          title={descriptionText}
        >
          {truncatedDescription}
        </h2>
      ) : (
        <p className="mt-2 text-[15px] italic text-(--text-secondary) leading-tight">
          Untitled CAPA — click Edit to add description
        </p>
      )}
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
            className={
              activeTab === t.id
                ? "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer outline-none transition-colors duration-150 font-medium border-b-(--brand) text-(--text-primary)"
                : "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer outline-none transition-colors duration-150 font-normal border-b-transparent text-(--text-secondary) hover:text-(--text-primary)"
            }
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

      {/* Sticky Next-step banner — rendered above every tab body so the
          guidance follows the user as they navigate. Consumers (the
          OverviewBody for instance) no longer render their own copy. */}
      <NextStepBanner nextStep={nextStep} currentTab={activeTab} />

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
          onChangeTab={setActiveTab}
          onEditOpen={onEditOpen}
          editAllowed={editAllowed}
          hasMeaningfulDescription={hasMeaningfulDescription}
          hasRca={hasRca}
          hasActions={hasActions}
          hasCriteria={hasCriteria}
          hasAlignment={hasAlignment}
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
      {activeTab === "rca" && <RcaBody capa={capa} />}
      {activeTab === "actions" && (
        <ActionsPanel
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
          onAlignmentChange={() => router.refresh()}
        />
      )}
      {activeTab === "criteria" && (
        <EffectivenessCriteriaPanel
          capaId={capa.id}
          capaStatus={capa.status}
          readOnly={closeReadOnly}
          onCountChange={setCriteriaCount}
        />
      )}
    </Modal>
  );
}
