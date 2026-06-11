"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Send, Wrench } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { getSeverityVariant } from "@/lib/badgeVariants";
import { submitForReview } from "@/actions/capas";
import { updateEvidenceStatus, initializeEvidenceForCAPA } from "@/actions/evidence";
import type { Worklist, WorklistGroup, WorklistItem } from "@/lib/queries/worklist";
import { TaskPanel } from "./TaskPanel";
import { StatusPill, ACTION_STATUS_TOKEN } from "@/modules/capa/lib/statusTokens";

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
  rework: "Rework",
};
const EVIDENCE_LABEL: Record<string, string> = {
  BATCH_RECORDS: "Batch records",
  TRAINING_RECORDS: "Training records",
  EQUIPMENT_LOGS: "Equipment logs",
  ENVIRONMENTAL_DATA: "Environmental data",
  DEVIATION_HISTORY: "Deviation history",
  WITNESS_INTERVIEWS: "Witness interviews",
  SUPPLIER_DATA: "Supplier data",
};

const ROLE_LABEL: Record<string, string> = {
  qa_head: "QA Head",
  qc_lab_director: "QC Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  customer_admin: "Administrator",
  csv_val_lead: "CSV Validation Lead",
  operations_head: "Operations Head",
  it_cdo: "IT / CDO",
  viewer: "Viewer",
};

function overdueDays(dueIso: string, status: string): number | null {
  if (status === "complete" || status === "skipped") return null;
  const d = dayjs.utc(dueIso);
  if (d.isAfter(dayjs())) return null;
  return dayjs().diff(d, "day");
}

export function WorklistPage({
  worklist,
  currentUserId,
  currentUserName,
  currentUserRole,
}: {
  worklist: Worklist;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const capaCan = usePermissions("capa");
  const isViewer = currentUserRole === "viewer";
  const canWrite = !isViewer;

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyCapa, setBusyCapa] = useState<string | null>(null);
  const [naModal, setNaModal] = useState<{ evidenceItemId: string; category: string } | null>(null);
  const [naReason, setNaReason] = useState("");
  const [naError, setNaError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const reworkItems: { item: WorklistItem; group: WorklistGroup }[] = worklist.groups.flatMap((g) =>
    g.items.filter((i) => i.status === "rework").map((item) => ({ item, group: g })),
  );

  async function handleSubmit(capaId: string) {
    setBusyCapa(capaId);
    const res = await submitForReview(capaId);
    setBusyCapa(null);
    if (!res.success) { setBanner(res.error || "Submit failed"); return; }
    setBanner("Submitted for QA review.");
    router.refresh();
  }

  async function handleInitEvidence(capaId: string) {
    setBusyCapa(capaId);
    const res = await initializeEvidenceForCAPA(capaId);
    setBusyCapa(null);
    if (!res.success) { setBanner(res.error || "Could not set up evidence"); return; }
    router.refresh();
  }

  async function handleMarkNA() {
    if (!naModal) return;
    if (naReason.trim().length < 10) { setNaError("Add a brief reason (at least 10 characters)."); return; }
    const res = await updateEvidenceStatus(naModal.evidenceItemId, { status: "NOT_APPLICABLE", naReason: naReason.trim() });
    if (!res.success) { setNaError(res.error || "Failed"); toast.error(res.error || "Could not update evidence."); return; }
    setNaModal(null);
    setNaReason("");
    setNaError(null);
    toast.success("Evidence updated.");
    router.refresh();
  }

  return (
    <div className="capa-shell min-h-full">
    <div className="p-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-5">
        <h1 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>My Worklist</h1>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {currentUserName} · {ROLE_LABEL[currentUserRole] ?? currentUserRole}
          {isViewer && " · read-only"}
        </p>
        <div className="flex gap-4 mt-3 text-[12px]">
          <span style={{ color: "var(--text-secondary)" }}>Open tasks: <strong style={{ color: "var(--text-primary)" }}>{worklist.openCount}</strong></span>
          <span style={{ color: "var(--text-secondary)" }}>Needs rework: <strong style={{ color: worklist.reworkCount > 0 ? "var(--status-blocked)" : "var(--text-primary)" }}>{worklist.reworkCount}</strong></span>
          <span style={{ color: "var(--text-secondary)" }}>Next due: <strong style={{ color: "var(--text-primary)" }}>{worklist.nextDue ? dayjs.utc(worklist.nextDue).format("DD MMM YYYY") : "—"}</strong></span>
        </div>
      </div>

      {banner && (
        <div role="status" className="alert alert-info mb-4 flex items-center justify-between">
          <span className="text-[12px]">{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-[11px] underline bg-transparent border-none cursor-pointer">Dismiss</button>
        </div>
      )}

      {worklist.groups.length === 0 && (
        <div className="card p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Nothing assigned to you right now.</p>
        </div>
      )}

      {/* ── NEEDS REWORK (across all CAPAs) ── */}
      {reworkItems.length > 0 && (
        <section className="mb-6" aria-labelledby="rework-heading">
          <h2 id="rework-heading" className="text-[12px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--status-blocked)" }}>
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Needs rework ({reworkItems.length})
          </h2>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--status-blocked)" }}>
            {reworkItems.map(({ item, group }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedTaskId(item.id)}
                className="w-full text-left flex items-start gap-3 p-3 border-none cursor-pointer"
                style={{ background: "var(--status-blocked-bg)", borderBottom: "1px solid var(--bg-border)" }}
              >
                <Wrench className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--status-blocked)" }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.description}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {group.capa.reference ?? group.capa.id.slice(0, 8)} · due {dayjs.utc(item.dueDate).format("DD MMM")}
                  </p>
                  {item.reworkReason && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--status-blocked)" }}>Returned: {item.reworkReason}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Per-CAPA groups ── */}
      {worklist.groups.map((group) => {
        const openItems = group.items.filter((i) => i.status === "pending" || i.status === "in_progress");
        const doneItems = group.items.filter((i) => i.status === "complete" || i.status === "skipped");
        const reworkInGroup = group.items.filter((i) => i.status === "rework");
        return (
          <section key={group.capa.id} className="mb-5 card p-0 overflow-hidden">
            {/* Group header */}
            <div className="p-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{group.capa.reference ?? group.capa.id.slice(0, 8)}</span>
                <Badge variant={getSeverityVariant(group.capa.risk, "generic")}>{group.capa.risk}</Badge>
                {group.capa.isDriver && <Badge variant="blue">You drive this</Badge>}
              </div>
              <p className="text-[13px] font-medium mt-1" style={{ color: "var(--text-primary)" }}>{group.capa.title}</p>

              {/* Driver extras */}
              {group.capa.isDriver && group.readiness && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--bg-border)" }}>
                  <p className="text-[11px] mb-1" style={{ color: group.readiness.allMet ? "var(--status-done)" : "var(--text-secondary)" }}>
                    Readiness: <strong>{group.readiness.metCount} of {group.readiness.total}</strong> conditions met
                    {!group.readiness.allMet && (
                      <> — outstanding: {group.readiness.conditions.filter((c) => !c.met).map((c) => c.label).join("; ")}</>
                    )}
                  </p>

                  {group.evidenceNeedsInit && canWrite && (
                    <Button variant="secondary" size="xs" disabled={busyCapa === group.capa.id} onClick={() => void handleInitEvidence(group.capa.id)}>
                      Set up evidence categories
                    </Button>
                  )}

                  {/* Unanswered evidence quick rows — driver may mark N/A */}
                  {(group.unansweredEvidence ?? []).length > 0 && (
                    <ul className="list-none p-0 m-0 mt-1 space-y-1">
                      {group.unansweredEvidence!.map((ev) => (
                        <li key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span style={{ color: "var(--text-secondary)" }}>{EVIDENCE_LABEL[ev.category] ?? ev.category} · {ev.status}</span>
                          {canWrite && (
                            <button
                              type="button"
                              className="text-[11px] underline bg-transparent border-none cursor-pointer"
                              style={{ color: "var(--brand)" }}
                              onClick={() => { setNaModal({ evidenceItemId: ev.id, category: ev.category }); setNaReason(""); setNaError(null); }}
                            >
                              Mark N/A &rsaquo;
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Submit for review — driver only, enabled when allMet */}
                  {canWrite && (
                    <div className="mt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Send}
                        disabled={!group.readiness.allMet || busyCapa === group.capa.id}
                        loading={busyCapa === group.capa.id}
                        onClick={() => void handleSubmit(group.capa.id)}
                        title={group.readiness.allMet ? "Submit for QA review" : "Resolve all readiness conditions first"}
                      >
                        Submit for review
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rows */}
            <div>
              {reworkInGroup.map((item) => (
                <Row key={item.id} item={item} onOpen={() => setSelectedTaskId(item.id)} />
              ))}
              {openItems.map((item) => (
                <Row key={item.id} item={item} onOpen={() => setSelectedTaskId(item.id)} />
              ))}
              {group.items.length === 0 && (
                <p className="text-[11px] italic p-3" style={{ color: "var(--text-muted)" }}>
                  No action items assigned to you on this CAPA.
                </p>
              )}
            </div>

            {/* Done / awaiting — collapsed */}
            {doneItems.length > 0 && (
              <details className="px-3 pb-2">
                <summary className="text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  {doneItems.length} done / awaiting
                </summary>
                <div className="mt-1">
                  {doneItems.map((item) => (
                    <Row key={item.id} item={item} onOpen={() => setSelectedTaskId(item.id)} muted />
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}

      {/* Task panel */}
      {selectedTaskId && (
        <TaskPanel
          actionItemId={selectedTaskId}
          currentUserId={currentUserId}
          isAuthor={capaCan.canEdit}
          isViewer={isViewer}
          onClose={() => setSelectedTaskId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* N/A reason modal */}
      {naModal && (
        <Modal open onClose={() => { setNaModal(null); setNaError(null); }} title={`Mark "${EVIDENCE_LABEL[naModal.category] ?? naModal.category}" Not Applicable`}>
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            Record why this evidence category does not apply (≥ 10 characters).
          </p>
          <textarea
            className="input text-[12px] w-full min-h-20"
            value={naReason}
            onChange={(e) => setNaReason(e.target.value)}
            maxLength={2000}
          />
          {naError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{naError}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => { setNaModal(null); setNaError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => void handleMarkNA()} disabled={naReason.trim().length < 10}>Mark N/A</Button>
          </div>
        </Modal>
      )}
    </div>
    </div>
  );
}

function Row({ item, onOpen, muted }: { item: WorklistItem; onOpen: () => void; muted?: boolean }) {
  const od = overdueDays(item.dueDate, item.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 border-none cursor-pointer bg-transparent hover:bg-(--bg-hover)"
      style={{ borderBottom: "1px solid var(--bg-border)", opacity: muted ? 0.6 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate" style={{ color: "var(--text-primary)" }}>{item.description}</p>
        <p className="text-[11px]" style={{ color: od !== null ? "var(--status-blocked)" : "var(--text-muted)" }}>
          Due {dayjs.utc(item.dueDate).format("DD MMM")}{od !== null && ` · Overdue ${od}d`}
        </p>
      </div>
      <StatusPill token={ACTION_STATUS_TOKEN[item.status] ?? "pending"}>{ITEM_STATUS_LABEL[item.status] ?? item.status}</StatusPill>
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
    </button>
  );
}
