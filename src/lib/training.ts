/**
 * Training & Awareness vocabulary + derived state.
 *
 * Single source of truth for WHAT a training record's status can be and for the
 * one state that is NOT stored: "overdue".
 *
 * Why overdue is derived, not stored: a stored "overdue" goes stale the moment
 * QA extends a due date, and it needs a scheduled job to ever be set in the
 * first place. Deriving it from dueDate vs now means the record is never wrong
 * and there is no cron to fail silently. The audit trail still gets a discrete
 * TRAINING_OVERDUE_RECORDED event when QA acts on an overdue record, so the
 * lapse is on the record even though the state is computed.
 *
 * Pure — no Prisma, no React — so it is importable from a "use server" action,
 * a cached query, and a client component alike. Matches the plain-TS convention
 * of src/lib/reference.ts (no deps).
 */

/** Stored status values. "overdue" is deliberately absent — see the note above. */
export const TRAINING_STATUS_VALUES = ["pending", "in_progress", "completed"] as const;
export type TrainingStatus = (typeof TRAINING_STATUS_VALUES)[number];

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  pending: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

/** Human label for a stored status; unknown values pass through readably. */
export function trainingStatusLabel(status: string): string {
  return TRAINING_STATUS_LABELS[status] ?? status;
}

export function isTrainingStatus(value: string): value is TrainingStatus {
  return (TRAINING_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Derived overdue state: past its due date and not yet completed.
 *
 * A completed record is NEVER overdue, even if it was completed late — lateness
 * is visible from completedAt vs dueDate, and flagging a finished record as
 * outstanding would misstate the training position to an inspector.
 */
export function isTrainingOverdue(
  record: { dueDate: Date | string | null | undefined; status: string },
  now: Date = new Date(),
): boolean {
  if (record.status === "completed") return false;
  if (!record.dueDate) return false;
  const due = record.dueDate instanceof Date ? record.dueDate : new Date(record.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

/**
 * Display status, including the derived "Overdue" that no column holds.
 * Presentation only — never write this back to TrainingRecord.status.
 */
export function trainingDisplayStatus(
  record: { dueDate: Date | string | null | undefined; status: string },
  now: Date = new Date(),
): string {
  return isTrainingOverdue(record, now) ? "Overdue" : trainingStatusLabel(record.status);
}

/**
 * Whether a completion counts as the trainee's OWN acknowledgement.
 *
 * QA marking a record complete on someone's behalf is a completion record; it is
 * NOT an attestation by the person trained. Only the trainee acknowledging their
 * own record sets acknowledgedAt. Keeping the two distinct is the difference
 * between "we say they were trained" and "they confirmed they were trained" —
 * an inspector reads those differently, so the data model must too.
 */
export function isSelfAcknowledgement(actorUserId: string | null | undefined, traineeUserId: string): boolean {
  return !!actorUserId && actorUserId === traineeUserId;
}
