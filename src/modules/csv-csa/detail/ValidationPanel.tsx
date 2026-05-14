// Stage document uploads — full feature. Mirrors substage 3.2's EvidenceFile
// pattern: server action accepts FormData, persists via fileStorage with a
// SHA-256 hash-prefixed key, returns mapped ActionResult. Part 11 immutability
// via soft-delete only. Stage status === "approved" locks both upload and
// delete server-side; the UI mirrors that lock with a chip + hidden buttons.
import { useState, useRef } from "react";
import clsx from "clsx";
import { ClipboardList, Download, Lock, Pencil, X, Save, FileText, Trash2, Upload, CheckCircle2, AlertCircle, SkipForward, Info, ShieldCheck } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/hooks/useAppSelector";
import type {
  GxPSystem,
  ValidationStatus,
  RoadmapActivity,
  ValidationStage,
  ValidationStageKey,
  StageDocument,
} from "@/types/csv-csa";
import { VALIDATION_STAGE_KEYS, VALIDATION_STAGE_LABELS, getStageId } from "@/types/csv-csa";
import { useRouter } from "next/navigation";
import {
  submitStageForReview as submitStageForReviewServer,
  approveStage as approveStageServer,
  rejectStage as rejectStageServer,
  skipStage as skipStageServer,
  updateStageNotes as updateStageNotesServer,
  addStageDocument as addStageDocumentServer,
  removeStageDocument as removeStageDocumentServer,
} from "@/actions/systems";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";

/* ── Helpers ── */

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}
function actStatusBadge(s: RoadmapActivity["status"]) {
  const m: Record<string, "green" | "amber" | "blue" | "red"> = { Complete: "green", "In Progress": "amber", Planned: "blue", Overdue: "red" };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}
function ownerName(uid: string, users: UserConfig[]) { return users.find((u) => u.id === uid)?.name ?? uid; }
function getStages(system: GxPSystem): ValidationStage[] {
  const existing = system.validationStages ?? [];
  return VALIDATION_STAGE_KEYS.map((k) => existing.find((s) => s.key === k) ?? { key: k, status: "not_started" as const });
}

type StageColor = "green" | "blue" | "red" | "amber" | "gray";
function stageVariant(status: ValidationStage["status"]): StageColor {
  if (status === "approved" || status === "complete") return "green";
  if (status === "in_review" || status === "in-progress") return "blue";
  if (status === "rejected") return "red";
  if (status === "draft") return "amber";
  if (status === "skipped") return "gray";
  return "gray";
}
function stageLabel(status: ValidationStage["status"]): string {
  if (status === "approved" || status === "complete") return "Approved";
  if (status === "in_review" || status === "in-progress") return "In Review";
  if (status === "rejected") return "Rejected";
  if (status === "draft") return "Draft";
  if (status === "skipped") return "Skipped";
  return "Not Started";
}
function stageGlyph(status: ValidationStage["status"]): string {
  if (status === "approved" || status === "complete") return "\u2713";
  if (status === "in_review" || status === "in-progress") return "\u223C";
  if (status === "skipped") return "\u23ED";
  if (status === "rejected") return "\u2717";
  if (status === "draft") return "\u270E";
  return "\u25CB";
}
function stageBorderColor(status: ValidationStage["status"]): string {
  if (status === "approved" || status === "complete") return "#10b981";
  if (status === "in_review" || status === "in-progress") return "#0ea5e9";
  if (status === "rejected") return "#ef4444";
  if (status === "draft") return "#f59e0b";
  return "var(--bg-border)";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Props ── */

export interface ValidationPanelProps {
  system: GxPSystem;
  roadmapActivities: RoadmapActivity[];
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  role: string;
  onSavePlannedActions: (text: string) => void;
  onSaveStage: (stage: ValidationStage) => void;
  onSaveNextReview: (iso: string) => void;
}

export function ValidationPanel({
  system, roadmapActivities, users, timezone, dateFormat, role,
  onSavePlannedActions, onSaveStage: _onSaveStage, onSaveNextReview,
}: ValidationPanelProps) {
  void _onSaveStage; // kept for interface compat; stage saves now use dispatch directly
  const router = useRouter();
  const { isQAHead } = usePermissions();
  // session user id used to gate per-document delete buttons — uploaders
  // can always delete their own files even if they don't carry the broader
  // canSubmitStages permission set. The server enforces the same rule.
  const sessionUserId = useAppSelector((s) => s.auth.user?.id ?? null);
  const canSubmitStages = role === "csv_val_lead" || role === "it_cdo" || isQAHead;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const [editingActions, setEditingActions] = useState(false);
  const [actionsText, setActionsText] = useState(system.plannedActions ?? "");
  const [editingNextReview, setEditingNextReview] = useState(false);
  const [draftNextReview, setDraftNextReview] = useState("");
  const [editingNotes, setEditingNotes] = useState<ValidationStageKey | null>(null);
  const [notesText, setNotesText] = useState("");
  const [approveModal, setApproveModal] = useState<ValidationStageKey | null>(null);
  const [rejectModal, setRejectModal] = useState<ValidationStageKey | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [skipModal, setSkipModal] = useState<ValidationStageKey | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [successPopup, setSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Stage document upload state. uploadStageKey identifies which stage's
  // upload button triggered the picker so the change handler knows where
  // to attach the file. uploadingStage and uploadErrors are keyed by stage
  // so a slow upload on URS doesn't blank out a parallel error on IQ.
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadStageKey, setUploadStageKey] = useState<ValidationStageKey | null>(null);
  const [uploadingStage, setUploadingStage] = useState<ValidationStageKey | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<ValidationStageKey, string>>>({});

  // Delete-document confirmation state. Soft-delete only; reason ≥ 10 chars
  // enforced on server. The modal collects the reason; server returns the
  // server-side error text on validation failure (kept inline next to the
  // textarea rather than as a popup).
  const [deletingDoc, setDeletingDoc] = useState<{ id: string; fileName: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) { setPrevId(system.id); setActionsText(system.plannedActions ?? ""); setEditingActions(false); setEditingNextReview(false); setEditingNotes(null); }

  const stages = getStages(system);
  const approvedCount = stages.filter((s) => s.status === "approved" || s.status === "complete").length;
  const skippedCount = stages.filter((s) => s.status === "skipped").length;
  const denominator = stages.length - skippedCount;
  const progressPct = denominator > 0 ? Math.round((approvedCount / denominator) * 100) : 0;

  // Dual-track completion
  const executedCount = stages.filter((s) => ["draft", "in_review", "approved", "complete", "in-progress"].includes(s.status) && (s.documents?.length ?? 0) > 0).length;
  const executionPct = denominator > 0 ? Math.round((executedCount / denominator) * 100) : 0;
  const approvalPct = progressPct;
  const hasRejected = stages.some((s) => s.status === "rejected");
  const overallLabel = hasRejected ? "Issues" : executionPct === 100 && approvalPct === 100 ? "Validated" : executionPct === 100 ? "Pending QA Approval" : executionPct > 0 || approvalPct > 0 ? "In Progress" : "Not Started";
  const overallColor = hasRejected ? "#ef4444" : overallLabel === "Validated" ? "#10b981" : overallLabel === "Pending QA Approval" ? "#8B5CF6" : overallLabel === "In Progress" ? "#f59e0b" : "#6B7280";

  const [showBanner, setShowBanner] = useState(() => {
    try { return localStorage.getItem("glimmora-csv-completion-banner-dismissed") !== "1"; } catch { return true; }
  });

  // Each handler maps the legacy stage `key` ("URS"/"IQ"/etc.) to the
  // Prisma row id via `getStageId()`, then dispatches the server action.
  // Audit logging happens inside the server action \u2014 no client `auditLog`
  // call needed. `router.refresh()` re-fetches the page Server Component
  // so the updated stage state arrives via props.
  async function handleSubmitForReview(key: ValidationStageKey) {
    const stageId = getStageId(system, key);
    if (!stageId) { setSuccessMsg(`Stage ${key} not found`); setSuccessPopup(true); return; }
    const result = await submitStageForReviewServer(stageId);
    if (!result.success) {
      console.error("[csv-csa] submitStageForReview failed:", result.error);
      return;
    }
    setSuccessMsg(`${key} submitted for QA review`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleApprove() {
    if (!approveModal) return;
    const stageId = getStageId(system, approveModal);
    if (!stageId) return;
    const result = await approveStageServer(stageId);
    if (!result.success) {
      console.error("[csv-csa] approveStage failed:", result.error);
      return;
    }
    setSuccessMsg(`${approveModal} stage approved \u2014 ${system.name}`);
    setApproveModal(null);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) return;
    const stageId = getStageId(system, rejectModal);
    if (!stageId) return;
    const result = await rejectStageServer(stageId, rejectReason);
    if (!result.success) {
      console.error("[csv-csa] rejectStage failed:", result.error);
      return;
    }
    setRejectModal(null);
    setRejectReason("");
    router.refresh();
  }

  async function handleSkip() {
    if (!skipModal || !skipReason.trim()) return;
    const stageId = getStageId(system, skipModal);
    if (!stageId) return;
    const result = await skipStageServer(stageId, skipReason);
    if (!result.success) {
      console.error("[csv-csa] skipStage failed:", result.error);
      return;
    }
    setSkipModal(null);
    setSkipReason("");
    setSuccessMsg(`${skipModal} marked as skipped`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input value immediately so re-selecting the same file fires
    // onChange again (browsers silently no-op duplicate selections otherwise).
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !uploadStageKey) return;
    const stageKey = uploadStageKey;
    const stageId = getStageId(system, stageKey);
    if (!stageId) {
      setUploadErrors((prev) => ({ ...prev, [stageKey]: `Stage ${stageKey} not found` }));
      setUploadStageKey(null);
      return;
    }

    setUploadingStage(stageKey);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[stageKey];
      return next;
    });

    const formData = new FormData();
    formData.append("stageId", stageId);
    formData.append("file", file);

    const result = await addStageDocumentServer(formData);
    setUploadingStage(null);
    setUploadStageKey(null);

    if (!result.success) {
      setUploadErrors((prev) => ({ ...prev, [stageKey]: result.error }));
      return;
    }
    setSuccessMsg(`Document uploaded to ${stageKey}`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleDeleteDoc() {
    if (!deletingDoc || deleteReason.trim().length < 10) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const result = await removeStageDocumentServer(deletingDoc.id, {
      reason: deleteReason.trim(),
    });
    setDeleteBusy(false);
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    setDeletingDoc(null);
    setDeleteReason("");
    setSuccessMsg("Document removed");
    setSuccessPopup(true);
    router.refresh();
  }

  function canDeleteDoc(doc: StageDocument): boolean {
    if (doc.isLocked) return false;
    if (canSubmitStages) return true;
    return sessionUserId !== null && doc.uploadedById === sessionUserId;
  }

  async function handleSaveNotes(key: ValidationStageKey) {
    const stageId = getStageId(system, key);
    if (!stageId) return;
    const result = await updateStageNotesServer(stageId, notesText);
    if (!result.success) {
      console.error("[csv-csa] updateStageNotes failed:", result.error);
      return;
    }
    setEditingNotes(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Dual-track progress */}
      <div className={clsx("rounded-xl p-4 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{system.name}</p>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: overallColor + "18", color: overallColor }}>{overallLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1"><span style={{ color: "var(--text-muted)" }}>Execution</span><span className="font-bold" style={{ color: executionPct === 100 ? "#10b981" : "#f59e0b" }}>{executionPct}%</span></div>
            <div className={clsx("h-2 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}><div className="h-full rounded-full transition-all" style={{ width: `${executionPct}%`, background: executionPct === 100 ? "#10b981" : "#0ea5e9" }} /></div>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{executedCount}/{denominator} stages done</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1"><span style={{ color: "var(--text-muted)" }}>Approval</span><span className="font-bold" style={{ color: approvalPct === 100 ? "#10b981" : "#8B5CF6" }}>{approvalPct}%</span></div>
            <div className={clsx("h-2 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}><div className="h-full rounded-full transition-all" style={{ width: `${approvalPct}%`, background: approvalPct === 100 ? "#10b981" : "#8B5CF6" }} /></div>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{approvedCount}/{denominator} stages approved</p>
          </div>
        </div>

        {/* Stage breakdown table */}
        <table className="w-full text-[11px]" aria-label="Stage completion breakdown">
          <thead><tr style={{ borderBottom: `1px solid ${isDark ? "#1e3a5a" : "#e2e8f0"}` }}>
            <th scope="col" className="text-left py-1 font-semibold" style={{ color: "var(--text-muted)" }}>Stage</th>
            <th scope="col" className="text-center py-1 font-semibold" style={{ color: "#0ea5e9" }}>Execution</th>
            <th scope="col" className="text-center py-1 font-semibold" style={{ color: "#8B5CF6" }}>Approval</th>
          </tr></thead>
          <tbody>{stages.map((s) => {
            const isExec = s.status === "skipped" ? "\u23ED" : ["approved", "complete", "in_review", "in-progress"].includes(s.status) && (s.documents?.length ?? 0) > 0 ? "\u2713" : (s.documents?.length ?? 0) > 0 ? "\uD83D\uDCCE" : s.status === "draft" ? "\u270E" : "\u25CB";
            const isAppr = s.status === "skipped" ? "\u23ED" : s.status === "approved" || s.status === "complete" ? "\u2713" : s.status === "in_review" || s.status === "in-progress" ? "\u223C" : s.status === "rejected" ? "\u2717" : "\u25CB";
            const execCol = isExec === "\u2713" ? "#10b981" : isExec === "\u270E" ? "#f59e0b" : "#64748b";
            const apprCol = isAppr === "\u2713" ? "#10b981" : isAppr === "\u223C" ? "#8B5CF6" : isAppr === "\u2717" ? "#ef4444" : "#64748b";
            return (
              <tr key={s.key} style={{ borderBottom: `1px solid ${isDark ? "#1e3a5a22" : "#f1f5f9"}` }}>
                <td className="py-1 font-medium" style={{ color: "var(--text-primary)" }}>{s.key}</td>
                <td className="text-center py-1 font-bold" style={{ color: execCol }}>{isExec}</td>
                <td className="text-center py-1 font-bold" style={{ color: apprCol }}>{isAppr}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      {/* Completion definition banner */}
      {showBanner && (
        <div className="flex items-start gap-2 p-3 rounded-xl border" style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div className="flex-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--brand)" }}>Validation completion criteria</p>
            <p><strong>Execution complete</strong> (CSV/Val Lead): All documents uploaded, test cases executed, results recorded, submitted for QA review.</p>
            <p className="mt-1"><strong>Approval complete</strong> (QA Head): All stages reviewed, documents verified, QA Head formally approved.</p>
            <p className="mt-1 font-semibold" style={{ color: "var(--brand)" }}>System validated = Both complete \u2713</p>
          </div>
          <button type="button" onClick={() => { setShowBanner(false); try { localStorage.setItem("glimmora-csv-completion-banner-dismissed", "1"); } catch { /* ignore */ } }} className="p-1 rounded cursor-pointer border-none bg-transparent" style={{ color: "var(--brand)" }} aria-label="Dismiss">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Progress card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Validation progress</span>
          <span className="text-[14px] font-bold" style={{ color: progressPct >= 80 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#ef4444" }}>{progressPct}%</span>
        </div>
        <div className="card-body space-y-3">
          <div className="h-2 rounded-full" style={{ background: "var(--bg-elevated)" }} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: progressPct >= 80 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#ef4444" }} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Validation stages">
            {stages.map((s) => (
              <div key={s.key} role="listitem" className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: stageBorderColor(s.status) + "1a", color: stageBorderColor(s.status), border: `1px solid ${stageBorderColor(s.status)}33` }} title={`${VALIDATION_STAGE_LABELS[s.key]} \u2014 ${stageLabel(s.status)}`}>
                <span>{s.key}</span><span aria-hidden="true">{stageGlyph(s.status)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stage cards */}
      {stages.map((s) => {
        const borderColor = stageBorderColor(s.status);
        const docs = s.documents ?? [];
        return (
          <div key={s.key} className="card overflow-hidden" style={{ borderLeft: `3px solid ${borderColor}` }}>
            <div className="card-header">
              <div className="flex items-center gap-2">
                <span className="card-title">{s.key} — {VALIDATION_STAGE_LABELS[s.key]}</span>
                {/* Lock chip mirrors the server-side lock — once a stage
                    is approved, no further uploads or deletes are allowed.
                    Documents themselves remain visible + downloadable. */}
                {s.status === "approved" && (
                  <Badge variant="gray">
                    <Lock className="w-3 h-3 inline mr-0.5" aria-hidden="true" />
                    Locked
                  </Badge>
                )}
              </div>
              <Badge variant={stageVariant(s.status)}>{stageLabel(s.status)}</Badge>
            </div>
            <div className="card-body space-y-3">
              {/* Documents */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Documents
                  {docs.length > 0 && (
                    <span className="font-normal normal-case tracking-normal ml-1" style={{ color: "var(--text-muted)" }}>· {docs.length}</span>
                  )}
                </p>
                {docs.length === 0 ? (
                  <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                    No documents uploaded yet.
                  </p>
                ) : (
                  <ul role="list" className="space-y-1.5 list-none p-0 m-0">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 text-[11px] flex-wrap">
                        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
                        <a
                          href={`/api/stage-documents/${d.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:underline"
                          style={{ color: "var(--text-primary)" }}
                          title={d.originalFileName}
                        >
                          {d.originalFileName}
                        </a>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {formatFileSize(d.fileSize)}
                        </span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                          title={`SHA-256: ${d.contentHashSha256}`}
                        >
                          {d.contentHashSha256.slice(0, 8)}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {d.uploadedByName} · {dayjs.utc(d.uploadedAt).fromNow()}
                        </span>
                        <a
                          href={`/api/stage-documents/${d.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Download ${d.originalFileName}`}
                          className="p-1 rounded hover:bg-(--bg-hover)"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Download className="w-3 h-3" aria-hidden="true" />
                        </a>
                        {canDeleteDoc(d) && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingDoc({ id: d.id, fileName: d.originalFileName });
                              setDeleteReason("");
                              setDeleteError(null);
                            }}
                            aria-label={`Remove ${d.originalFileName}`}
                            className="p-1 rounded border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Upload button — hidden when stage is approved/complete/skipped
                  (locked or out-of-flow). The hidden <input type="file"> at
                  the bottom of the panel is shared across all stages; the
                  button records uploadStageKey before clicking it so the
                  onChange handler knows which stage to attach to. */}
              {canSubmitStages && s.status !== "approved" && s.status !== "complete" && s.status !== "skipped" && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadStageKey(s.key);
                      setUploadErrors((prev) => {
                        const next = { ...prev };
                        delete next[s.key];
                        return next;
                      });
                      fileRef.current?.click();
                    }}
                    disabled={uploadingStage !== null}
                    aria-label={`Upload document to ${s.key} stage`}
                    className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer border-none bg-transparent disabled:cursor-wait disabled:opacity-60"
                    style={{ color: "var(--brand)" }}
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    {uploadingStage === s.key ? "Uploading…" : "Upload document"}
                  </button>
                  {uploadErrors[s.key] && (
                    <p
                      role="alert"
                      className="text-[11px] mt-1 rounded-md p-1.5"
                      style={{
                        background: "var(--danger-bg)",
                        color: "var(--danger)",
                        border: "1px solid var(--danger)",
                      }}
                    >
                      {uploadErrors[s.key]}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              {s.notes && editingNotes !== s.key && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Notes</p>
                  <p className="text-[11px] italic" style={{ color: "var(--text-secondary)" }}>{s.notes}</p>
                </div>
              )}
              {canSubmitStages && editingNotes === s.key ? (
                <div className="space-y-1.5">
                  <textarea rows={2} className="input w-full resize-none text-[11px]" value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Stage notes..." />
                  <div className="flex gap-1.5 justify-end">
                    <Button variant="ghost" size="xs" onClick={() => setEditingNotes(null)}>Cancel</Button>
                    <Button variant="primary" size="xs" icon={Save} onClick={() => handleSaveNotes(s.key)}>Save</Button>
                  </div>
                </div>
              ) : canSubmitStages && s.status !== "approved" && s.status !== "complete" && s.status !== "skipped" && (
                <button type="button" onClick={() => { setEditingNotes(s.key); setNotesText(s.notes ?? ""); }} className="flex items-center gap-1 text-[10px] cursor-pointer border-none bg-transparent" style={{ color: "var(--text-muted)" }}>
                  <Pencil className="w-3 h-3" aria-hidden="true" /> {s.notes ? "Edit notes" : "Add notes"}
                </button>
              )}

              {/* Submission info */}
              {s.submittedBy && (
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Submitted by {s.submittedBy}{s.submittedDate ? ` · ${dayjs.utc(s.submittedDate).tz(timezone).format(dateFormat)}` : ""}
                </p>
              )}
              {s.approvedBy && (s.status === "approved" || s.status === "complete" || s.status === "skipped") && (
                <p className="text-[10px]" style={{ color: "#10b981" }}>
                  {s.status === "skipped" ? "Skipped" : "Approved"} by {s.approvedBy}{s.approvedDate ? ` · ${dayjs.utc(s.approvedDate).tz(timezone).format(dateFormat)}` : ""}
                </p>
              )}

              {/* Rejection info */}
              {s.status === "rejected" && s.rejectedBy && (
                <div className={clsx("rounded-lg p-2.5 text-[11px]", isDark ? "bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border border-[#fecaca]")}>
                  <p className="font-semibold text-[#ef4444] mb-1">Rejected by {s.rejectedBy}{s.rejectedDate ? ` · ${dayjs.utc(s.rejectedDate).tz(timezone).format(dateFormat)}` : ""}</p>
                  {s.rejectionReason && <p style={{ color: "var(--text-secondary)" }}>{s.rejectionReason}</p>}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {/* CSV/Val Lead: submit for review */}
                {canSubmitStages && (s.status === "draft" || s.status === "rejected") && docs.length > 0 && (
                  <Button variant="primary" size="xs" icon={ShieldCheck} onClick={() => handleSubmitForReview(s.key)}>Submit for Review</Button>
                )}
                {canSubmitStages && s.status === "rejected" && (
                  <p className="text-[10px]" style={{ color: "#f59e0b" }}>Please review and resubmit</p>
                )}

                {/* QA Head: approve / reject */}
                {isQAHead && s.status === "in_review" && (
                  <>
                    <Button variant="primary" size="xs" icon={CheckCircle2} onClick={() => setApproveModal(s.key)}>Approve Stage</Button>
                    <Button variant="ghost" size="xs" icon={AlertCircle} onClick={() => { setRejectModal(s.key); setRejectReason(""); }}>Reject</Button>
                  </>
                )}

                {/* QA Head: skip DS */}
                {isQAHead && s.key === "DS" && s.status !== "approved" && s.status !== "complete" && s.status !== "skipped" && (
                  <Button variant="ghost" size="xs" icon={SkipForward} onClick={() => { setSkipModal(s.key); setSkipReason(""); }}>Mark as Skipped</Button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Validation status + next review */}
      <div className="card"><div className="card-header"><span className="card-title">Validation status</span></div><div className="card-body">
        <div className="flex items-center gap-4 flex-wrap">
          {validationBadge(system.validationStatus)}
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Last validated: {system.lastValidated ? dayjs.utc(system.lastValidated).tz(timezone).format(dateFormat) : "Not yet"}</span>
          {editingNextReview ? (
            <div className="flex items-end gap-2">
              <div><label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Next review</label><input type="date" value={draftNextReview} onChange={(e) => setDraftNextReview(e.target.value)} className="input text-[11px]" /></div>
              <Button variant="ghost" size="xs" icon={X} onClick={() => setEditingNextReview(false)}>Cancel</Button>
              <Button variant="primary" size="xs" icon={Save} onClick={() => { if (draftNextReview.trim()) onSaveNextReview(dayjs(draftNextReview).utc().toISOString()); setEditingNextReview(false); }}>Save</Button>
            </div>
          ) : (
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Next review: {system.nextReview ? dayjs.utc(system.nextReview).tz(timezone).format(dateFormat) : "Not set"}
              {system.nextReview && dayjs.utc(system.nextReview).isBefore(dayjs()) && <span className="text-[#ef4444] ml-1 font-medium">(Overdue)</span>}
              {role !== "viewer" && <button type="button" onClick={() => { setDraftNextReview(system.nextReview ? dayjs.utc(system.nextReview).format("YYYY-MM-DD") : ""); setEditingNextReview(true); }} className="ml-1.5 text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"><Pencil className="w-3 h-3 inline" aria-hidden="true" /> Edit</button>}
            </span>
          )}
        </div>
      </div></div>

      {/* Planned actions */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Planned validation actions</span></div>
        {role !== "viewer" && <button type="button" onClick={() => { if (editingActions) setActionsText(system.plannedActions ?? ""); setEditingActions((v) => !v); }} className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer", editingActions ? "text-[#64748b]" : "text-[#0ea5e9]")}>{editingActions ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />} {editingActions ? "Cancel" : "Edit"}</button>}
      </div><div className="card-body">
        {editingActions ? (
          <div className="space-y-3">
            <textarea rows={4} className="input resize-none w-full text-[12px]" value={actionsText} onChange={(e) => setActionsText(e.target.value)} placeholder="IQ/OQ/PQ plan..." />
            <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => { setActionsText(system.plannedActions ?? ""); setEditingActions(false); }}>Cancel</Button><Button variant="primary" size="sm" icon={Save} onClick={() => { onSavePlannedActions(actionsText.trim()); setEditingActions(false); }}>Save</Button></div>
          </div>
        ) : system.plannedActions?.trim() ? <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{system.plannedActions}</p> : <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No planned actions documented.</p>}
      </div></div>

      {/* Roadmap */}
      <div className="card"><div className="card-header"><span className="card-title">Roadmap activities</span></div><div className="card-body">
        {roadmapActivities.length === 0 ? <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No roadmap activities planned.</p> : (
          <table className="data-table" aria-label={`Roadmap for ${system.name}`}><thead><tr><th scope="col">Activity</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Owner</th></tr></thead><tbody>
            {roadmapActivities.map((a) => (<tr key={a.id}><th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</th><td><Badge variant="gray">{a.type}</Badge></td><td>{actStatusBadge(a.status)}</td><td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.startDate).format("DD MMM YY")}</td><td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.endDate).format("DD MMM YY")}</td><td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</td></tr>))}
          </tbody></table>
        )}
      </div></div>

      {/* Hidden file input — single shared instance across all stages.
          The clicked stage's button writes uploadStageKey before invoking
          fileRef.current?.click(); the change handler reads that key to
          attach the file to the right stage. accept= mirrors the server
          MIME whitelist in src/actions/systems.ts (10 MB cap also enforced
          server-side). */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
        onChange={handleUploadFile}
        aria-label="Upload stage document"
      />

      {/* Approve modal */}
      <Modal open={!!approveModal} onClose={() => setApproveModal(null)} title={`Approve ${approveModal} Stage`}>
        <div className="space-y-4">
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <p><strong>System:</strong> {system.name}</p>
            <p><strong>Stage:</strong> {approveModal} — {approveModal ? VALIDATION_STAGE_LABELS[approveModal] : ""}</p>
            <p><strong>Documents:</strong> {stages.find((s) => s.key === approveModal)?.documents?.length ?? 0} attached</p>
          </div>
          <div className={clsx("rounded-lg p-3 text-[11px]", isDark ? "bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)]" : "bg-[#f0fdf4] border border-[#a7f3d0]")}>
            <p className="font-semibold text-[#10b981] mb-1">Electronic signature</p>
            <p style={{ color: "var(--text-secondary)" }}>I confirm that the {approveModal} stage has been executed correctly and all documentation is complete.</p>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleApprove}>Approve & Sign</Button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title={`Reject ${rejectModal} Stage`}>
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Stage will be returned to Draft for correction.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason for rejection *</p>
            <textarea rows={3} className="input w-full resize-none" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="What needs to be corrected?" /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="primary" disabled={!rejectReason.trim()} onClick={handleReject}>Reject Stage</Button>
          </div>
        </div>
      </Modal>

      {/* Skip modal */}
      <Modal open={!!skipModal} onClose={() => setSkipModal(null)} title={`Skip ${skipModal} Stage`}>
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Only DS stage can be skipped for Category 4 systems. QA Head approval required.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason *</p>
            <textarea rows={2} className="input w-full resize-none" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="e.g. Category 4 system — DS not required" /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setSkipModal(null)}>Cancel</Button>
            <Button variant="primary" disabled={!skipReason.trim()} icon={SkipForward} onClick={handleSkip}>Confirm Skip</Button>
          </div>
        </div>
      </Modal>

      {/* Delete-document confirmation. Reason ≥ 10 chars per Part 11
          requirement that every soft-delete carry a recorded rationale.
          Server returns server-side error text on validation failure
          (e.g. stage flipped to approved between page load and click). */}
      <Modal
        open={!!deletingDoc}
        onClose={deleteBusy ? () => undefined : () => setDeletingDoc(null)}
        title="Remove stage document"
      >
        {deletingDoc && (
          <div className="space-y-3">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Soft-delete only — the document row stays for audit, but it no
              longer appears in the stage. Reason of at least 10 characters is
              required.
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
              <strong>File:</strong> {deletingDoc.fileName}
            </p>
            <textarea
              className="input text-[12px] min-h-[80px]"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Why is this document being removed?"
              maxLength={2000}
              disabled={deleteBusy}
              aria-label="Deletion reason"
            />
            {deleteError && (
              <p
                role="alert"
                className="text-[11px]"
                style={{ color: "var(--danger)" }}
              >
                {deleteError}
              </p>
            )}
            <div
              className="flex justify-end gap-2 pt-2"
              style={{ borderTop: "1px solid var(--bg-border)" }}
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={deleteBusy}
                onClick={() => setDeletingDoc(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Trash2}
                disabled={deleteBusy || deleteReason.trim().length < 10}
                loading={deleteBusy}
                onClick={() => void handleDeleteDoc()}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Popup isOpen={successPopup} variant="success" title="Stage updated" description={successMsg} onDismiss={() => setSuccessPopup(false)} />
    </div>
  );
}
