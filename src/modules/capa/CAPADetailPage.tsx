"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Send, ShieldCheck, AlertTriangle, CheckCircle2, Clock, Link2, Users,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant, normalizeSeverityForDisplay, CAPA_STATUS_VARIANT } from "@/lib/badgeVariants";
import { STATUS_LABEL, isOverdue as isOverdueHelper } from "@/types/capa";
import { displayUserName } from "@/lib/identity-display";
import type { CAPA } from "@/store/capa.slice";
import type { CAPAReadiness } from "@/lib/capa-readiness";
import {
  submitForReview as submitForReviewServer,
  rejectCAPA as rejectCAPAServer,
  signAndCloseCAPA as signAndCloseCAPAServer,
  updateCAPA as updateCAPAServer,
  startCAPAProgress as startCAPAProgressServer,
} from "@/actions/capas";
import { OverviewBody } from "./modals/sections/OverviewBody";
import { RcaBody } from "./modals/sections/RcaBody";
import { ActionsPanel } from "./tabs/ActionsPanel";
import { EvidenceCollectionPanel } from "./tabs/EvidenceCollectionPanel";
import { EffectivenessCriteriaPanel } from "./tabs/EffectivenessCriteriaPanel";
import { SubmissionChecklist } from "./modals/components/SubmissionChecklist";
import { SignCloseModal } from "./modals/SignCloseModal";
import { EditCAPAModal, type EditForm } from "./modals/EditCAPAModal";
import { getNextStep, type DetailSubTab } from "./modals/helpers/getNextStep";

const SOURCE_LABEL: Record<string, string> = {
  "483": "FDA 483 Observation", "Gap Assessment": "Gap Assessment Finding", Deviation: "Deviation Report",
  "Internal Audit": "Internal Audit", Complaint: "Complaint", OOS: "OOS", "Change Control": "Change Control",
};

export interface CAPADetailPageProps {
  capa: CAPA;
  /** Server-computed readiness (full inputs) — drives the in_progress banner. */
  readiness: CAPAReadiness;
  evidence: { resolved: number; total: number };
  criteriaCount: number;
}

export function CAPADetailPage({ capa, readiness, evidence, criteriaCount }: CAPADetailPageProps) {
  const router = useRouter();
  const { canSign, canCloseCapa, isViewOnly } = useRole();
  const capaCan = usePermissions("capa", { capaRisk: capa.risk });
  const { isQAHead } = usePermissions();
  const complianceUsers = useComplianceUsers();
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  const currentUser = useAppSelector((s) => s.auth.user);

  const [activeTab, setActiveTab] = useState<DetailSubTab>("overview");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reworkIds, setReworkIds] = useState<string[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const actionItems = capa.actionItems ?? [];
  const liveActions = actionItems.filter((a) => a.status !== "skipped");
  const doneActions = actionItems.filter((a) => a.status === "complete" || a.status === "skipped").length;
  const reworkCount = actionItems.filter((a) => a.status === "rework" || a.reworkReason).length;
  const reference = capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`;

  const isAuthor = capaCan.canEdit; // COMPLIANCE_AUTHOR_ROLES mirror
  const isDriver = !isViewOnly && !!capa.owner && capa.owner === currentUser?.id;
  const editAllowed = !isViewOnly && capa.status !== "closed" && capaCan.canEdit;

  // People pills — distinct contributors (driver + action owners).
  const contributors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; rework: boolean; driver: boolean }>();
    if (capa.owner) map.set(capa.owner, { id: capa.owner, name: displayUserName(capa.owner, users), count: 0, rework: false, driver: true });
    for (const a of actionItems) {
      if (!a.ownerId) continue;
      const e = map.get(a.ownerId) ?? { id: a.ownerId, name: displayUserName(a.ownerId, users), count: 0, rework: false, driver: false };
      e.count += 1;
      if (a.status === "rework" || a.reworkReason) e.rework = true;
      map.set(a.ownerId, e);
    }
    return [...map.values()];
  }, [capa.owner, actionItems, users]);

  const filterActive = selectedPerson !== null;
  const filteredPersonName = filterActive ? (contributors.find((c) => c.id === selectedPerson)?.name ?? "user") : "";
  const personActionCount = filterActive ? actionItems.filter((a) => a.ownerId === selectedPerson).length : 0;

  const nextStep = getNextStep({
    capa, readiness, timezone, dateFormat,
    onChangeTab: setActiveTab, onSubmitForReview: () => void handleSubmit(),
  });

  function clearFilter() { setSelectedPerson(null); }

  async function handleSubmit() {
    clearFilter();
    setBusy(true); setErrorMsg("");
    const res = await submitForReviewServer(capa.id);
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Submit failed"); return; }
    setOkMsg("Submitted for QA review."); router.refresh();
  }

  async function handleReject() {
    if (rejectReason.trim().length < 5) { setErrorMsg("Rejection reason must be at least 5 characters."); return; }
    clearFilter();
    setBusy(true); setErrorMsg("");
    const res = await rejectCAPAServer(capa.id, { reason: rejectReason.trim(), reworkItems: reworkIds });
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Reject failed"); return; }
    setRejectOpen(false); setRejectReason(""); setReworkIds([]);
    setOkMsg("Returned for rework."); router.refresh();
  }

  async function handleSignClose(data: { meaning: string; password: string }) {
    clearFilter();
    setSignBusy(true); setSignError(null);
    const res = await signAndCloseCAPAServer(capa.id, { password: data.password, signatureMeaning: data.meaning });
    setSignBusy(false);
    if (!res.success) { setSignError(res.error || "Sign & close failed."); return; }
    setSignOpen(false); setOkMsg("CAPA signed and closed."); router.refresh();
  }

  function handleEditSave(data: EditForm) {
    const autoAdvance = capa.status === "open" && !!data.rca?.trim();
    setBusy(true); setErrorMsg("");
    void (async () => {
      const res = await updateCAPAServer(capa.id, {
        description: data.description, owner: data.owner, dueDate: data.dueDate,
        risk: data.risk as never, rcaMethod: (data.rcaMethod as string) || undefined, rca: data.rca ?? "",
      });
      if (!res.success) { setBusy(false); setErrorMsg(res.error || "Save failed"); return; }
      if (autoAdvance) await startCAPAProgressServer(capa.id);
      setBusy(false); setEditOpen(false); setOkMsg("CAPA updated."); router.refresh();
    })();
  }

  const TONE_BG: Record<string, string> = { warning: "var(--warning-bg)", info: "var(--info-bg)", success: "var(--success-bg)" };

  // ── Status-morphing banner ──
  function renderBanner() {
    if (capa.status === "in_progress" || capa.status === "open") {
      const canSubmit = isDriver || isAuthor;
      return (
        <div className="rounded-lg border p-3 mb-4" style={{ background: TONE_BG[nextStep.tone], borderColor: "var(--brand-border)" }}>
          {capa.rejectionReason && (
            <div className="alert mb-2 flex items-start gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger)" }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <span className="text-[11px]" style={{ color: "var(--danger)" }}><strong>QA returned this CAPA:</strong> {capa.rejectionReason}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Readiness: {readiness.conditions.filter((c) => c.met).length} of {readiness.conditions.length}
                {readiness.allMet ? " — ready to submit" : ` — next: ${nextStep.title}`}
              </p>
              <button type="button" onClick={() => setChecklistOpen((v) => !v)} className="text-[11px] underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
                {checklistOpen ? "Hide checklist" : "Show checklist"}
              </button>
            </div>
            {canSubmit && (
              <Button variant="primary" size="sm" icon={Send} disabled={!readiness.allMet || busy} loading={busy}
                onClick={() => void handleSubmit()} title={readiness.allMet ? "Submit for QA review" : "Resolve all readiness conditions first"}>
                Submit for review
              </Button>
            )}
          </div>
          {checklistOpen && <div className="mt-2"><SubmissionChecklist conditions={readiness.conditions} onChangeTab={setActiveTab} /></div>}
        </div>
      );
    }
    if (capa.status === "pending_qa_review") {
      return (
        <div className="rounded-lg border p-3 mb-4" style={{ background: "var(--info-bg)", borderColor: "var(--brand-border)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
              <Clock className="w-4 h-4" aria-hidden="true" /> Awaiting QA review — approvals recorded on the Action Plans tab.
            </p>
            <div className="flex gap-2">
              {capaCan.canApprove && (
                <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setActiveTab("actions")}>Record approval</Button>
              )}
              {isQAHead && (
                <Button variant="danger" size="sm" icon={AlertTriangle} onClick={() => { clearFilter(); setRejectOpen(true); }}>Reject</Button>
              )}
              {canSign && canCloseCapa && (
                <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => { clearFilter(); setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (capa.status === "pending_verification") {
      return (
        <div className="rounded-lg border p-3 mb-4" style={{ background: "var(--info-bg)", borderColor: "var(--brand-border)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              {capa.verifiedAt ? "Verified — ready for sign & close." : "Awaiting independent QA verification (Action Plans tab)."}
            </p>
            <div className="flex gap-2">
              {capaCan.canApprove && !capa.verifiedAt && (
                <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setActiveTab("actions")}>Verify</Button>
              )}
              {canSign && canCloseCapa && (
                <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => { clearFilter(); setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
              )}
            </div>
          </div>
        </div>
      );
    }
    // closed
    return (
      <div className="rounded-lg border p-3 mb-4" style={{ background: "var(--success-bg)", borderColor: "var(--success)" }}>
        <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--success)" }}>
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Closed{capa.closedAt ? ` on ${dayjs.utc(capa.closedAt).tz(timezone).format(dateFormat)}` : ""}.
        </p>
        {capa.effectivenessCheck && capa.effectivenessDate && (
          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            90-day effectiveness check due {dayjs.utc(capa.effectivenessDate).tz(timezone).format(dateFormat)}
            {capa.effectivenessVerdict ? ` — verdict: ${capa.effectivenessVerdict}` : " — review on the Effectiveness Criteria tab."}
          </p>
        )}
      </div>
    );
  }

  const rcaState = capa.rcaApproved === true ? "✓" : "⚠";
  const tabs: { id: DetailSubTab; label: string; badge: string | null }[] = [
    { id: "overview", label: "Overview", badge: null },
    { id: "rca", label: "RCA", badge: rcaState },
    { id: "actions", label: "Action Plans", badge: filterActive ? `${personActionCount} of ${liveActions.length}` : (liveActions.length ? `${doneActions}/${actionItems.length}` : null) },
    { id: "evidence", label: "Evidence", badge: `${evidence.resolved}/${evidence.total}` },
    { id: "criteria", label: "Effectiveness Criteria", badge: criteriaCount ? String(criteriaCount) : null },
  ];

  const noneOfTheirs = (
    <p className="text-[12px] italic p-4" style={{ color: "var(--text-muted)" }}>(none of theirs) — clear the person filter to see this tab.</p>
  );

  return (
    <main className="w-full max-w-4xl mx-auto p-5">
      <button type="button" onClick={() => router.push("/capa")} className="text-[12px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer mb-3" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to CAPA Tracker
      </button>

      {/* ── HEADER ── */}
      <header className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{reference}</span>
          <Badge variant={getSeverityVariant(capa.risk, "generic")}>{normalizeSeverityForDisplay(capa.risk, "generic") ?? capa.risk}</Badge>
          <Badge variant={CAPA_STATUS_VARIANT[capa.status]}>{STATUS_LABEL[capa.status]}</Badge>
          {isOverdueHelper(capa) && <Badge variant="red">Overdue</Badge>}
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>CAPA due {dayjs.utc(capa.dueDate).tz(timezone).format(dateFormat)}</span>
          {capa.findingId && (
            <button type="button" onClick={() => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(capa.findingId!)}`)} className="text-[11px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer" style={{ color: "#0ea5e9" }}>
              <Link2 className="w-3 h-3" aria-hidden="true" /> {SOURCE_LABEL[capa.source] ?? capa.source}
            </button>
          )}
          {editAllowed && (
            <button type="button" onClick={() => setEditOpen(true)} className="ml-auto text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-transparent cursor-pointer" style={{ color: "var(--brand)", borderColor: "var(--brand-border)" }}>
              <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
            </button>
          )}
        </div>
        <h1 className="text-[16px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{capa.description}</h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Author: {capa.createdBy ?? "—"} <span aria-hidden="true">·</span> Assigned to: {capa.owner ? displayUserName(capa.owner, users) : displayUserName(capa.owner, users)}
        </p>
      </header>

      {/* ── BANNER ── */}
      {renderBanner()}

      {/* ── METRICS strip ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] mb-4 pb-3 border-b" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)" }}>
        <span>Actions <strong style={{ color: "var(--text-primary)" }}>{doneActions}/{actionItems.length}</strong></span>
        <span>Evidence <strong style={{ color: "var(--text-primary)" }}>{evidence.resolved}/{evidence.total}</strong></span>
        <span>RCA <strong style={{ color: capa.rcaApproved === true ? "var(--success)" : "var(--warning)" }}>{capa.rcaApproved === true ? "approved" : capa.rcaApproved === false ? "rejected" : "unreviewed"}</strong></span>
        <span>Criteria <strong style={{ color: "var(--text-primary)" }}>{criteriaCount}</strong></span>
        <span>Rework <strong style={{ color: reworkCount > 0 ? "var(--danger)" : "var(--text-primary)" }}>{reworkCount}</strong></span>
      </div>

      {/* ── PEOPLE PILLS ── */}
      {contributors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Users className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          {contributors.map((c) => (
            <button key={c.id} type="button"
              onClick={() => setSelectedPerson((prev) => (prev === c.id ? null : c.id))}
              className="text-[11px] px-2 py-0.5 rounded-full border cursor-pointer"
              style={selectedPerson === c.id
                ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                : { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--bg-border)" }}>
              {c.name} {c.count}{c.driver ? " ·drv" : ""}{c.rework ? " [R]" : ""}
            </button>
          ))}
        </div>
      )}

      {/* ── Loud person-filter banner ── */}
      {filterActive && (
        <div className="alert mb-3 flex items-center justify-between gap-2" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <span className="text-[12px]" style={{ color: "var(--warning)" }}>
            Showing <strong>{filteredPersonName}</strong> only — other tabs hidden while filtered.
          </span>
          <Button variant="secondary" size="xs" onClick={clearFilter}>Everyone</Button>
        </div>
      )}

      {/* ── TABS ── */}
      <div role="tablist" aria-label="CAPA detail sections" className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--bg-border)" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id
              ? "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-medium"
              : "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-normal"}
            style={activeTab === t.id ? { borderBottomColor: "var(--brand)", color: "var(--text-primary)" } : { borderBottomColor: "transparent", color: "var(--text-secondary)" }}>
            {t.label}
            {t.badge && <span className="inline-flex items-center justify-center text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewBody capa={capa} isDark={isDark} users={users} timezone={timezone} dateFormat={dateFormat}
          showMigrationNotice={false} onDismissNotice={() => undefined}
          onNavigateGap={(fid) => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(fid)}`)}
          onChangeTab={setActiveTab} onEditOpen={() => setEditOpen(true)} editAllowed={editAllowed}
          readinessConditions={readiness.conditions} />
      )}
      {activeTab === "rca" && (filterActive ? noneOfTheirs : <RcaBody capa={capa} />)}
      {activeTab === "actions" && (
        <ActionsPanel capa={capa} isDark={isDark} actionLines={[]} users={users} dateFormat={dateFormat}
          canSign={canSign && capaCan.canSign} canCloseCapa={canCloseCapa && capaCan.canSign}
          isOwner={currentUser?.id === capa.owner || isDriver}
          onSubmitForReview={() => void handleSubmit()}
          onSignOpen={() => { clearFilter(); setSignError(null); setSignOpen(true); }}
          onAlignmentChange={() => router.refresh()}
          hideLifecycleButtons ownerFilter={selectedPerson} />
      )}
      {activeTab === "evidence" && (filterActive ? noneOfTheirs : (
        <EvidenceCollectionPanel capaId={capa.id} readOnly={isViewOnly || capa.status === "closed"} />
      ))}
      {activeTab === "criteria" && (filterActive ? noneOfTheirs : (
        <EffectivenessCriteriaPanel capaId={capa.id} capaStatus={capa.status} readOnly={isViewOnly || capa.status === "closed"} />
      ))}

      {/* ── Targeted reject dialog ── */}
      {rejectOpen && (
        <Modal open onClose={() => setRejectOpen(false)} title="Return CAPA for rework">
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            The CAPA returns to <strong>in progress</strong>. Select the action items to send back for rework (optional).
          </p>
          <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder="Rejection reason (≥ 5 chars) — what must be fixed?"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={2000} />
          <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
            {actionItems.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={reworkIds.includes(a.id)}
                  onChange={(e) => setReworkIds((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))} />
                <span>#{a.sequence} {a.description} <span style={{ color: "var(--text-muted)" }}>· {displayUserName(a.ownerId ?? a.owner, users)}</span></span>
              </label>
            ))}
            {actionItems.length === 0 && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No action items to flag.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" size="sm" disabled={busy || rejectReason.trim().length < 5} loading={busy} onClick={() => void handleReject()}>Return for rework</Button>
          </div>
        </Modal>
      )}

      <SignCloseModal isOpen={signOpen} onClose={() => { setSignOpen(false); setSignError(null); }} onSign={handleSignClose} capa={capa} error={signError} busy={signBusy} />
      <EditCAPAModal isOpen={editOpen} onClose={() => setEditOpen(false)} onSave={handleEditSave} capa={capa} users={complianceUsers} />

      <Popup isOpen={!!okMsg} variant="success" title="Done" description={okMsg} onDismiss={() => setOkMsg("")} />
      <Popup isOpen={!!errorMsg} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorMsg("")} />
    </main>
  );
}
