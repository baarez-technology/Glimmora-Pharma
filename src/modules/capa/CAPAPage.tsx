"use client";
import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ClipboardCheck, GitBranch, BarChart3, Plus, Search,
  AlertTriangle, CheckCircle2, TrendingUp, Wrench, Shield, MessageSquare, RotateCcw,
} from "lucide-react";
import type { CAPA as PrismaCAPA } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  setCAPAs,
  addCAPA,
  updateCAPA as updateCAPAAction, closeCAPA,
  type CAPA, type RCAMethod,
} from "@/store/capa.slice";
import { isOverdue } from "@/types/capa";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { closeFinding } from "@/store/findings.slice";
import { closeObservation } from "@/actions/fda483";
import { auditLog } from "@/lib/audit";
import {
  createCAPA as createCAPAServer,
  updateCAPA as updateCAPAServer,
  submitForReview as submitForReviewServer,
  signAndCloseCAPA as signAndCloseCAPAServer,
  startCAPAProgress as startCAPAProgressServer,
  reopenCAPA as reopenCAPAServer,
} from "@/actions/capas";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import { StatusGuide } from "@/components/shared";
import { CAPA_STATUSES } from "@/constants/statusTaxonomy";

import { QMSBlueprintTab } from "./tabs/QMSBlueprintTab";
import { CAPATrackerTab } from "./tabs/CAPATrackerTab";
import { CAPAMetricsTab } from "./tabs/CAPAMetricsTab";
import { AddCAPAModal, type CAPAForm } from "./modals/AddCAPAModal";
import { EditCAPAModal, type EditForm } from "./modals/EditCAPAModal";
import { SignCloseModal } from "./modals/SignCloseModal";
import { AIGenerateCAPAModal, type AICapaResponse, type AICapaForm } from "./modals/AIGenerateCAPAModal";

/* ── Constants ── */

type TabId = "blueprint" | "tracker" | "metrics";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "blueprint", label: "QMS Blueprint", Icon: GitBranch },
  { id: "tracker", label: "CAPA Tracker", Icon: ClipboardCheck },
  { id: "metrics", label: "Metrics", Icon: BarChart3 },
];

const QMS_PROCESSES = [
  { title: "Deviation Management", Icon: AlertTriangle, color: "#f59e0b", sourceKey: "Deviation", targetState: "Risk-based classification within 24h. DI gate check for all deviations. Trend monitoring for recurrence.", currentGap: "Recurrence detection is manual \u2014 AGI deviation intelligence not yet active." },
  { title: "Change Control", Icon: GitBranch, color: "#6366f1", sourceKey: "Change Control", targetState: "Impact assessment before any GMP change. CSV review for system changes. QA approval mandatory.", currentGap: "Change control SOP last reviewed 2023 \u2014 update required for Annex 11 alignment." },
  { title: "Complaint Handling", Icon: MessageSquare, color: "#0ea5e9", sourceKey: "Complaint", targetState: "Complaint triage within 24h. Serious complaints trigger CAPA automatically. Monthly trend analysis.", currentGap: "Complaint data not yet integrated. Manual review process in place." },
];

/* ══════════════════════════════════════ */

interface CAPAPageProps {
  openCapaId?: string;
  /** Server-fetched CAPAs (Prisma rows) — seeded into Redux on mount. */
  capas?: PrismaCAPA[];
}

export function CAPAPage({ openCapaId, capas: serverCAPAs }: CAPAPageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Seed Redux from server-fetched CAPAs on mount / when props change.
  useEffect(() => {
    if (serverCAPAs) {
      dispatch(setCAPAs(serverCAPAs.map(mapCAPAFromPrisma)));
    }
  }, [serverCAPAs, dispatch]);
  const [, startTransition] = useTransition();
  // canSign / canCloseCapa moved into the CAPADetailModal (which calls
  // useRole itself); this page only needs isViewOnly to gate the table's
  // "New CAPA" button + edit affordances at the row level.
  const { isViewOnly } = useRole();
  const { isCustomerAdmin, isSuperAdmin, isQAHead, canCreateCAPAs, isViewer } = usePermissions();
  // RUNG 3D-CAPA — reopening a closed/rejected CAPA is a senior action.
  const canReopen = isQAHead || isCustomerAdmin || isSuperAdmin;
  // AI CAPA is available to anyone except read-only viewers — including
  // customer admins, so they can trigger AI analysis even though the manual
  // "New CAPA" creation flow is reserved for QA-side roles.
  const canUseAiCapa = !isViewer;

  const { capas, fda483Events, tenantId } = useTenantData();
  const { org, users, allSites } = useTenantConfig();
  // For the AI backend, customer_id is the customer admin's aiUserId (the
  // CUST_xxx that was registered at signup). Fall back to the local tenantId
  // only if no admin has been signed up yet — the backend will then 422.
  const aiCustomerId =
    users.find((u) => u.role === "customer_admin" && u.aiUserId)?.aiUserId ??
    tenantId ??
    "";
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("blueprint");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedCAPAId, setSelectedCAPAId] = useState<string | null>(null);
  const selectedCAPA = selectedCAPAId ? capas.find((c) => c.id === selectedCAPAId) ?? null : null;
  const setSelectedCAPA = (c: CAPA | null) => setSelectedCAPAId(c?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSavedPopup, setAiSavedPopup] = useState<string | null>(null);
  const [addedPopup, setAddedPopup] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  // Substage 6.4 — optional CC-block override carried from ActionsPanel's
  // pre-flight gate to signAndCloseCAPA. Stays null on the normal flow
  // (no incomplete linked CCs) so the server-action call shape matches
  // the pre-6.4 behaviour exactly.
  const [pendingCCOverride, setPendingCCOverride] = useState<
    { reason: string } | null
  >(null);
  const [signedPopup, setSignedPopup] = useState(false);
  const [submittedPopup, setSubmittedPopup] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSavedPopup, setEditSavedPopup] = useState(false);
  // Failure surface — paired with the success popups above. Server actions
  // that reject (FORBIDDEN, validation, Part 11 password mismatch, etc.)
  // route through this so users see the real reason rather than a silent
  // console.error masked by a green success popup.
  const [errorMsg, setErrorMsg] = useState("");
  const [errorPopup, setErrorPopup] = useState(false);
  // Inline state for the Sign & Close flow — the SignCloseModal stays
  // open on a server reject and renders signError next to the Sign button,
  // so a wrong-password attempt doesn't close the modal (which would have
  // left Redux mid-update and the user staring at a "Closed" pill).
  const [signError, setSignError] = useState<string | null>(null);
  const [signBusy, setSignBusy] = useState(false);

  /* ── Open from route ── */
  useEffect(() => {
    if (openCapaId) {
      const found = capas.find((c) => c.id === openCapaId);
      // Sync route-prop → local state; intentional setState in effect.
       
      if (found) { setActiveTab("tracker"); setSelectedCAPA(found); }
    }
  }, [openCapaId, capas]);

  /* ── Computed ── */
  const openCAPAs = capas.filter((c) => c.status !== "closed");
  const overdueCAPAs = capas.filter(isOverdue);
  const closedCAPAs = capas.filter((c) => c.status === "closed");

  const noRCACount = capas.filter((c) => c.status !== "closed" && c.status !== "pending_qa_review" && (!c.rca || c.rca.trim().length === 0)).length;
  const criticalOpenCount = capas.filter((c) => c.risk === "Critical" && c.status !== "closed").length;
  const pendingReviewCount = capas.filter((c) => c.status === "pending_qa_review").length;

  const onTimeRate = closedCAPAs.length === 0 ? 0 : Math.round((closedCAPAs.filter((c) => !dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate))).length / closedCAPAs.length) * 100);
  const overdueRate = openCAPAs.length === 0 ? 0 : Math.round((overdueCAPAs.length / openCAPAs.length) * 100);
  const diExceptions = capas.filter((c) => c.diGate && c.status !== "closed").length;
  const effectivenessCount = capas.filter((c) => c.effectivenessCheck).length;

  const riskSignalData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, "month");
      const key = m.format("MMM YYYY");
      const mc = capas.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === key);
      months.push({ month: m.format("MMM"), "483": mc.filter((c) => c.source === "483").length, "Internal Audit": mc.filter((c) => c.source === "Internal Audit").length, Deviation: mc.filter((c) => c.source === "Deviation").length, "Gap Assessment": mc.filter((c) => c.source === "Gap Assessment").length });
    }
    return months;
  }, [capas]);
  const hasTrendData = capas.length > 0;

  const statusDonut = useMemo(() =>
    ([
      { name: "Open", value: capas.filter((c) => c.status === "open").length, fill: "#3B82F6" },
      { name: "In Progress", value: capas.filter((c) => c.status === "in_progress").length, fill: "#F59E0B" },
      { name: "Pending QA", value: capas.filter((c) => c.status === "pending_qa_review").length, fill: "#6366f1" },
      { name: "Closed", value: capas.filter((c) => c.status === "closed").length, fill: "#0F6E56" },
    ] as const).filter((d) => d.value > 0),
  [capas]);

  const sourceBreakdown = useMemo(() => {
    const srcs = ["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"] as const;
    return srcs.map((s) => ({ source: s, count: capas.filter((c) => c.source === s).length })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  }, [capas]);
  const maxSrcCount = sourceBreakdown.length > 0 ? sourceBreakdown[0].count : 1;

  /* ── Blueprint helpers ── */
  function getProcessMetrics(sourceKey: string) {
    const src = capas.filter((c) => c.source === sourceKey);
    return { open: src.filter((c) => c.status !== "closed").length, thisMonth: src.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === dayjs().format("MMM YYYY")).length, overdue: src.filter(isOverdue).length };
  }

  function stepHasProblem(step: number): boolean {
    if (step === 2) return criticalOpenCount > 0;
    if (step === 3) return noRCACount > 0;
    if (step === 5 || step === 6) return pendingReviewCount > 0;
    return false;
  }

  const LIFECYCLE_STEPS = [
    { step: 1, label: "Finding", Icon: Search, color: "#ef4444", desc: "Gap identified and logged", targetState: "All findings logged within 24h of discovery with severity classification.", currentGap: "Manual logging only \u2014 no automated detection from LIMS or SAP yet." },
    { step: 2, label: "CAPA Raised", Icon: Plus, color: "#f59e0b", desc: "Owner assigned, due date set", targetState: "CAPA raised within 48h for Critical, 5 days for Major findings.", currentGap: criticalOpenCount > 0 ? `${criticalOpenCount} Critical CAPA${criticalOpenCount > 1 ? "s" : ""} open \u2014 verify raise time is within 48h` : "No Critical CAPAs open currently \u2713" },
    { step: 3, label: "RCA", Icon: GitBranch, color: "#6366f1", desc: "Root cause analysis", targetState: "5 Why or Fishbone for Critical/Major. Documented with evidence.", currentGap: noRCACount > 0 ? `${noRCACount} open CAPA${noRCACount > 1 ? "s" : ""} have no RCA documented \u2014 beyond 7-day threshold` : "All open CAPAs have RCA documented \u2713" },
    { step: 4, label: "Corrective Action", Icon: Wrench, color: "#0ea5e9", desc: "Fix implemented", targetState: "Action documented, evidence linked, change control raised if system change.", currentGap: "Evidence linking consistency \u2014 verify all In Progress CAPAs have document references." },
    { step: 5, label: "QA Review", Icon: Shield, color: "#10b981", desc: "Independent verification", targetState: "QA Head reviews within 3 working days of submission.", currentGap: pendingReviewCount > 0 ? `${pendingReviewCount} CAPA${pendingReviewCount > 1 ? "s" : ""} awaiting QA review \u2014 check elapsed time` : "No CAPAs pending QA review \u2713" },
    { step: 6, label: "Sign & Close", Icon: CheckCircle2, color: "#10b981", desc: "GxP e-signature closure", targetState: "E-signature with meaning, identity verification, content hash \u2014 21 CFR Part 11.", currentGap: pendingReviewCount > 0 ? `${pendingReviewCount} CAPA${pendingReviewCount > 1 ? "s" : ""} pending QA sign-off` : "No CAPAs pending sign-off \u2713" },
    { step: 7, label: "Effectiveness", Icon: TrendingUp, color: "#6366f1", desc: "90-day recurrence check", targetState: "Effectiveness check at 30, 60, 90 days. Recurrence monitoring active.", currentGap: "No formal effectiveness scoring \u2014 AGI monitoring planned for future phase." },
  ];

  /* ── Handlers ──
   *
   * Server-first throughout. We previously dispatched optimistic Redux
   * updates and showed green popups BEFORE awaiting the server, which
   * meant a server reject (FORBIDDEN, validation, Part 11 password fail)
   * left the UI claiming success against state the DB never accepted —
   * regulatory exposure on a compliance product. Every handler below now
   * awaits the server first; only on success do we mutate Redux / surface
   * a success popup. Failures route through errorPopup with the server's
   * own error message.
   */
  function handleAddCAPA(data: CAPAForm) {
    startTransition(async () => {
      const res = await createCAPAServer({
        description: data.description,
        source: data.source as never,
        risk: data.risk as never,
        owner: data.owner,
        dueDate: data.dueDate,
        siteId: data.siteId,
        linkedFindingId: data.findingId || undefined,
        diGateRequired: data.diGate,
      });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to create CAPA. Please try again.");
        setErrorPopup(true);
        return;
      }
      setAddOpen(false);
      setAddedPopup(true);
      router.refresh();
    });
  }

  function handleEditSave(data: EditForm) {
    if (!selectedCAPA) return;
    const autoAdvance = selectedCAPA.status === "open" && data.rca?.trim();
    const capaId = selectedCAPA.id;
    startTransition(async () => {
      // SME Section 1, Stage 4 (FULL) — correctiveActions is no longer
      // part of the EditCAPAModal form; the structured Action Plan
      // table is the only edit surface. Server still rejects any
      // correctiveActions payload (deprecated guard) so even if a
      // legacy caller resurfaced it, the action would block.
      const res = await updateCAPAServer(capaId, {
        description: data.description,
        owner: data.owner,
        dueDate: data.dueDate,
        risk: data.risk as never,
        rcaMethod: (data.rcaMethod as string) || undefined,
        rca: data.rca ?? "",
      });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to save changes. Please try again.");
        setErrorPopup(true);
        return;
      }
      // RUNG 3D-CAPA — open→in_progress now routes through the guarded
      // startCAPAProgress transition (status is no longer settable via update).
      if (autoAdvance) {
        const adv = await startCAPAProgressServer(capaId);
        if (!adv.success) {
          setErrorMsg(adv.error || "Saved, but failed to start CAPA progress.");
          setErrorPopup(true);
          return;
        }
      }
      // Server accepted — now safe to mirror into Redux + close the modal.
      dispatch(updateCAPAAction({
        id: capaId,
        patch: {
          description: data.description, owner: data.owner,
          dueDate: dayjs(data.dueDate).utc().toISOString(),
          risk: data.risk, rcaMethod: (data.rcaMethod as RCAMethod) || undefined,
          rca: data.rca ?? "",
          effectivenessCheck: data.effectivenessCheck, diGate: data.diGate,
          diGateStatus: data.diGateStatus ?? "open",
          diGateNotes: data.diGateNotes ?? "",
          diGateReviewedBy: data.diGateReviewedBy ?? "",
          diGateReviewDate: data.diGateReviewDate ?? "",
          ...(autoAdvance ? { status: "in_progress" as const } : {}),
        },
      }));
      setEditModalOpen(false);
      setEditSavedPopup(true);
      router.refresh();
    });
  }

  function handleSubmitForReview(id: string) {
    startTransition(async () => {
      const res = await submitForReviewServer(id);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to submit for review. Please try again.");
        setErrorPopup(true);
        return;
      }
      dispatch(updateCAPAAction({ id, patch: { status: "pending_qa_review" } }));
      setSubmittedPopup(true);
      setSelectedCAPA(null);
      router.refresh();
    });
  }

  // RUNG 3D-CAPA — reopen a closed/rejected CAPA (senior action, reason ≥10).
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  function closeReopenModal() { setReopenTarget(null); setReopenReason(""); setReopenError(null); }
  async function handleConfirmReopen() {
    if (!reopenTarget || reopenReason.trim().length < 10) return;
    setReopenBusy(true); setReopenError(null);
    const res = await reopenCAPAServer(reopenTarget, { reason: reopenReason.trim() });
    setReopenBusy(false);
    if (!res.success) { setReopenError(res.error || "Failed to reopen CAPA."); return; }
    if (selectedCAPA?.id === reopenTarget) setSelectedCAPA(null);
    closeReopenModal();
    router.refresh();
  }

  const [diGateBlockPopup, setDiGateBlockPopup] = useState(false);

  async function handleSignClose(data: { meaning: string; password: string }) {
    if (!selectedCAPA) return;
    if (selectedCAPA.diGate && selectedCAPA.diGateStatus !== "cleared") {
      setSignOpen(false);
      setDiGateBlockPopup(true);
      return;
    }
    setSignBusy(true);
    setSignError(null);
    const capaId = selectedCAPA.id;
    const findingId = selectedCAPA.findingId;
    const source = selectedCAPA.source;
    const ccOverride = pendingCCOverride;
    // §11 — server-first. Modal stays open until the server confirms the
    // signature; on reject (wrong password, missing approvals, CC dep
    // gate, etc.) the signError prop renders inline and Redux is
    // untouched. The cross-module observation update only fires AFTER
    // the close commits — previously it ran first, leaving the DB in
    // mixed state on signing failure.
    const res = await signAndCloseCAPAServer(capaId, {
      password: data.password,
      signatureMeaning: data.meaning,
      ccBlockOverride: ccOverride ?? undefined,
    });
    setSignBusy(false);
    if (!res.success) {
      setSignError(res.error || "Sign & close failed. Please verify your password and try again.");
      return; // modal stays open
    }
    // Server confirmed. Now safe to apply local Redux + cross-module side
    // effects.
    const now = dayjs().toISOString();
    // Rung 3J.1 — closedBy stores a NAME (server sets session.user.name;
    // displayed via displayName({name})), so the optimistic dispatch must pass
    // the name, not the id (passing the id leaked a cuid until server refresh).
    dispatch(closeCAPA({ id: capaId, closedBy: user?.name ?? "", closedAt: now }));
    if (findingId) dispatch(closeFinding(findingId));
    if (source === "483") {
      for (const ev of fda483Events) {
        const matchingObs = ev.observations.find((o) => o.capaId === capaId);
        if (matchingObs) {
          // Cross-module: when a CAPA from a 483 source closes, close the
          // linked observation too — via the guarded closeObservation action
          // (Rung 3D-FDA; was a status bypass through updateObservation). The
          // QA Head who signed the CAPA closure satisfies closeObservation's
          // role gate. Best-effort: a failure here (e.g. already closed) must
          // not undo the committed CAPA closure.
          const obsClose = await closeObservation(matchingObs.id, {
            reason: `Auto-closed on closure of linked CAPA ${selectedCAPA?.reference ?? capaId}.`,
          });
          if (!obsClose.success) {
            console.warn("[capa] linked observation close skipped:", obsClose.error);
          }
          break;
        }
      }
    }
    auditLog({ action: "CAPA_CLOSED_MEANING", module: "capa", recordId: capaId, newValue: { meaning: data.meaning } });
    setSignOpen(false);
    setSignedPopup(true);
    setSelectedCAPA(null);
    setPendingCCOverride(null);
    router.refresh();
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="QMS and CAPA tracker" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">CAPA Tracker</h1>
          <p className="page-subtitle mt-1">{capas.length === 0 ? "No CAPAs raised yet" : `${capas.length} CAPAs \u00b7 ${openCAPAs.length} open \u00b7 ${overdueCAPAs.length} overdue`}</p>
          <StatusGuide module="CAPA Tracker" statuses={CAPA_STATUSES} />
        </div>
        {canCreateCAPAs && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>New CAPA</Button>}
        {isCustomerAdmin && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>CAPA actions require QA Head authorization</p>}
      </header>

      {/* Tab bar */}
      <div role="tablist" aria-label="CAPA sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors duration-150 bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "blueprint" && (
        <QMSBlueprintTab
          openCAPAs={openCAPAs} noRCACount={noRCACount} pendingReviewCount={pendingReviewCount} selectedStep={selectedStep} onSelectStep={setSelectedStep}
          lifecycleSteps={LIFECYCLE_STEPS} qmsProcesses={QMS_PROCESSES}
          stepHasProblem={stepHasProblem} getProcessMetrics={getProcessMetrics}
        />
      )}

      {activeTab === "tracker" && (
        <CAPATrackerTab
          capas={capas} filteredCAPAs={capas} selectedCAPA={selectedCAPA} onSelectCAPA={setSelectedCAPA}
          isDark={isDark} isViewOnly={isViewOnly} users={users} user={user} sites={allSites}
          timezone={timezone} dateFormat={dateFormat}
          onAddOpen={() => setAddOpen(true)}
          onAiOpen={canUseAiCapa ? () => setAiOpen(true) : undefined}
          onEditOpen={() => setEditModalOpen(true)}
          onSignOpen={(override) => {
            setPendingCCOverride(override ?? null);
            setSignOpen(true);
          }} onSubmitForReview={handleSubmitForReview}
          onReopen={canReopen ? (id) => { setReopenTarget(id); setReopenReason(""); setReopenError(null); } : undefined}
          onNavigateGap={(fid) => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(fid)}`)}
          onNavigateCapa={() => router.push("/gap-assessment")}
        />
      )}

      {activeTab === "metrics" && (
        <CAPAMetricsTab
          capasTotal={capas.length} closedCount={closedCAPAs.length}
          onTimeRate={onTimeRate} overdueRate={overdueRate} overdueCount={overdueCAPAs.length}
          diExceptions={diExceptions} effectivenessCount={effectivenessCount}
          riskSignalData={riskSignalData} hasTrendData={hasTrendData}
          statusDonut={statusDonut} sourceBreakdown={sourceBreakdown} maxSrcCount={maxSrcCount}
        />
      )}

      {/* Modals */}
      <AddCAPAModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddCAPA} users={complianceUsers} sites={allSites} lockedSiteId={selectedSiteId} />
      <EditCAPAModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} onSave={handleEditSave} capa={selectedCAPA} users={complianceUsers} />
      <SignCloseModal isOpen={signOpen} onClose={() => { setSignOpen(false); setPendingCCOverride(null); setSignError(null); }} onSign={handleSignClose} capa={selectedCAPA} ccBlockOverride={pendingCCOverride} error={signError} busy={signBusy} />

      {/* RUNG 3D-CAPA — reopen a closed/rejected CAPA (reason required) */}
      <Modal
        open={!!reopenTarget}
        onClose={reopenBusy ? () => undefined : closeReopenModal}
        title="Reopen this CAPA?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={reopenBusy} onClick={closeReopenModal}>Cancel</Button>
            <Button variant="primary" size="sm" icon={RotateCcw} loading={reopenBusy} disabled={reopenBusy || reopenReason.trim().length < 10} onClick={handleConfirmReopen}>Reopen CAPA</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Reopening returns the CAPA to the open state and unlocks its evidence and effectiveness criteria for further work. This is recorded in the audit trail.
          </p>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Reason for reopening *</label>
            <textarea rows={3} className="input text-[12px] resize-none w-full" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Why is this CAPA being reopened? (min 10 characters)" maxLength={2000} disabled={reopenBusy} aria-label="Reopen reason" />
          </div>
          {reopenError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{reopenError}</p>}
        </div>
      </Modal>
      <AIGenerateCAPAModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        defaultCustomerId={aiCustomerId}
        onAccepted={async (res: AICapaResponse, form: AICapaForm) => {
          // Map AI form severity → CAPA risk taxonomy ("Medium" → "High" so it
          // still escalates; backend severity is informational anyway).
          const risk: "Critical" | "High" | "Low" =
            form.initial_severity === "Critical" ? "Critical" :
            form.initial_severity === "Low" ? "Low" : "High";

          // Map AI free-text source → the createCAPA Zod enum the server
          // expects. Unmatched values land in "Other".
          const SERVER_SOURCE_MAP: Record<string, "Gap Assessment" | "Deviation" | "FDA 483" | "Internal Audit" | "External Audit" | "Customer Complaint" | "Other"> = {
            "483": "FDA 483",
            "Internal Audit": "Internal Audit",
            "Deviation": "Deviation",
            "Complaint": "Customer Complaint",
            "OOS": "Other",
            "Change Control": "Other",
            "Gap Assessment": "Gap Assessment",
          };
          const serverSource = SERVER_SOURCE_MAP[form.source] ?? "Other";

          // Redux's CAPASource type uses the legacy AI-form vocabulary
          // (different enum from the server's Zod schema). Keep both in sync
          // for the degraded-mode fallback dispatch.
          const REDUX_KNOWN_SOURCES = ["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"] as const;
          const reduxSource = (REDUX_KNOWN_SOURCES as readonly string[]).includes(form.source)
            ? (form.source as typeof REDUX_KNOWN_SOURCES[number])
            : "Deviation";

          // Default due date: 30 days for Critical, 60 for High, 90 for Low.
          const days = risk === "Critical" ? 30 : risk === "High" ? 60 : 90;
          const dueDateIso = dayjs(res.created_at).add(days, "day").toISOString();

          const description = [
            form.problem_statement,
            form.area_affected ? `Area: ${form.area_affected}` : "",
            form.equipment_product ? `Equipment/Product: ${form.equipment_product}` : "",
            res.ai_recommendation ? `\nAI recommendation: ${res.ai_recommendation}` : "",
            res.pattern_detected ? `Pattern: ${res.pattern_detected}` : "",
            res.recurrence_alert ? `Recurrence: ${res.recurrence_alert}` : "",
          ].filter(Boolean).join("\n");

          // Persist locally so the CAPA survives page refresh. Prior to this
          // the AI CAPA only lived in Redux + the AI backend, so refreshing
          // /capa wiped it from the tracker (capa.slice doesn't persist).
          // The AI backend's res.capa_id is kept in the audit log's newValue
          // so the AI lifecycle viewer at /ai-capa/[capaId] is still findable
          // post-create; the local Prisma row gets its own cuid + reference.
          let persistedToDb = false;
          let serverCapa: PrismaCAPA | null = null;
          try {
            const createRes = await createCAPAServer({
              description,
              source: serverSource,
              risk,
              owner: user?.id || user?.name || "ai-system",
              dueDate: dueDateIso,
              siteId: selectedSiteId ?? allSites[0]?.id ?? undefined,
            });
            if (createRes.success && createRes.data) {
              serverCapa = createRes.data as PrismaCAPA;
              persistedToDb = true;
            } else if (!createRes.success) {
              console.warn("[ai-capa] local persist rejected:", createRes.error);
            }
          } catch (err) {
            console.error("[ai-capa] local persist threw:", err);
          }

          if (persistedToDb && serverCapa) {
            // Mirror the server's authoritative row into Redux so the tracker
            // shows the canonical Prisma id + reference, not the AI backend id.
            dispatch(addCAPA(mapCAPAFromPrisma(serverCapa)));
          } else {
            // Degraded mode: persist failed but AI backend has the CAPA.
            // Keep the user moving — add to Redux so the tracker still shows
            // something this session. On next page refresh this row will
            // vanish (capa.slice doesn't persist + Prisma row is missing).
            dispatch(addCAPA({
              id: res.capa_id,
              tenantId: tenantId ?? "",
              siteId: selectedSiteId ?? allSites[0]?.id ?? "",
              source: reduxSource,
              risk,
              owner: user?.id ?? "",
              dueDate: dueDateIso,
              status: "open",
              description,
              effectivenessCheck: true,
              diGate: false,
              createdAt: res.created_at,
            }));
          }

          auditLog({
            action: "CAPA_AI_GENERATED",
            module: "capa",
            recordId: serverCapa?.id ?? res.capa_id,
            newValue: {
              riskScore: res.risk_score,
              isRecurring: res.is_recurring,
              aiBackendId: res.capa_id,
              persistedToDb,
            },
          });
          setAiSavedPopup(
            persistedToDb
              ? `AI CAPA ${serverCapa?.reference ?? res.capa_id} created and added to the tracker. Open the row to start RCA in the AI lifecycle.`
              : `AI CAPA ${res.capa_id} created (warning: local persist failed; refresh will clear from tracker).`,
          );
          // We used to auto-redirect to /ai-capa/<id> here. That meant the
          // user got bounced off the CAPA Tracker the moment they clicked
          // "Save to library" — before the success popup could display and
          // before they had a chance to verify the row landed. Now the user
          // stays on /capa, sees the new row in the tracker, sees the
          // popup, and opens the AI lifecycle on their own terms by clicking
          // the row (which routes to /ai-capa/<aiBackendId> via the row's
          // detail handler).
        }}
      />

      {/* Popups */}
      <Popup isOpen={editSavedPopup} variant="success" title="CAPA updated" description="Changes saved. Submit for QA review when RCA and corrective actions are complete." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={addedPopup} variant="success" title="CAPA created" description="Added to the tracker. Document RCA and corrective actions next." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={submittedPopup} variant="success" title="Submitted for QA review" description="QA Head will review and sign to close." onDismiss={() => setSubmittedPopup(false)} />
      <Popup isOpen={signedPopup} variant="success" title="CAPA closed" description="Signed and closed. Audit trail entry recorded." onDismiss={() => setSignedPopup(false)} />
      <Popup isOpen={!!aiSavedPopup} variant="success" title="AI CAPA generated" description={aiSavedPopup ?? ""} onDismiss={() => setAiSavedPopup(null)} />
      <Popup isOpen={errorPopup} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorPopup(false)} />
      <Popup isOpen={diGateBlockPopup} variant="confirmation" title="DI gate must be cleared" description="Data integrity review has not been completed. Open Edit mode and clear the DI gate before closing this CAPA." onDismiss={() => setDiGateBlockPopup(false)} actions={[{ label: "OK", style: "primary", onClick: () => setDiGateBlockPopup(false) }]} />
    </main>
  );
}
