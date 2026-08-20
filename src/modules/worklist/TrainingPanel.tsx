"use client";

/**
 * "My training" — the trainee's own Training & Awareness records.
 *
 * This is the ONLY surface where a non-QA role can act on their own training.
 * The Inspection Readiness module (where training is administered) is visible to
 * qa_head + customer_admin only, so before this panel existed a trainee had no
 * way to start, complete or acknowledge anything assigned to them — QA marked it
 * done on their behalf, which is a completion record but not an attestation by
 * the person trained.
 *
 * Deliberately NOT routed through WorkItem/WorkItemModal: training has no
 * evidence uploads, no QA↔worker thread and no rework loop, so the unified work
 * surface would be mostly inapplicable controls. Same reasoning as
 * StageTaskTable, which is also its own section.
 */

import { useState, useTransition } from "react";
import { GraduationCap, PlayCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useErrorPopup } from "@/components/ui/ErrorPopup";
import { startTraining, completeTraining } from "@/actions/training";
import { trainingDisplayStatus } from "@/lib/training";
import type { WorklistTraining } from "@/lib/queries/worklist";

export function TrainingPanel({
  records,
  timezone,
  dateFormat,
  onChanged,
}: {
  records: WorklistTraining[];
  timezone: string;
  dateFormat: string;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // Tracks WHICH row is mid-flight so only that row's buttons disable — a single
  // boolean would freeze every row on any click.
  const [busyId, setBusyId] = useState<string | null>(null);
  const { setError, errorPopup } = useErrorPopup();

  const fmt = (iso: string | null) => (iso ? dayjs.utc(iso).tz(timezone).format(dateFormat) : "—");

  function run(id: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.success) setError(res.error ?? "That didn't work.");
        else onChanged();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <ul className="list-none m-0 p-0 divide-y" style={{ borderColor: "var(--bg-border)" }}>
          {records.map((t) => {
            const done = t.status === "completed";
            const busy = pending && busyId === t.id;
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    {t.module}
                    {t.isRetraining && <Badge variant="purple">Retraining</Badge>}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {/* Curriculum identity — the thing an auditor actually asks
                        for. Rendered only when present so an older record
                        without it does not show empty separators. */}
                    {[
                      t.sopReference ? `${t.sopReference}${t.sopVersion ? ` ${t.sopVersion}` : ""}` : null,
                      t.trainer ? `Trainer: ${t.trainer}` : null,
                      t.assignedByName ? `Assigned by ${t.assignedByName}` : null,
                      t.dueDate ? `Due ${fmt(t.dueDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No due date set"}
                  </p>
                  {done && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Completed {fmt(t.completedAt)}
                      {/* The distinction that matters: an acknowledged record is
                          the trainee's own attestation; one without it was
                          recorded on their behalf. */}
                      {t.acknowledgedAt
                        ? ` · acknowledged by you ${fmt(t.acknowledgedAt)}`
                        : " · recorded by QA on your behalf"}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {t.isOverdue && (
                    <Badge variant="red">
                      <AlertTriangle className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                      Overdue
                    </Badge>
                  )}
                  <Badge variant={done ? "green" : t.status === "in_progress" ? "amber" : "gray"}>
                    {trainingDisplayStatus(t)}
                  </Badge>
                  {t.status === "pending" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(t.id, () => startTraining(t.id))}>
                      <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                      Start
                    </Button>
                  )}
                  {t.status === "in_progress" && (
                    <Button size="sm" disabled={busy} onClick={() => run(t.id, () => completeTraining(t.id))}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                      Complete &amp; acknowledge
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {errorPopup}
    </>
  );
}

export { GraduationCap as TrainingPanelIcon };
