"use server";

/**
 * Training & Awareness — the record lifecycle.
 *
 * Split out of src/actions/inspections.ts, where training lived as two actions
 * (create + complete) that no UI ever called. The Module 9 documentation review
 * asked for a manual chapter describing assignment, reassignment, start,
 * completion, acknowledgement, overdue, retraining, reopen and archival — none
 * of which the app could produce.
 *
 * Two deliberate departures from the old inspections.ts pair:
 *
 * 1. AUDIT MODULE TAG. Rows are written with module "Training & Awareness", not
 *    "Inspection Readiness". Filtering the Audit Trail for training previously
 *    returned nothing, because the events were filed under the parent module.
 *    (See TRAINING_AUDIT_MODULE below — one constant, so the tag cannot drift.)
 *
 * 2. WHO MAY COMPLETE. QA Head owns assignment, review and archival. But the
 *    TRAINEE may start and complete their OWN record, and only a trainee's own
 *    completion sets acknowledgedAt. A training record that only QA can mark
 *    complete is QA's assertion about a third party; 21 CFR 211.25 and EU GMP
 *    Chapter 2 expect the trained person to be identifiable in their own record.
 *    QA completing on someone's behalf is still allowed (a paper record being
 *    transcribed, say) — it just does not claim to be an acknowledgement.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { canWriteReadiness } from "@/lib/permissions/roleSets";
import { isSelfAcknowledgement, isTrainingOverdue } from "@/lib/training";
import { computeAuditDiff, auditDiffPayload, normalizeDate, type AuditDiffField } from "@/lib/auditDiff";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** ONE audit module tag for every event in this file — see note 1 above. */
const TRAINING_AUDIT_MODULE = "Training & Awareness";

/** Fields diffed into the TRAINING_UPDATED audit row (§11.10(e)). Lifecycle
 *  columns (status/startedAt/completedAt/acknowledgedAt) are absent: each has
 *  its own dedicated event, and duplicating them here would double-report. */
const TRAINING_DIFF_FIELDS: readonly AuditDiffField[] = [
  { key: "module", label: "Training module" },
  { key: "dueDate", label: "Due date", normalize: normalizeDate },
  { key: "trainer", label: "Trainer" },
  { key: "sopReference", label: "SOP reference" },
  { key: "sopVersion", label: "SOP version" },
  { key: "notes", label: "Notes" },
  { key: "score", label: "Score" },
];

/**
 * Shared authorisation preamble. Returns the resolved actor or an error result.
 *
 * `selfServiceForUserId` opts a call into the trainee path: if the caller IS
 * that user, the QA-only write gate is waived. Everything else (GxP-author
 * bright line, tenant scoping) still applies.
 */
async function authorizeTraining(
  selfServiceForUserId?: string | null,
): Promise<
  | { ok: true; actor: Awaited<ReturnType<typeof resolveUserFk>>; tenantId: string; isSelf: boolean }
  | { ok: false; error: string }
> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const isSelf = isSelfAcknowledgement(actor.userId, selfServiceForUserId ?? "");
  if (!isSelf && !canWriteReadiness(session.user.role)) {
    return { ok: false, error: "Your role does not permit this action." };
  }
  return { ok: true, actor, tenantId: session.user.tenantId, isSelf };
}

/** Tenant-scoped read of a live (non-archived) training record. */
async function loadRecord(id: string, tenantId: string) {
  return prisma.trainingRecord.findFirst({ where: { id, tenantId, deletedAt: null } });
}

/* ══════════════════════════════════════════════════════════════════════════
 * ASSIGN
 * ══════════════════════════════════════════════════════════════════════════ */

const AssignTrainingSchema = z.object({
  // Optional — an AWARENESS record (a standing SOP read-and-understand, a
  // data-integrity refresher) is not tied to an inspection. The old
  // CreateTrainingSchema required inspectionId, which is why "awareness record
  // created" was an event the app could not produce.
  inspectionId: z.string().optional().nullable(),
  userId: z.string().min(1, "A trainee is required"),
  module: z.string().min(1, "A training module is required"),
  dueDate: z.string().optional(),
  trainer: z.string().max(200).optional(),
  sopReference: z.string().max(200).optional(),
  sopVersion: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  /** Set when this assignment replaces an earlier record (retraining). */
  supersedesId: z.string().optional(),
});

export async function assignTraining(
  input: z.input<typeof AssignTrainingSchema>,
): Promise<ActionResult> {
  const parsed = AssignTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const auth = await authorizeTraining();
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    // The trainee is resolved server-side: userName/userRole are DENORMALISED
    // onto the record (they must survive the user being renamed or deactivated),
    // so they must come from the database, never from the client payload. The
    // old CreateTrainingSchema accepted userName + userRole as free strings from
    // the browser — a training record could claim any name and any role.
    const trainee = await prisma.user.findFirst({
      where: { id: parsed.data.userId, tenantId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!trainee) return { success: false, error: "That user is not in this organisation." };
    if (!trainee.isActive) return { success: false, error: "That user is not active." };

    // An inspection-linked record must belong to the SAME tenant (IDOR guard).
    if (parsed.data.inspectionId) {
      const parent = await prisma.inspection.findFirst({
        where: { id: parsed.data.inspectionId, tenantId },
        select: { id: true },
      });
      if (!parent) return { success: false, error: "FORBIDDEN" };
    }
    // A retraining parent must also be in-tenant and must actually be the same
    // trainee — retraining chains a person's own history, not someone else's.
    if (parsed.data.supersedesId) {
      const prior = await prisma.trainingRecord.findFirst({
        where: { id: parsed.data.supersedesId, tenantId },
        select: { id: true, userId: true },
      });
      if (!prior) return { success: false, error: "The record being superseded was not found." };
      if (prior.userId !== trainee.id) {
        return { success: false, error: "Retraining must be assigned to the same person as the original record." };
      }
    }

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.trainingRecord.create({
        data: {
          tenantId,
          inspectionId: parsed.data.inspectionId || null,
          userId: trainee.id,
          userName: trainee.name,
          userRole: trainee.role,
          module: parsed.data.module,
          status: "pending",
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          assignedById: actor.userId,
          assignedByName: actor.displayName,
          trainer: parsed.data.trainer || null,
          sopReference: parsed.data.sopReference || null,
          sopVersion: parsed.data.sopVersion || null,
          notes: parsed.data.notes || null,
          supersedesId: parsed.data.supersedesId || null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          // Retraining is a DISTINCT event from a first assignment: an auditor
          // asking "was this person retrained after the deviation" must be able
          // to filter for it rather than infer it from a supersedes column.
          action: parsed.data.supersedesId ? "TRAINING_RETRAINING_ASSIGNED" : "TRAINING_ASSIGNED",
          recordId: created.id,
          recordTitle: `${trainee.name} — ${parsed.data.module}`.slice(0, 80),
          newValue: JSON.stringify({
            traineeId: trainee.id,
            traineeName: trainee.name,
            traineeRole: trainee.role,
            trainingModule: parsed.data.module,
            dueDate: parsed.data.dueDate ?? null,
            trainer: parsed.data.trainer ?? null,
            sopReference: parsed.data.sopReference ?? null,
            sopVersion: parsed.data.sopVersion ?? null,
            inspectionId: parsed.data.inspectionId ?? null,
            supersedesId: parsed.data.supersedesId ?? null,
          }),
        },
      });
      return created;
    });

    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] assignTraining failed:", err);
    return { success: false, error: "Failed to assign training" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * REASSIGN
 * ══════════════════════════════════════════════════════════════════════════ */

const ReassignTrainingSchema = z.object({
  newUserId: z.string().min(1, "A new trainee is required"),
  reason: z.string().min(5, "A reason for the reassignment (at least 5 characters) is required").max(500),
});

export async function reassignTraining(
  id: string,
  input: z.input<typeof ReassignTrainingSchema>,
): Promise<ActionResult> {
  const parsed = ReassignTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // QA only — a trainee must not be able to hand their own training to someone
  // else. No self-service waiver here.
  const auth = await authorizeTraining();
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    // A completed record is the evidence that a SPECIFIC person was trained.
    // Reassigning it would transfer someone else's completed training onto a
    // person who never did it — assign a fresh record instead.
    if (before.status === "completed") {
      return { success: false, error: "A completed training record cannot be reassigned — assign a new one instead." };
    }
    if (before.userId === parsed.data.newUserId) {
      return { success: false, error: "That user is already the trainee on this record." };
    }
    const next = await prisma.user.findFirst({
      where: { id: parsed.data.newUserId, tenantId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!next) return { success: false, error: "That user is not in this organisation." };
    if (!next.isActive) return { success: false, error: "That user is not active." };

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: {
          userId: next.id,
          userName: next.name,
          userRole: next.role,
          // Any progress belonged to the PREVIOUS trainee — it does not transfer.
          status: "pending",
          startedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_REASSIGNED",
          recordId: id,
          recordTitle: `${next.name} — ${before.module}`.slice(0, 80),
          oldValue: before.userName,
          newValue: JSON.stringify({
            reason: parsed.data.reason.trim(),
            previousTraineeId: before.userId,
            previousTraineeName: before.userName,
            newTraineeId: next.id,
            newTraineeName: next.name,
            newTraineeRole: next.role,
            progressResetFrom: before.status,
          }),
        },
      });
      return updated;
    });

    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] reassignTraining failed:", err);
    return { success: false, error: "Failed to reassign training" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * UPDATE
 * ══════════════════════════════════════════════════════════════════════════ */

const UpdateTrainingSchema = z.object({
  module: z.string().min(1).optional(),
  dueDate: z.string().optional(),
  trainer: z.string().max(200).optional(),
  sopReference: z.string().max(200).optional(),
  sopVersion: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
});

export async function updateTrainingRecord(
  id: string,
  input: z.input<typeof UpdateTrainingSchema>,
): Promise<ActionResult> {
  const parsed = UpdateTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const auth = await authorizeTraining();
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    // Editing the curriculum identity of a COMPLETED record would retroactively
    // change what someone is recorded as having been trained on. Retrain instead.
    if (before.status === "completed") {
      return { success: false, error: "A completed training record is read-only — raise retraining to record new training." };
    }

    const { reason, dueDate, ...rest } = parsed.data;
    const changes = computeAuditDiff(
      before as unknown as Record<string, unknown>,
      parsed.data as Record<string, unknown>,
      TRAINING_DIFF_FIELDS,
    );

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        },
      });
      const diff = auditDiffPayload(changes, { reason: reason?.trim() ?? "" });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_UPDATED",
          recordId: id,
          recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
          ...(diff ?? {}),
        },
      });
      return updated;
    });

    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] updateTrainingRecord failed:", err);
    return { success: false, error: "Failed to update training record" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * START  →  COMPLETE / ACKNOWLEDGE
 * ══════════════════════════════════════════════════════════════════════════ */

export async function startTraining(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const pre = await prisma.trainingRecord.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { userId: true },
  });
  if (!pre) return { success: false, error: "Training record not found" };
  // Self-service: the trainee starts their own training.
  const auth = await authorizeTraining(pre.userId);
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    if (before.status !== "pending") {
      return { success: false, error: "Only an assigned (not yet started) training record can be started." };
    }
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: { status: "in_progress", startedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_STARTED",
          recordId: id,
          recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
          oldValue: before.status,
          newValue: JSON.stringify({
            previousStatus: before.status,
            newStatus: "in_progress",
            // Recorded at the moment it happens: whether this record was already
            // past due when work started is a fact the trail should not require
            // a later date comparison to recover.
            wasOverdueAtStart: isTrainingOverdue(before),
          }),
        },
      });
      return updated;
    });
    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] startTraining failed:", err);
    return { success: false, error: "Failed to start training" };
  }
}

const CompleteTrainingSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Complete a training record.
 *
 * Writes TRAINING_COMPLETED always, and additionally sets acknowledgedAt +
 * writes TRAINING_ACKNOWLEDGED when the caller IS the trainee. See the header
 * note: QA completing on a trainee's behalf is a completion, not an attestation,
 * and the trail must not blur the two.
 */
export async function completeTraining(
  id: string,
  input: z.input<typeof CompleteTrainingSchema> = {},
): Promise<ActionResult> {
  const parsed = CompleteTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const session = await requireAuth();
  const pre = await prisma.trainingRecord.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { userId: true },
  });
  if (!pre) return { success: false, error: "Training record not found" };
  const auth = await authorizeTraining(pre.userId);
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId, isSelf } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    if (before.status === "completed") {
      return { success: false, error: "This training record is already complete." };
    }
    const now = new Date();
    const lateBy = before.dueDate && now > before.dueDate
      ? Math.ceil((now.getTime() - before.dueDate.getTime()) / 86_400_000)
      : null;

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: {
          status: "completed",
          completedAt: now,
          // Only a self-completion is an acknowledgement.
          ...(isSelf ? { acknowledgedAt: now } : {}),
          ...(parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_COMPLETED",
          recordId: id,
          recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
          oldValue: before.status,
          newValue: JSON.stringify({
            previousStatus: before.status,
            score: parsed.data.score ?? before.score ?? null,
            // Completed late is a real finding at inspection. Recording the
            // lateness at the event means it survives a later due-date edit.
            dueDate: before.dueDate?.toISOString() ?? null,
            completedLateByDays: lateBy,
            // Explicit, so a reader never has to infer it from who wrote the row.
            selfCompleted: isSelf,
            completedOnBehalfOf: isSelf ? null : before.userName,
          }),
        },
      });
      if (isSelf) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: TRAINING_AUDIT_MODULE,
            action: "TRAINING_ACKNOWLEDGED",
            recordId: id,
            recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
            newValue: JSON.stringify({
              acknowledgedAt: now.toISOString(),
              trainingModule: before.module,
              sopReference: before.sopReference,
              sopVersion: before.sopVersion,
            }),
          },
        });
      }
      if (lateBy !== null) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: TRAINING_AUDIT_MODULE,
            action: "TRAINING_OVERDUE_RECORDED",
            recordId: id,
            recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
            newValue: JSON.stringify({
              dueDate: before.dueDate?.toISOString() ?? null,
              completedAt: now.toISOString(),
              overdueByDays: lateBy,
            }),
          },
        });
      }
      return updated;
    });

    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] completeTraining failed:", err);
    return { success: false, error: "Failed to complete training" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * REOPEN  /  ARCHIVE
 * ══════════════════════════════════════════════════════════════════════════ */

const ReopenTrainingSchema = z.object({
  reason: z.string().min(5, "A reason for reopening (at least 5 characters) is required").max(500),
});

export async function reopenTraining(
  id: string,
  input: z.input<typeof ReopenTrainingSchema>,
): Promise<ActionResult> {
  const parsed = ReopenTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const auth = await authorizeTraining();
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    if (before.status !== "completed") {
      return { success: false, error: "Only a completed training record can be reopened." };
    }
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: {
          status: "in_progress",
          completedAt: null,
          // The acknowledgement is CLEARED: it attested to a completion that is
          // no longer standing. Its occurrence survives in the audit trail — the
          // TRAINING_ACKNOWLEDGED row is not deleted — so nothing is erased.
          acknowledgedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_REOPENED",
          recordId: id,
          recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
          oldValue: "completed",
          newValue: JSON.stringify({
            reason: parsed.data.reason.trim(),
            previouslyCompletedAt: before.completedAt?.toISOString() ?? null,
            previouslyAcknowledgedAt: before.acknowledgedAt?.toISOString() ?? null,
            acknowledgementCleared: before.acknowledgedAt !== null,
          }),
        },
      });
      return updated;
    });
    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] reopenTraining failed:", err);
    return { success: false, error: "Failed to reopen training" };
  }
}

const ArchiveTrainingSchema = z.object({
  reason: z.string().min(5, "A reason for archiving (at least 5 characters) is required").max(500),
});

/**
 * Archive (soft-delete) a training record.
 *
 * Soft, never hard: a training record is inspection evidence. The row stays,
 * flagged, and the audit trail records who retired it and why — which is what
 * "record archived or deleted, where permitted" means in a GxP context.
 */
export async function archiveTrainingRecord(
  id: string,
  input: z.input<typeof ArchiveTrainingSchema>,
): Promise<ActionResult> {
  const parsed = ArchiveTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const auth = await authorizeTraining();
  if (!auth.ok) return { success: false, error: auth.error };
  const { actor, tenantId } = auth;

  try {
    const before = await loadRecord(id, tenantId);
    if (!before) return { success: false, error: "Training record not found" };
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRecord.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: actor.userId,
          deletionReason: parsed.data.reason.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: TRAINING_AUDIT_MODULE,
          action: "TRAINING_ARCHIVED",
          recordId: id,
          recordTitle: `${before.userName} — ${before.module}`.slice(0, 80),
          oldValue: before.status,
          newValue: JSON.stringify({
            reason: parsed.data.reason.trim(),
            statusAtArchive: before.status,
            wasCompleted: before.status === "completed",
          }),
        },
      });
      return updated;
    });
    revalidatePath("/readiness");
    revalidatePath("/worklist");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] archiveTrainingRecord failed:", err);
    return { success: false, error: "Failed to archive training record" };
  }
}
