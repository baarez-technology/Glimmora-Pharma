"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Calendar, Users, Clock, CheckCircle2, X, GraduationCap, UserCog, RotateCcw, Archive } from "lucide-react";
import type { Inspection, Simulation, TrainingRecord } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { createSimulation, completeSimulation } from "@/actions/inspections";
import { assignTraining, reassignTraining, completeTraining, reopenTraining, archiveTrainingRecord } from "@/actions/training";
import { trainingDisplayStatus, isTrainingOverdue } from "@/lib/training";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { useErrorPopup } from "@/components/ui/ErrorPopup";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { StatusBadge } from "@/components/shared";
import { SIMULATION_STATUSES, TRAINING_RECORD_STATUSES } from "@/constants/statusTaxonomy";

type InspectionWithTraining = Inspection & {
  simulations: Simulation[];
  trainingRecords: TrainingRecord[];
};

/** A person who can be assigned to a simulation. */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

export interface TrainingPrismaTabProps {
  inspection: InspectionWithTraining;
  isAdmin: boolean;
  /** Eligible participants for the simulation picker (tenant users). */
  teamMembers: TeamMember[];
}

const SIM_TYPES = [
  "Mock Inspection",
  "Table-Top Exercise",
  "Document Drill",
  "Front Room Practice",
  "Back Room Practice",
];

interface SimForm {
  title: string;
  type: string;
  duration: number;
  scheduledAt: string;
  participantIds: string[];
}

interface TrainingForm {
  userId: string;
  module: string;
  dueDate: string;
  trainer: string;
  sopReference: string;
  sopVersion: string;
  notes: string;
}

const EMPTY_TRAINING_FORM: TrainingForm = {
  userId: "",
  module: "",
  dueDate: "",
  trainer: "",
  sopReference: "",
  sopVersion: "",
  notes: "",
};

const EMPTY_SIM_FORM: SimForm = {
  title: "",
  type: "Mock Inspection",
  duration: 90,
  scheduledAt: "",
  participantIds: [],
};

export function TrainingPrismaTab({ inspection, isAdmin, teamMembers }: TrainingPrismaTabProps) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [simForm, setSimForm] = useState<SimForm>(EMPTY_SIM_FORM);
  const [scheduling, setScheduling] = useState(false);

  // ── Training & Awareness (Module 9) ────────────────────────────────────────
  // Before this the Training Records section was DISPLAY-ONLY: the server
  // actions existed but nothing rendered a control that called them, so no
  // training record could be created or completed from the app at all.
  const [assignOpen, setAssignOpen] = useState(false);
  const [trainForm, setTrainForm] = useState<TrainingForm>(EMPTY_TRAINING_FORM);
  const [assigning, setAssigning] = useState(false);
  /** The record a row-level action is acting on, plus which action. */
  const [trainingAction, setTrainingAction] = useState<
    { record: TrainingRecord; kind: "reassign" | "reopen" | "archive" | "retrain" } | null
  >(null);
  const [trainingReason, setTrainingReason] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [trainingBusy, setTrainingBusy] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<Simulation | null>(null);
  const [completeScore, setCompleteScore] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [completing, setCompleting] = useState(false);
  const [scoreError, setScoreError] = useState("");
  // User-facing error surfaced when a server action fails (replaces silent console.error).
  const { setError, errorPopup } = useErrorPopup();

  const simulations = inspection.simulations;
  const trainings = inspection.trainingRecords;

  const participantOptions = teamMembers.map((m) => ({ value: m.id, label: `${m.name} — ${m.role}` }));

  // ── Training handlers ──────────────────────────────────────────────────────
  async function handleAssignTraining() {
    if (!trainForm.userId || !trainForm.module.trim()) {
      setError("Pick a trainee and name the training module.");
      return;
    }
    setAssigning(true);
    try {
      const res = await assignTraining({
        // Inspection-linked when raised from an inspection's tab. The action
        // also accepts a null inspectionId for standing awareness records — that
        // path is reached from the Readiness overview, not from here.
        inspectionId: inspection.id,
        userId: trainForm.userId,
        module: trainForm.module.trim(),
        dueDate: trainForm.dueDate || undefined,
        trainer: trainForm.trainer.trim() || undefined,
        sopReference: trainForm.sopReference.trim() || undefined,
        sopVersion: trainForm.sopVersion.trim() || undefined,
        notes: trainForm.notes.trim() || undefined,
        // Retraining carries the superseded record forward so the chain is
        // walkable; a plain assignment leaves it unset.
        supersedesId: trainingAction?.kind === "retrain" ? trainingAction.record.id : undefined,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAssignOpen(false);
      setTrainingAction(null);
      setTrainForm(EMPTY_TRAINING_FORM);
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  /** QA completing a record on a trainee's behalf. This does NOT set
   *  acknowledgedAt — only the trainee's own completion does (see
   *  src/actions/training.ts). The button label says so. */
  async function handleCompleteOnBehalf(record: TrainingRecord) {
    setTrainingBusy(true);
    try {
      const res = await completeTraining(record.id, {});
      if (!res.success) setError(res.error);
      else router.refresh();
    } finally {
      setTrainingBusy(false);
    }
  }

  async function handleTrainingAction() {
    if (!trainingAction) return;
    const { record, kind } = trainingAction;
    if (kind === "reassign" && !reassignTo) {
      setError("Pick who the training should move to.");
      return;
    }
    if (trainingReason.trim().length < 5) {
      setError("A reason of at least 5 characters is required.");
      return;
    }
    setTrainingBusy(true);
    try {
      const res =
        kind === "reassign"
          ? await reassignTraining(record.id, { newUserId: reassignTo, reason: trainingReason.trim() })
          : kind === "reopen"
            ? await reopenTraining(record.id, { reason: trainingReason.trim() })
            : await archiveTrainingRecord(record.id, { reason: trainingReason.trim() });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTrainingAction(null);
      setTrainingReason("");
      setReassignTo("");
      router.refresh();
    } finally {
      setTrainingBusy(false);
    }
  }

  const nameById = (id: string) => teamMembers.find((m) => m.id === id)?.name ?? "";

  async function handleSchedule() {
    if (!simForm.title.trim()) return;
    setScheduling(true);
    // Serialize the selected people back to the comma-separated string the
    // `participants` column stores — preserves the existing API/data contract.
    const participants = simForm.participantIds.map(nameById).filter(Boolean).join(", ");
    const result = await createSimulation({
      inspectionId: inspection.id,
      title: simForm.title.trim(),
      type: simForm.type,
      duration: simForm.duration,
      scheduledAt: simForm.scheduledAt || undefined,
      participants: participants || undefined,
    });
    setScheduling(false);
    if (!result.success) {
      console.error("[training] createSimulation failed:", result.error);
      setError(result.error ?? "Could not schedule the simulation. Please try again.");
      return;
    }
    setScheduleOpen(false);
    setSimForm(EMPTY_SIM_FORM);
    router.refresh();
  }

  async function handleComplete() {
    if (!completeTarget) return;
    const score = parseInt(completeScore, 10);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      setScoreError("Enter a score between 0 and 100.");
      return;
    }
    setScoreError("");
    setCompleting(true);
    const result = await completeSimulation(completeTarget.id, score, completeNotes.trim() || undefined);
    setCompleting(false);
    if (!result.success) {
      console.error("[training] completeSimulation failed:", result.error);
      setError(result.error ?? "Could not save the score. Please try again.");
      return;
    }
    setCompleteTarget(null);
    setCompleteScore("");
    setCompleteNotes("");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* ── Mock Simulations ── */}
      <section aria-label="Mock simulations">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Mock Simulations
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Schedule and score practice runs ahead of inspection day
            </p>
          </div>
          {isAdmin && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setScheduleOpen(true)}>
              Schedule simulation
            </Button>
          )}
        </div>

        {simulations.length === 0 ? (
          <div
            className="text-center py-10 rounded-2xl border border-dashed"
            style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
          >
            <Calendar className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              No simulations scheduled for this inspection yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {simulations.map((sim) => {
              const isComplete = sim.status === "Completed";
              return (
                <article
                  key={sim.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border"
                  style={{
                    borderColor: isComplete ? "var(--success)" : "var(--bg-border)",
                    background: isComplete ? "var(--success-bg)" : "var(--bg-surface)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {sim.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>{sim.type}</span>
                      {sim.duration !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" /> {sim.duration} min
                        </span>
                      )}
                      {sim.scheduledAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" aria-hidden="true" /> {dayjs(sim.scheduledAt).format("DD MMM YYYY, HH:mm")}
                        </span>
                      )}
                    </div>
                    {sim.participants && (
                      <p className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                        <Users className="w-3 h-3" aria-hidden="true" /> {sim.participants}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {isComplete ? (
                      <>
                        <StatusBadge taxonomy={SIMULATION_STATUSES} status={sim.status} />
                        {typeof sim.score === "number" && (
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Score: {sim.score}%
                          </p>
                        )}
                      </>
                    ) : isAdmin ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCompleteTarget(sim);
                          setCompleteScore("");
                          setCompleteNotes("");
                          setScoreError("");
                        }}
                      >
                        Score &amp; complete
                      </Button>
                    ) : (
                      <StatusBadge taxonomy={SIMULATION_STATUSES} status={sim.status} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Training Records ── */}
      <section aria-label="Training records">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Training Records
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Inspection-specific competency records
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setTrainForm(EMPTY_TRAINING_FORM);
                setTrainingAction(null);
                setAssignOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Assign training
            </Button>
          )}
        </div>
        {trainings.length === 0 ? (
          <div
            className="text-center py-8 rounded-2xl border border-dashed text-[12px]"
            style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            No training records logged for this inspection yet.
          </div>
        ) : (
          <div className="space-y-2">
            {trainings.map((t) => {
              const done = t.status === "completed";
              const overdue = isTrainingOverdue(t);
              return (
                <article
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-lg border"
                  style={{
                    borderColor: overdue ? "var(--danger)" : "var(--bg-border)",
                    background: done ? "var(--success-bg)" : "var(--bg-surface)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {t.userName}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {/* Curriculum identity + due date. "Trained on module X"
                          alone cannot answer an inspector's "which version of
                          the SOP", which is why sopReference/sopVersion exist. */}
                      {[
                        t.userRole,
                        t.module,
                        t.sopReference ? `${t.sopReference}${t.sopVersion ? ` ${t.sopVersion}` : ""}` : null,
                        t.trainer ? `Trainer: ${t.trainer}` : null,
                        t.dueDate ? `Due ${dayjs(t.dueDate).format("DD MMM YYYY")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {done && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {/* The claim the record actually supports. QA-recorded
                            completion is not the trainee's attestation, and an
                            inspector reads those two differently. */}
                        {t.acknowledgedAt
                          ? `Acknowledged by ${t.userName} on ${dayjs(t.acknowledgedAt).format("DD MMM YYYY")}`
                          : "Recorded by QA — not acknowledged by the trainee"}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {overdue && <StatusBadge taxonomy={TRAINING_RECORD_STATUSES} status="overdue" />}
                      <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)" }}>
                        {trainingDisplayStatus(t)}
                      </span>
                      {done && typeof t.score === "number" && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.score}%</p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!done && (
                          <Button size="sm" variant="secondary" disabled={trainingBusy} onClick={() => handleCompleteOnBehalf(t)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Record completion
                          </Button>
                        )}
                        {!done && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={trainingBusy}
                            onClick={() => { setTrainingAction({ record: t, kind: "reassign" }); setTrainingReason(""); setReassignTo(""); }}
                          >
                            <UserCog className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Reassign
                          </Button>
                        )}
                        {done && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={trainingBusy}
                            onClick={() => { setTrainingAction({ record: t, kind: "reopen" }); setTrainingReason(""); }}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Reopen
                          </Button>
                        )}
                        {done && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={trainingBusy}
                            onClick={() => {
                              setTrainingAction({ record: t, kind: "retrain" });
                              setTrainForm({ ...EMPTY_TRAINING_FORM, userId: t.userId, module: t.module, trainer: t.trainer ?? "", sopReference: t.sopReference ?? "" });
                              setAssignOpen(true);
                            }}
                          >
                            <GraduationCap className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Retrain
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={trainingBusy}
                          onClick={() => { setTrainingAction({ record: t, kind: "archive" }); setTrainingReason(""); }}
                        >
                          <Archive className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                          Archive
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Assign / retrain training modal ── */}
      <Modal
        open={assignOpen}
        onClose={() => {
          setAssignOpen(false);
          setTrainingAction(null);
          setTrainForm(EMPTY_TRAINING_FORM);
        }}
        title={trainingAction?.kind === "retrain" ? "Assign retraining" : "Assign training"}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {trainingAction?.kind === "retrain" && (
            <p className="text-[12px] rounded-lg p-2.5 border" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
              This supersedes {trainingAction.record.userName}&apos;s completed record for{" "}
              <strong>{trainingAction.record.module}</strong>. The original stays on file — retraining
              adds a new record and links back to it rather than overwriting the history.
            </p>
          )}
          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Trainee</label>
            <Dropdown
              value={trainForm.userId}
              onChange={(v) => setTrainForm((p) => ({ ...p, userId: v }))}
              width="w-full"
              size="sm"
              options={participantOptions}
            />
          </div>
          <Input
            id="train-module"
            label="Training module"
            required
            value={trainForm.module}
            onChange={(e) => setTrainForm((p) => ({ ...p, module: e.target.value }))}
            placeholder="Data Integrity — ALCOA+"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="train-sop"
              label="SOP reference"
              value={trainForm.sopReference}
              onChange={(e) => setTrainForm((p) => ({ ...p, sopReference: e.target.value }))}
              placeholder="SOP-QA-014"
            />
            <Input
              id="train-sopver"
              label="SOP version"
              value={trainForm.sopVersion}
              onChange={(e) => setTrainForm((p) => ({ ...p, sopVersion: e.target.value }))}
              placeholder="v3.0"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="train-trainer"
              label="Trainer"
              value={trainForm.trainer}
              onChange={(e) => setTrainForm((p) => ({ ...p, trainer: e.target.value }))}
              placeholder="Name of the person delivering the training"
            />
            <div>
              <label htmlFor="train-due" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
                Due date
              </label>
              <input
                id="train-due"
                type="date"
                className="input w-full"
                value={trainForm.dueDate}
                onChange={(e) => setTrainForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <Textarea
            id="train-notes"
            label="Notes"
            rows={3}
            value={trainForm.notes}
            onChange={(e) => setTrainForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setAssignOpen(false); setTrainingAction(null); }}>Cancel</Button>
            <Button loading={assigning} onClick={handleAssignTraining}>
              {trainingAction?.kind === "retrain" ? "Assign retraining" : "Assign"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Reassign / reopen / archive modal — all three take a mandatory
             reason, so they share one surface. ── */}
      <Modal
        open={trainingAction !== null && trainingAction.kind !== "retrain"}
        onClose={() => { setTrainingAction(null); setTrainingReason(""); setReassignTo(""); }}
        title={
          trainingAction?.kind === "reassign"
            ? "Reassign training"
            : trainingAction?.kind === "reopen"
              ? "Reopen training record"
              : "Archive training record"
        }
      >
        <div className="space-y-4">
          {trainingAction?.kind === "reassign" && (
            <>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Currently assigned to <strong>{trainingAction.record.userName}</strong>. Any progress
                resets — it belonged to the previous trainee.
              </p>
              <div>
                <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Move to</label>
                <Dropdown
                  value={reassignTo}
                  onChange={setReassignTo}
                  width="w-full"
                  size="sm"
                  options={participantOptions.filter((o) => o.value !== trainingAction.record.userId)}
                />
              </div>
            </>
          )}
          {trainingAction?.kind === "reopen" && (
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              This clears the completion and the trainee&apos;s acknowledgement. Both stay in the audit
              trail — reopening records a new event, it does not erase the earlier one.
            </p>
          )}
          {trainingAction?.kind === "archive" && (
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              The record is retired, not deleted. It stops appearing in the training position and on the
              trainee&apos;s worklist, and stays retrievable as evidence.
            </p>
          )}
          <Textarea
            id="train-reason"
            label="Reason"
            required
            rows={3}
            value={trainingReason}
            onChange={(e) => setTrainingReason(e.target.value)}
            placeholder="Recorded on the audit trail against this change."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setTrainingAction(null); setTrainingReason(""); }}>Cancel</Button>
            <Button loading={trainingBusy} onClick={handleTrainingAction}>Confirm</Button>
          </div>
        </div>
      </Modal>

      {/* ── Schedule simulation modal ── */}
      <Modal
        open={scheduleOpen}
        onClose={() => {
          setScheduleOpen(false);
          setSimForm(EMPTY_SIM_FORM);
        }}
        title="Schedule simulation"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            id="sim-title"
            label="Title"
            required
            value={simForm.title}
            onChange={(e) => setSimForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Mock FDA Inspection"
          />

          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Type</label>
            <Dropdown
              value={simForm.type}
              onChange={(v) => setSimForm((p) => ({ ...p, type: v }))}
              width="w-full"
              size="sm"
              options={SIM_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="sim-dur"
              label="Duration (min)"
              type="number"
              min={15}
              step={15}
              value={simForm.duration}
              onChange={(e) => setSimForm((p) => ({ ...p, duration: parseInt(e.target.value, 10) || 90 }))}
            />
            <div>
              <label htmlFor="sim-date" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
                Scheduled date &amp; time
              </label>
              <input
                id="sim-date"
                type="datetime-local"
                className="input w-full"
                value={simForm.scheduledAt}
                onChange={(e) => setSimForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Participants</label>
            {teamMembers.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                No eligible team members found for this tenant.
              </p>
            ) : (
              <>
                <Dropdown
                  multi
                  searchable
                  values={simForm.participantIds}
                  onChangeMulti={(vals) => setSimForm((p) => ({ ...p, participantIds: vals }))}
                  options={participantOptions}
                  placeholder="Select participants..."
                  searchPlaceholder="Search people..."
                  width="w-full"
                  size="sm"
                />
                {simForm.participantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {simForm.participantIds.map((id) => {
                      const name = nameById(id);
                      if (!name) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => setSimForm((p) => ({ ...p, participantIds: p.participantIds.filter((x) => x !== id) }))}
                            aria-label={`Remove ${name}`}
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer border-none bg-transparent"
                            style={{ color: "var(--brand)" }}
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Plus}
              loading={scheduling}
              disabled={!simForm.title.trim() || scheduling}
              onClick={handleSchedule}
            >
              Schedule
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Score & complete modal ── */}
      <Modal
        open={completeTarget !== null}
        onClose={() => {
          setCompleteTarget(null);
          setCompleteScore("");
          setCompleteNotes("");
          setScoreError("");
        }}
        title="Score simulation"
      >
        {completeTarget && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{completeTarget.title}</strong> · {completeTarget.type}
            </p>
            <Input
              id="sim-score"
              label="Score (0–100)"
              required
              type="number"
              min={0}
              max={100}
              value={completeScore}
              onChange={(e) => { setCompleteScore(e.target.value); if (scoreError) setScoreError(""); }}
              error={scoreError || undefined}
              placeholder="e.g. 85"
            />
            <Textarea
              id="sim-notes"
              label="Notes / feedback"
              rows={3}
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              placeholder="What went well, what to improve..."
            />
            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
              <Button variant="secondary" onClick={() => setCompleteTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={completing}
                disabled={!completeScore || completing}
                onClick={handleComplete}
              >
                Save &amp; complete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Error feedback — canonical action-failure surface */}
      {errorPopup}
    </div>
  );
}
