"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Lock,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import {
  addActionItem,
  updateActionItem,
  deleteActionItem,
  reorderActionItems,
  loadActionItemsForCAPA,
} from "@/actions/capas";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import { displayUserName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { useToast } from "@/components/ui/Toast";
import type { CAPA, CAPAActionItem } from "@/store/capa.slice";

/* ── SME Section 1, Stage 4 (FULL) — structured Action Plan table ──
 *
 * Lifecycle:
 *   open / in_progress           → full editor
 *     (add / inline-edit / delete / reorder / status)
 *   pending_qa_review            → status-only updates allowed
 *   pending_verification         → status-only updates allowed
 *   closed / rejected            → read-only
 *
 * The server enforces every gate; this UI mirrors them so users see
 * disabled / hidden affordances rather than getting an error after a
 * pointless round-trip. Status changes to "complete" or "skipped" open
 * a modal collecting the required completionNotes (≥ 5 chars).
 *
 * Reorder is via up/down buttons (the simplest stable approach without
 * pulling in a drag-and-drop library; can swap to dnd later).
 */

// Phase B — display-only mapping (underlying enum values unchanged):
// pending → "Not started", in_progress → "In progress", complete → "Done".
const STATUS_LABEL: Record<CAPAActionItem["status"], string> = {
  pending: "Not started",
  in_progress: "In progress",
  complete: "Done",
  skipped: "Skipped",
  rework: "Rework",
};

const STATUS_VARIANT: Record<CAPAActionItem["status"], "gray" | "amber" | "green" | "red"> = {
  pending: "gray",
  in_progress: "amber",
  complete: "green",
  skipped: "red",
  rework: "red",
};

export function ActionItemsSection({ capa, ownerFilter }: { capa: CAPA; ownerFilter?: string | null }) {
  // FIX 3 â€” the action-item mutation server actions (addActionItem /
  // updateActionItem / deleteActionItem / reorderActionItems) all gate on
  // COMPLIANCE_AUTHOR_ROLES. capaCan.canEdit mirrors that exact set, so the
  // UI stops advertising controls (status updates + structural edits) to
  // roles the server rejects (e.g. qc_lab_director, operations_head). NOTE:
  // this also hides the controls from action OWNERS who aren't authors today
  // â€” correct for now (the server already blocks them; owner-access is a
  // later phase). canView stays open so they can still read the plan.
  const capaCan = usePermissions("capa");
  // Phase 3 — assigned-owner access path. An owner who is NOT an author role
  // may still work the task addressed to them (status + completion notes). ID
  // comparison only; viewers are excluded (mirrors the server isAssignedToTask
  // and the server gate in updateActionItem).
  const authUser = useAppSelector((s) => s.auth.user);
  const isViewer = authUser?.role === "viewer";
  const { users } = useTenantConfig();
  const toast = useToast();
  // Live items — seeded from the Redux CAPA prop, refetched on every
  // successful mutation so the row state stays consistent with the
  // server (sequence renumbers, auto-invalidate cascade, etc.).
  const [items, setItems] = useState<CAPAActionItem[]>(capa.actionItems ?? []);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const result = await loadActionItemsForCAPA(capa.id);
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    // Server returns full Prisma rows with Date objects; coerce dates
    // to ISO so the Redux CAPAActionItem shape stays consistent.
    const rows = (result.data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      capaId: String(r.capaId),
      sequence: Number(r.sequence),
      description: String(r.description),
      owner: String(r.owner),
      ownerId: r.ownerId as string | null,
      dueDate:
        r.dueDate instanceof Date
          ? r.dueDate.toISOString()
          : String(r.dueDate),
      status: String(r.status) as CAPAActionItem["status"],
      completedBy: r.completedBy as string | null,
      completedById: r.completedById as string | null,
      completedAt:
        r.completedAt instanceof Date
          ? r.completedAt.toISOString()
          : (r.completedAt as string | null),
      completionNotes: r.completionNotes as string | null,
      reworkReason: r.reworkReason as string | null,
      reworkRequestedById: r.reworkRequestedById as string | null,
      reworkRequestedAt:
        r.reworkRequestedAt instanceof Date
          ? r.reworkRequestedAt.toISOString()
          : (r.reworkRequestedAt as string | null),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      createdBy: String(r.createdBy),
      createdById: r.createdById as string | null,
      updatedAt:
        r.updatedAt instanceof Date
          ? r.updatedAt.toISOString()
          : String(r.updatedAt),
    }));
    setItems(rows);
  }, [capa.id]);

  useEffect(() => {
    setItems(capa.actionItems ?? []);
  }, [capa.actionItems, capa.id]);

  // Phase 6 — person filter (Worklist/detail pill tap). Filters the rendered
  // rows to one owner; null = everyone. Filtering is display-only.
  const visibleItems = ownerFilter ? items.filter((i) => i.ownerId === ownerFilter) : items;

  // Lock state mirrors the server invariants. closed/rejected = no
  // mutations at all. pending_qa_review / pending_verification = only
  // status-only updates allowed.
  const isTerminal = capa.status === "closed" || capa.status === "rejected";
  const isLocked = LOCKED_CAPA_STATUSES.has(capa.status);
  // Gated on capaCan.canEdit (COMPLIANCE_AUTHOR_ROLES) to match the server.
  // Structural edits + skip stay author-only.
  const canStructuralEdit = !isTerminal && !isLocked && capaCan.canEdit;
  const canStatusUpdate = !isTerminal && capaCan.canEdit;
  // Phase 3 — the assigned owner of THIS row may set in-progress / complete
  // (+ notes), even without an author role. Skip + structural remain author-only
  // (the server rejects owner skip/structural edits).
  function isAssignedOwner(item: CAPAActionItem): boolean {
    return !isViewer && !!item.ownerId && item.ownerId === authUser?.id;
  }
  function canOwnerStatus(item: CAPAActionItem): boolean {
    return !isTerminal && isAssignedOwner(item);
  }

  // Add-row state.
  const [addOpen, setAddOpen] = useState(false);
  const [addDesc, setAddDesc] = useState("");
  const [addOwner, setAddOwner] = useState("");
  const [addDueDate, setAddDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit-row state.
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  // editError surfaces through loadError until a per-row error band is
  // added; held in a ref-like setState slot for future use.
  const [, setEditError] = useState<string | null>(null);

  // Status-change modal (complete / skipped require notes).
  const [statusModalItem, setStatusModalItem] = useState<CAPAActionItem | null>(null);
  const [statusModalTarget, setStatusModalTarget] = useState<"complete" | "skipped" | null>(null);
  const [statusNotes, setStatusNotes] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);

  // Delete modal (requires reason ≥ 5 chars).
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Batch 4 Part 2 — assignable owners = active tenant users in fixer-eligible
  // roles (exclude super_admin, who is walled to /admin and can't author GxP,
  // and viewer). Each option shows NAME — ROLE (friendly label).
  const ownerOptions = useMemo(
    () =>
      users
        .filter((u) => u.status === "Active" && u.role !== "super_admin" && u.role !== "viewer")
        .map((u) => ({ value: u.id, label: `${u.name} — ${roleLabel(u.role)}` })),
    [users],
  );

  const userNameById = useCallback(
    (id: string) => displayUserName(id, users),
    [users],
  );

  // ── Mutations ──

  const handleAdd = async () => {
    if (addDesc.trim().length < 3) {
      setAddError("Add an action description (at least 3 characters).");
      return;
    }
    if (!addOwner) {
      setAddError("Owner is required.");
      return;
    }
    if (!addDueDate) {
      setAddError("Due date is required.");
      return;
    }
    setBusy(true);
    setAddError(null);
    const ownerName = userNameById(addOwner);
    const result = await addActionItem(capa.id, {
      description: addDesc.trim(),
      owner: ownerName,
      ownerId: addOwner,
      dueDate: dayjs(addDueDate).utc().toISOString(),
    });
    setBusy(false);
    if (!result.success) {
      setAddError(result.error);
      toast.error(result.error || "Could not add action item.");
      return;
    }
    setAddOpen(false);
    setAddDesc("");
    setAddOwner("");
    setAddDueDate("");
    toast.success("Action item added.");
    await refresh();
  };

  const handleEdit = async () => {
    if (!editId) return;
    if (editDesc.trim().length < 3) {
      setEditError("Add an action description (at least 3 characters).");
      return;
    }
    if (!editOwner) {
      setEditError("Owner is required.");
      return;
    }
    if (!editDueDate) {
      setEditError("Due date is required.");
      return;
    }
    setBusy(true);
    setEditError(null);
    const ownerName = userNameById(editOwner);
    const result = await updateActionItem(editId, {
      description: editDesc.trim(),
      owner: ownerName,
      ownerId: editOwner,
      dueDate: dayjs(editDueDate).utc().toISOString(),
    });
    setBusy(false);
    if (!result.success) {
      setEditError(result.error);
      toast.error(result.error || "Could not update action item.");
      return;
    }
    setEditId(null);
    toast.success("Action item updated.");
    await refresh();
  };

  const handleStatusChangeSimple = async (
    item: CAPAActionItem,
    target: "pending" | "in_progress",
  ) => {
    setBusy(true);
    const result = await updateActionItem(item.id, { status: target });
    setBusy(false);
    if (!result.success) {
      setLoadError(result.error);
      toast.error(result.error || "Could not update status.");
      return;
    }
    toast.success("Status updated.");
    await refresh();
  };

  const handleStatusChangeWithNotes = async () => {
    if (!statusModalItem || !statusModalTarget) return;
    if (statusNotes.trim().length < 5) {
      setStatusError("Add a brief note (at least 5 characters).");
      return;
    }
    setBusy(true);
    setStatusError(null);
    const result = await updateActionItem(statusModalItem.id, {
      status: statusModalTarget,
      completionNotes: statusNotes.trim(),
    });
    setBusy(false);
    if (!result.success) {
      setStatusError(result.error);
      toast.error(result.error || "Could not update status.");
      return;
    }
    setStatusModalItem(null);
    setStatusModalTarget(null);
    setStatusNotes("");
    toast.success("Status updated.");
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (deleteReason.trim().length < 5) {
      setDeleteError("Add a brief reason (at least 5 characters).");
      return;
    }
    setBusy(true);
    setDeleteError(null);
    const result = await deleteActionItem(deleteId, { reason: deleteReason.trim() });
    setBusy(false);
    if (!result.success) {
      setDeleteError(result.error);
      toast.error(result.error || "Could not delete action item.");
      return;
    }
    setDeleteId(null);
    setDeleteReason("");
    toast.success("Action item deleted.");
    await refresh();
  };

  const handleReorder = async (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= items.length) return;
    const newOrder = [...items];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(target, 0, moved);
    setBusy(true);
    const result = await reorderActionItems(capa.id, {
      orderedIds: newOrder.map((i) => i.id),
    });
    setBusy(false);
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    await refresh();
  };

  const overdueDays = (item: CAPAActionItem): number | null => {
    if (item.status === "complete" || item.status === "skipped") return null;
    const due = dayjs.utc(item.dueDate);
    const now = dayjs();
    if (due.isAfter(now)) return null;
    return now.diff(due, "day");
  };

  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="action-items-heading"
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          id="action-items-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Action Plan
        </h3>
        <Badge variant={items.length > 0 ? "blue" : "gray"}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </Badge>
      </div>

      {isLocked && !isTerminal && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2 mb-3"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            Action plan locked during QA review. Status updates (mark complete / skipped) remain available; structural edits do not.
          </p>
        </div>
      )}
      {isTerminal && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2 mb-3"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            CAPA has reached a terminal state — action items are read-only.
          </p>
        </div>
      )}

      {loadError && (
        <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <p
          className="text-[12px] italic mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          {ownerFilter
            ? "(none of theirs) — no action items owned by the filtered person."
            : `Add action items and assign each to a person. Each task appears in that person's Worklist. ${canStructuralEdit ? "Add the first step below." : "The author has not yet defined the action plan."}`}
        </p>
      ) : (
        <table className="w-full text-[11px] mb-3" role="table">
          <thead>
            <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--bg-border)" }}>
              <th className="text-left py-1 pr-2 w-6">#</th>
              <th className="text-left py-1 pr-2">Description</th>
              <th className="text-left py-1 pr-2 w-32">Owner</th>
              <th className="text-left py-1 pr-2 w-28">Due</th>
              <th className="text-left py-1 pr-2 w-28">Status</th>
              <th className="text-right py-1 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              // Keep idx tied to the full list so reorder stays correct; skip
              // rendering rows filtered out by the active person filter.
              if (ownerFilter && item.ownerId !== ownerFilter) return null;
              const overdue = overdueDays(item);
              const isEditing = editId === item.id;
              return (
                <tr
                  key={item.id}
                  style={{
                    color: "var(--text-secondary)",
                    borderBottom: "1px solid var(--bg-border)",
                  }}
                >
                  <td className="py-2 pr-2 align-top font-mono">{item.sequence}</td>
                  <td className="py-2 pr-2 align-top">
                    {isEditing ? (
                      <textarea
                        className="input text-[11px] min-h-[40px] w-full"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                      />
                    ) : (
                      <span style={{ color: "var(--text-primary)" }}>{item.description}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    {isEditing ? (
                      <Dropdown
                        value={editOwner}
                        onChange={setEditOwner}
                        options={ownerOptions}
                        width="w-full"
                      />
                    ) : (
                      item.owner
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    {isEditing ? (
                      <input
                        type="date"
                        className="input text-[11px] w-full"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                      />
                    ) : (
                      <>
                        <div>{dayjs.utc(item.dueDate).format("DD MMM")}</div>
                        {overdue !== null && (
                          <Badge variant="red">
                            Overdue {overdue}d
                          </Badge>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <Badge variant={STATUS_VARIANT[item.status]}>
                      {STATUS_LABEL[item.status]}
                    </Badge>
                    {item.status === "complete" && item.completedBy && (
                      <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        by {item.completedBy}
                        {item.completedAt && <> · {dayjs(item.completedAt).fromNow()}</>}
                      </div>
                    )}
                    {/* Phase 4 — surface why QA sent this item back for rework. */}
                    {item.status === "rework" && item.reworkReason && (
                      <div className="text-[10px] mt-1" style={{ color: "var(--danger)" }} title={item.reworkReason}>
                        Returned: {item.reworkReason}
                      </div>
                    )}
                  </td>
                  <td className="py-2 align-top text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setEditId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => void handleEdit()}
                          disabled={busy}
                          loading={busy}
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1 flex-wrap">
                        {/* Status quick-actions — author OR assigned owner.
                            "rework" items can also be picked back up (the
                            Phase-4 repair walk: rework → in_progress → complete). */}
                        {(canStatusUpdate || canOwnerStatus(item)) && (item.status === "pending" || item.status === "rework") && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Clock}
                            onClick={() => void handleStatusChangeSimple(item, "in_progress")}
                            disabled={busy}
                            title="Mark in progress"
                          />
                        )}
                        {(canStatusUpdate || canOwnerStatus(item)) && item.status !== "complete" && item.status !== "skipped" && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={CheckCircle2}
                            onClick={() => {
                              setStatusModalItem(item);
                              setStatusModalTarget("complete");
                            }}
                            disabled={busy}
                            title="Mark complete"
                          />
                        )}
                        {/* Skip stays author-only (server rejects owner skip). */}
                        {canStatusUpdate && item.status !== "complete" && item.status !== "skipped" && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={XCircle}
                            onClick={() => {
                              setStatusModalItem(item);
                              setStatusModalTarget("skipped");
                            }}
                            disabled={busy}
                            title="Skip"
                          />
                        )}
                        {/* Structural editor — only when unlocked */}
                        {canStructuralEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={ArrowUp}
                              onClick={() => void handleReorder(idx, -1)}
                              disabled={busy || idx === 0}
                              title="Move up"
                            />
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={ArrowDown}
                              onClick={() => void handleReorder(idx, +1)}
                              disabled={busy || idx === items.length - 1}
                              title="Move down"
                            />
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={Pencil}
                              onClick={() => {
                                setEditId(item.id);
                                setEditDesc(item.description);
                                setEditOwner(item.ownerId ?? "");
                                setEditDueDate(dayjs.utc(item.dueDate).format("YYYY-MM-DD"));
                              }}
                              disabled={busy}
                              title="Edit"
                            />
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={Trash2}
                              onClick={() => setDeleteId(item.id)}
                              disabled={busy}
                              title="Delete"
                            />
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Batch 4 Part 1 — Add action item via a proper modal (was inline). */}
      {canStructuralEdit && (
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
          Add action item
        </Button>
      )}
      {addOpen && (
        <Modal
          open
          onClose={busy ? () => undefined : () => { setAddOpen(false); setAddDesc(""); setAddOwner(""); setAddDueDate(""); setAddError(null); }}
          title="Add action item"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setAddOpen(false); setAddDesc(""); setAddOwner(""); setAddDueDate(""); setAddError(null); }}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Plus} disabled={busy} loading={busy} onClick={() => void handleAdd()}>Create</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="ai-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Action <span className="text-(--danger)">*</span></label>
              <textarea id="ai-desc" rows={3} className="input text-[12px] w-full resize-none" value={addDesc} onChange={(e) => setAddDesc(e.target.value)} placeholder="Describe the action to take (≥ 3 characters)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p>
                <Dropdown value={addOwner} onChange={setAddOwner} options={ownerOptions} placeholder="Select owner" width="w-full" />
              </div>
              <div>
                <label htmlFor="ai-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label>
                <input id="ai-due" type="date" className="input text-[12px]" value={addDueDate} onChange={(e) => setAddDueDate(e.target.value)} />
              </div>
            </div>
            {addError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{addError}</p>}
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>The owner sees this task in their Worklist.</p>
          </div>
        </Modal>
      )}

      {/* Status-change modal — notes required for complete + skipped. */}
      {statusModalItem && statusModalTarget && (
        <Modal
          open
          onClose={busy ? () => undefined : () => {
            setStatusModalItem(null);
            setStatusModalTarget(null);
            setStatusNotes("");
            setStatusError(null);
          }}
          title={
            statusModalTarget === "complete"
              ? "Mark action item complete"
              : "Skip action item"
          }
        >
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            #{statusModalItem.sequence}: {statusModalItem.description}
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            placeholder={
              statusModalTarget === "complete"
                ? "Completion notes (≥ 5 chars) — what was done?"
                : "Skip justification (≥ 5 chars) — why is this no longer needed?"
            }
            maxLength={2000}
            disabled={busy}
          />
          {statusError && (
            <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
              {statusError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStatusModalItem(null);
                setStatusModalTarget(null);
                setStatusNotes("");
                setStatusError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={statusModalTarget === "complete" ? CheckCircle2 : XCircle}
              onClick={() => void handleStatusChangeWithNotes()}
              disabled={busy || statusNotes.trim().length < 5}
              loading={busy}
            >
              {statusModalTarget === "complete" ? "Mark complete" : "Skip"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation modal. */}
      {deleteId && (
        <Modal
          open
          onClose={busy ? () => undefined : () => {
            setDeleteId(null);
            setDeleteReason("");
            setDeleteError(null);
          }}
          title="Delete action item"
        >
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            This action is recorded in the audit trail. Provide a reason ≥ 5 characters.
          </p>
          <textarea
            className="input text-[12px] min-h-[60px] mb-2"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Why is this item being removed?"
            maxLength={2000}
            disabled={busy}
          />
          {deleteError && (
            <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
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
              onClick={() => {
                setDeleteId(null);
                setDeleteReason("");
                setDeleteError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              onClick={() => void handleDelete()}
              disabled={busy || deleteReason.trim().length < 5}
              loading={busy}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Silence "unused" warning on lucide-react ChevronDown import — kept
// available for a future "expand row" affordance.
void ChevronDown;
