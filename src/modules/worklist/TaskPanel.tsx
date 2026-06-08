"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, FileUp, Lock, MessageSquare } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { updateActionItem } from "@/actions/capas";
import { addEvidenceFile, initializeEvidenceForCAPA } from "@/actions/evidence";
import { addCAPAComment } from "@/actions/capa-comments";
import { getActionItemTask, type TaskDetail } from "@/actions/worklist";

/**
 * Phase 5 — the fixer's task view. Read-only context (parent CAPA, the action
 * description = QA's instruction, the approved RCA = the "why", rework reason)
 * plus EXACTLY the Phase-3 keyhole: status (in progress / complete+notes),
 * action-scoped file upload, action-scoped comment. No structural edits, no
 * approve/reject/verify/close. When the CAPA isn't open/in_progress the panel
 * is read-only with the lock explained.
 */
export function TaskPanel({
  actionItemId,
  currentUserId,
  isAuthor,
  isViewer,
  onClose,
  onChanged,
}: {
  actionItemId: string;
  currentUserId: string;
  isAuthor: boolean;
  isViewer: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getActionItemTask(actionItemId);
    if (!res.success) { setLoadError(res.error); return; }
    setDetail(res.data);
  }, [actionItemId]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => { await load(); onChanged(); };

  if (loadError) {
    return (
      <Modal open onClose={onClose} title="Task">
        <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{loadError}</p>
      </Modal>
    );
  }
  if (!detail) {
    return (
      <Modal open onClose={onClose} title="Task">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
      </Modal>
    );
  }

  const { action, capa, files, comments } = detail;
  const isOwner = action.ownerId === currentUserId;
  const isDriver = capa.ownerId === currentUserId;
  const editableStatus = capa.status === "open" || capa.status === "in_progress";
  const locked = !editableStatus;
  // Keyhole gates (mirror the server owner/driver paths):
  const canStatus = !isViewer && !locked && (isOwner || isAuthor);
  const canUpload = !isViewer && !locked && (isOwner || isAuthor);
  const canComment = !isViewer && !locked && (isOwner || isAuthor || isDriver);

  async function setStatus(target: "in_progress" | "complete") {
    setBusy(true); setErr(null);
    const input = target === "complete" ? { status: target, completionNotes: notes.trim() } : { status: target };
    const res = await updateActionItem(action.id, input);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Update failed"); return; }
    setCompleting(false); setNotes("");
    await refresh();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    let evidenceItemId = detail!.defaultEvidenceItemId;
    if (!evidenceItemId) {
      const init = await initializeEvidenceForCAPA(capa.id);
      if (!init.success) { setBusy(false); setErr(init.error || "Could not prepare evidence storage"); return; }
      const re = await getActionItemTask(actionItemId);
      evidenceItemId = re.success ? re.data.defaultEvidenceItemId : null;
    }
    if (!evidenceItemId) { setBusy(false); setErr("No evidence category available."); return; }
    const fd = new FormData();
    fd.set("file", file);
    const res = await addEvidenceFile(evidenceItemId, fd, action.id);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.success) { setErr(res.error || "Upload failed"); return; }
    await refresh();
  }

  async function postComment() {
    if (comment.trim().length < 5) { setErr("Comment must be at least 5 characters."); return; }
    setBusy(true); setErr(null);
    const res = await addCAPAComment(capa.id, { body: comment.trim(), actionItemId: action.id });
    setBusy(false);
    if (!res.success) { setErr(res.error || "Comment failed"); return; }
    setComment("");
    await refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Task · ${capa.reference ?? capa.id.slice(0, 8)}`}>
      {/* Context (read-only) */}
      <div className="mb-3">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {capa.reference ?? capa.id.slice(0, 8)} · {capa.title} · CAPA due {capa.dueDate ? dayjs.utc(capa.dueDate).format("DD MMM YYYY") : "—"}
        </p>
        <p className="text-[13px] font-medium mt-2" style={{ color: "var(--text-primary)" }}>{action.description}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Due {dayjs.utc(action.dueDate).format("DD MMM YYYY")} · <Badge variant={action.status === "rework" ? "red" : action.status === "complete" ? "green" : "amber"}>{action.status}</Badge>
        </p>
        {action.status === "rework" && action.reworkReason && (
          <div className="alert mt-2 flex items-start gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger)" }}>
            <span className="text-[11px]" style={{ color: "var(--danger)" }}><strong>Returned for rework:</strong> {action.reworkReason}</span>
          </div>
        )}
      </div>

      {/* Approved RCA (the "why") — read-only */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Root cause (approved)</p>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {capa.rca?.trim() ? capa.rca : <em>No RCA text recorded.</em>}
          {capa.rcaApproved === true && <Badge variant="green">QA approved</Badge>}
        </p>
      </div>

      {locked && (
        <div role="status" className="alert alert-info flex items-start gap-2 mb-3">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            This CAPA is <strong>{capa.status.replace(/_/g, " ")}</strong> — tasks are read-only until it returns to investigation.
          </p>
        </div>
      )}

      {/* Status controls */}
      {canStatus && (
        <div className="mb-3">
          {!completing ? (
            <div className="flex gap-2">
              {action.status !== "in_progress" && action.status !== "complete" && (
                <Button variant="secondary" size="sm" icon={Clock} disabled={busy} onClick={() => void setStatus("in_progress")}>Mark in progress</Button>
              )}
              {action.status !== "complete" && (
                <Button variant="primary" size="sm" icon={CheckCircle2} disabled={busy} onClick={() => setCompleting(true)}>Mark complete</Button>
              )}
            </div>
          ) : (
            <div className="rounded-md p-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
              <textarea className="input text-[12px] w-full min-h-20" placeholder="Completion notes (≥ 5 chars) — what was done?" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setCompleting(false); setNotes(""); }}>Cancel</Button>
                <Button variant="primary" size="sm" disabled={busy || notes.trim().length < 5} loading={busy} onClick={() => void setStatus("complete")}>Confirm complete</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Files (action-scoped) */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Attached files</p>
        {files.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No files yet.</p>
        ) : (
          <ul className="list-none p-0 m-0 space-y-1">
            {files.map((f) => (
              <li key={f.id} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {f.fileName} <span style={{ color: "var(--text-muted)" }}>· {f.uploadedBy} · {dayjs.utc(f.createdAt).format("DD MMM")}</span>
              </li>
            ))}
          </ul>
        )}
        {canUpload && (
          <div className="mt-1">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} />
            <Button variant="ghost" size="xs" icon={FileUp} disabled={busy} onClick={() => fileRef.current?.click()}>Upload proof</Button>
          </div>
        )}
      </div>

      {/* Comments (action-scoped) */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <MessageSquare className="w-3 h-3" aria-hidden="true" /> Discussion
        </p>
        {comments.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No comments yet.</p>
        ) : (
          <ul className="list-none p-0 m-0 space-y-2 mb-2">
            {comments.map((c) => (
              <li key={c.id} className="text-[11px]">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.authorName}</span>
                <span style={{ color: "var(--text-muted)" }}> · {dayjs.utc(c.createdAt).format("DD MMM HH:mm")}</span>
                <p style={{ color: "var(--text-secondary)" }}>{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {canComment && (
          <div className="flex gap-2 items-end">
            <textarea className="input text-[12px] flex-1 min-h-10" placeholder="Add a comment (≥ 5 chars)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} />
            <Button variant="secondary" size="sm" disabled={busy || comment.trim().length < 5} onClick={() => void postComment()}>Post</Button>
          </div>
        )}
      </div>

      {err && <p role="alert" className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>{err}</p>}
    </Modal>
  );
}
