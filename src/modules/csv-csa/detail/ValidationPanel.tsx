import { useState } from "react";
import clsx from "clsx";
import { ClipboardList, Pencil, X, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  GxPSystem,
  ValidationStatus,
  RoadmapActivity,
  ValidationStage,
  ValidationStageKey,
} from "@/store/systems.slice";
import { VALIDATION_STAGE_KEYS, VALIDATION_STAGE_LABELS } from "@/store/systems.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function actStatusBadge(s: RoadmapActivity["status"]) {
  const m: Record<string, "green" | "amber" | "blue" | "red"> = { Complete: "green", "In Progress": "amber", Planned: "blue", Overdue: "red" };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}

function ownerName(uid: string, users: UserConfig[]) {
  return users.find((u) => u.id === uid)?.name ?? uid;
}

function getStages(system: GxPSystem): ValidationStage[] {
  const existing = system.validationStages ?? [];
  // Always return all 7 stages in order; default missing ones to pending
  return VALIDATION_STAGE_KEYS.map((k) =>
    existing.find((s) => s.key === k) ?? { key: k, status: "pending" as const },
  );
}

function stageStatusGlyph(status: ValidationStage["status"]): string {
  if (status === "complete") return "\u2713";
  if (status === "in-progress") return "\u223C";
  if (status === "skipped") return "\u2014";
  return "\u25CB";
}

function stageStatusColor(status: ValidationStage["status"]): string {
  if (status === "complete") return "#10b981";
  if (status === "in-progress") return "#f59e0b";
  if (status === "skipped") return "#94a3b8";
  return "#64748b";
}

function stageStatusLabel(status: ValidationStage["status"]): string {
  if (status === "complete") return "Complete";
  if (status === "in-progress") return "In Progress";
  if (status === "skipped") return "Skipped";
  return "Not Started";
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
  onSavePlannedActions, onSaveStage, onSaveNextReview,
}: ValidationPanelProps) {
  /* Local editing state */
  const [editingActions, setEditingActions] = useState(false);
  const [actionsText, setActionsText] = useState(system.plannedActions ?? "");
  const [editingStageKey, setEditingStageKey] = useState<ValidationStageKey | null>(null);
  const [draftStageStatus, setDraftStageStatus] = useState<ValidationStage["status"]>("pending");
  const [draftStageDate, setDraftStageDate] = useState("");
  const [editingNextReview, setEditingNextReview] = useState(false);
  const [draftNextReview, setDraftNextReview] = useState("");

  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) {
    setPrevId(system.id);
    setActionsText(system.plannedActions ?? "");
    setEditingActions(false);
    setEditingStageKey(null);
    setEditingNextReview(false);
  }

  const startEditStage = (stage: ValidationStage) => {
    setEditingStageKey(stage.key);
    setDraftStageStatus(stage.status);
    setDraftStageDate(
      stage.date
        ? dayjs.utc(stage.date).format("YYYY-MM-DD")
        : stage.targetDate
          ? dayjs.utc(stage.targetDate).format("YYYY-MM-DD")
          : "",
    );
  };

  const saveStage = () => {
    if (!editingStageKey) return;
    const patch: ValidationStage = { key: editingStageKey, status: draftStageStatus };
    if (draftStageDate.trim()) {
      const iso = dayjs(draftStageDate).utc().toISOString();
      if (draftStageStatus === "complete") patch.date = iso;
      else if (draftStageStatus === "in-progress") patch.targetDate = iso;
    }
    onSaveStage(patch);
    setEditingStageKey(null);
  };

  const saveNextReview = () => {
    if (!draftNextReview.trim()) {
      setEditingNextReview(false);
      return;
    }
    onSaveNextReview(dayjs(draftNextReview).utc().toISOString());
    setEditingNextReview(false);
  };

  const stages = getStages(system);
  const completedCount = stages.filter((s) => s.status === "complete").length;
  const skippedCount = stages.filter((s) => s.status === "skipped").length;
  // Skipped stages are not counted as completed but they reduce the denominator
  const denominator = stages.length - skippedCount;
  const progressPct = denominator > 0 ? Math.round((completedCount / denominator) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Validation progress — 7 stage breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Validation progress</span>
          <span className="ml-auto text-[14px] font-bold" style={{ color: progressPct >= 80 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#ef4444" }}>
            {progressPct}%
          </span>
        </div>
        <div className="card-body space-y-4">
          {/* Progress bar */}
          <div className="h-2 rounded-full" style={{ background: "var(--bg-elevated)" }} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 80 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>

          {/* Stage chips */}
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Validation stages">
            {stages.map((s) => {
              const color = stageStatusColor(s.status);
              return (
                <div
                  key={s.key}
                  role="listitem"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
                  style={{
                    background: color + "1a",
                    color,
                    border: `1px solid ${color}33`,
                  }}
                  aria-label={`${s.key} ${stageStatusLabel(s.status)}`}
                  title={`${VALIDATION_STAGE_LABELS[s.key]} \u2014 ${stageStatusLabel(s.status)}`}
                >
                  <span>{s.key}</span>
                  <span aria-hidden="true">{stageStatusGlyph(s.status)}</span>
                </div>
              );
            })}
          </div>

          {/* Detailed list — editable per stage */}
          <ol className="list-none p-0 m-0 space-y-2">
            {stages.map((s, i) => {
              const color = stageStatusColor(s.status);
              const label = stageStatusLabel(s.status);
              const dateStr = s.date
                ? dayjs.utc(s.date).tz(timezone).format(dateFormat)
                : s.targetDate
                  ? `target ${dayjs.utc(s.targetDate).tz(timezone).format(dateFormat)}`
                  : null;
              const isEditing = editingStageKey === s.key;
              return (
                <li key={s.key as ValidationStageKey} className="flex items-start gap-3 text-[12px]">
                  <span className="font-semibold shrink-0" style={{ color: "var(--text-muted)", minWidth: "1.25rem" }}>{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{s.key}</span>
                      <span style={{ color: "var(--text-secondary)" }}>&mdash; {VALIDATION_STAGE_LABELS[s.key]}</span>
                      {role !== "viewer" && !isEditing && (
                        <button
                          type="button"
                          onClick={() => startEditStage(s)}
                          aria-label={`Edit stage ${s.key}`}
                          className="ml-auto flex items-center gap-1 text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2 flex items-end gap-2 flex-wrap">
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Status</label>
                          <select
                            value={draftStageStatus}
                            onChange={(e) => setDraftStageStatus(e.target.value as ValidationStage["status"])}
                            className="select text-[11px]"
                            style={{ minWidth: "9rem" }}
                          >
                            <option value="pending">Not Started</option>
                            <option value="in-progress">In Progress</option>
                            <option value="complete">Complete</option>
                            <option value="skipped">Skipped</option>
                          </select>
                        </div>
                        {draftStageStatus !== "skipped" && draftStageStatus !== "pending" && (
                          <div>
                            <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>
                              {draftStageStatus === "complete" ? "Completed on" : "Target date"}
                            </label>
                            <input
                              type="date"
                              value={draftStageDate}
                              onChange={(e) => setDraftStageDate(e.target.value)}
                              className="input text-[11px]"
                            />
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="xs" icon={X} onClick={() => setEditingStageKey(null)} aria-label="Cancel">Cancel</Button>
                          <Button variant="primary" size="xs" icon={Save} onClick={saveStage} aria-label={`Save ${s.key}`}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="font-medium" style={{ color }}>
                          {label} {stageStatusGlyph(s.status)}
                        </span>
                        {dateStr && (
                          <>
                            <span style={{ color: "var(--text-muted)" }} aria-hidden="true">|</span>
                            <span style={{ color: "var(--text-muted)" }}>{dateStr}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="card"><div className="card-header"><span className="card-title">Validation status</span></div><div className="card-body">
        <div className="flex items-center gap-4 flex-wrap">
          {validationBadge(system.validationStatus)}
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Last validated: {system.lastValidated ? dayjs.utc(system.lastValidated).tz(timezone).format(dateFormat) : "Not yet validated"}
          </div>
          {editingNextReview ? (
            <div className="flex items-end gap-2">
              <div>
                <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Next review date</label>
                <input
                  type="date"
                  value={draftNextReview}
                  onChange={(e) => setDraftNextReview(e.target.value)}
                  className="input text-[11px]"
                />
              </div>
              <Button variant="ghost" size="xs" icon={X} onClick={() => setEditingNextReview(false)}>Cancel</Button>
              <Button variant="primary" size="xs" icon={Save} onClick={saveNextReview}>Save</Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <span>
                Next review: {system.nextReview ? dayjs.utc(system.nextReview).tz(timezone).format(dateFormat) : "Not set"}
                {system.nextReview && dayjs.utc(system.nextReview).isBefore(dayjs()) && (
                  <span className="text-[#ef4444] ml-1 font-medium">(Overdue)</span>
                )}
              </span>
              {role !== "viewer" && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftNextReview(system.nextReview ? dayjs.utc(system.nextReview).format("YYYY-MM-DD") : "");
                    setEditingNextReview(true);
                  }}
                  aria-label="Edit next review date"
                  className="flex items-center gap-1 text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div></div>
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Planned validation actions</span></div>
          {role !== "viewer" && (
            <button type="button" onClick={() => { if (editingActions) setActionsText(system.plannedActions ?? ""); setEditingActions((v) => !v); }}
              aria-label={editingActions ? "Cancel editing planned actions" : "Edit planned actions"}
              className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer transition-opacity", editingActions ? "text-[#64748b] hover:text-[#94a3b8]" : "text-[#0ea5e9] hover:opacity-80")}>
              {editingActions ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{editingActions ? "Cancel" : "Edit"}</span>
            </button>
          )}
        </div>
        <div className="card-body">
          {editingActions ? (
            <div className="space-y-3">
              <label htmlFor="actions-input" className="text-[11px] block" style={{ color: "var(--text-muted)" }}>Describe planned IQ/OQ/PQ and remediation activities</label>
              <textarea id="actions-input" rows={4} className="input resize-none w-full text-[12px]" value={actionsText} onChange={(e) => setActionsText(e.target.value)}
                placeholder={"e.g. IQ/OQ/PQ planned Q2 2026.\nAudit trail remediation \u2014 see CAPA-0042.\nE-sig binding fix \u2014 CAPA-0043."} aria-describedby="actions-hint" />
              <p id="actions-hint" className="text-[10px]" style={{ color: "var(--text-muted)" }}>Visible in system detail and roadmap planning.</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => { setActionsText(system.plannedActions ?? ""); setEditingActions(false); }}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Save} type="button" onClick={() => {
                  onSavePlannedActions(actionsText.trim());
                  setEditingActions(false);
                }}>Save</Button>
              </div>
            </div>
          ) : system.plannedActions?.trim() ? (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{system.plannedActions}</p>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No planned actions documented. Click Edit above to add a validation plan.</p>
          )}
        </div>
      </div>
      <div className="card"><div className="card-header"><span className="card-title">Roadmap activities</span></div><div className="card-body">
        {roadmapActivities.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No roadmap activities planned yet.</p>
        ) : (
          <table className="data-table" aria-label={`Roadmap for ${system.name}`}>
            <thead><tr><th scope="col">Activity</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Owner</th></tr></thead>
            <tbody>{roadmapActivities.map((a) => (
              <tr key={a.id}>
                <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</th>
                <td><Badge variant="gray">{a.type}</Badge></td>
                <td>{actStatusBadge(a.status)}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.startDate).format("DD MMM YY")}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.endDate).format("DD MMM YY")}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div></div>
    </div>
  );
}
