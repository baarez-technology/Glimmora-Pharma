"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import {
  lockCAPAArtifacts,
  unlockCAPAArtifacts,
  LOCKED_CAPA_STATUSES,
} from "@/lib/evidence-lock";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import type { ActionResult } from "./_types";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ CAPA lifecycle actions â”€â”€
 *
 * Create / update / clearDIGate / submitForReview / rejectCAPA /
 * deleteCAPA. Closure (signAndCloseCAPA) lives in closure.ts because
 * it carries the CC-dependency gate; alignment + approvals are split
 * out into their own files. Each file has its own "use server" so they
 * can be tree-shaken independently.
 */

// â”€â”€ Schemas â”€â”€

const CreateCAPASchema = z.object({
  description: z.string().min(10, "Description must be at least 10 characters"),
  source: z.enum([
    "Gap Assessment",
    "Deviation",
    "FDA 483",
    "Internal Audit",
    "External Audit",
    "Customer Complaint",
    "CSV/CSA",
    "Other",
  ]),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  siteId: z.string().optional(),
  linkedFindingId: z.string().optional(),
  linkedDeviationId: z.string().optional(),
  // RUNG 2 — optional GxP system this CAPA is raised against (CSV/CSA).
  // Flows through `...rest` into the create; persisted as CAPA.systemId.
  systemId: z.string().optional(),
  diGateRequired: z.boolean().optional(),
  // FDA 483 raise carries the RCA captured at the observation. Additive —
  // these columns already exist on CAPA (the old FDA 483 direct create wrote
  // them, and updateCAPA edits them); they flow into the create via `...rest`.
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
});

const UpdateCAPASchema = z.object({
  description: z.string().min(10).optional(),
  source: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  // RUNG 3D-CAPA — status intentionally removed (was the Part 11 lifecycle
  // bypass, Finding #1). Transitions go through dedicated guarded actions.
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
  // SME Section 1, Stage 4 (FULL) â€” correctiveActions is now managed
  // via the structured CAPAActionItem rows (addActionItem /
  // updateActionItem / deleteActionItem / reorderActionItems). The
  // field stays on the CAPA model as a denormalised cache rebuilt by
  // syncCorrectiveActions, but direct writes are blocked here so the
  // structured surface is the only path. updateCAPA refuses payloads
  // that include it; see the guard below.
  correctiveActions: z.string().optional(),
});

const ClearDIGateSchema = z.object({
  notes: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

// RUNG 3D-CAPA — reopening a closed/rejected CAPA is a senior corrective act;
// a substantive reason (≥10 chars) is required and audited.
const ReopenCAPASchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required to reopen").max(2000),
});

// â”€â”€ Actions â”€â”€

// Roles permitted to create a CAPA (server-side authz; mirrors the Rung 3A
// SYSTEM_WRITE_ROLES pattern). Every module's "raise CAPA" path funnels
// through createCAPA, so this single gate covers Gap / Deviation / CSV/CSA /
// FDA 483 / manual / AI at once. regulatory_affairs is included because FDA
// 483 + CAPA work is their domain. Raw session role (not resolveUserFk).
const CAPA_WRITE_ROLES: readonly string[] = ["csv_val_lead", "qa_head", "regulatory_affairs", "customer_admin", "super_admin"];

export async function createCAPA(
  input: z.input<typeof CreateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!CAPA_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "You do not have permission to create CAPAs." };
  }
  const parsed = CreateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    const {
      linkedFindingId,
      linkedDeviationId,
      diGateRequired,
      dueDate,
      ...rest
    } = parsed.data;

    // Race-safe sequence allocation. Two server actions creating CAPAs at
    // the same instant can both read count=N inside their respective
    // transactions, both compute reference=N+1, and the second commit
    // hits CAPA_reference_key uniqueness. Retry on that specific
    // collision; bubble any other error.
    const MAX_RETRIES = 5;
    let capa: Awaited<ReturnType<typeof prisma.cAPA.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        capa = await prisma.$transaction(async (tx) => {
          // SME Section 1 (last rung) â€” site-scoped reference prefix.
          // Format is now "CAPA-{siteCode}-{year}-{NNN}". Site code is
          // resolved per call; the startsWith filter the helper feeds
          // back into findLatestForYear scopes naturally to that site's
          // bucket. Falls back to legacy "CAPA-{year}-{NNN}" when the
          // CAPA has no site (siteId optional on the schema) or when
          // the site has no code yet (backfill window).
          let siteCode: string | null = null;
          if (parsed.data.siteId) {
            const site = await tx.site.findUnique({
              where: { id: parsed.data.siteId },
              select: { code: true },
            });
            siteCode = site?.code ?? null;
          }
          const referencePrefix = buildReferencePrefix("CAPA", siteCode);
          // Reference lookup is intentionally GLOBAL (no tenantId filter).
          // CAPA.reference has a global @unique index, not @@unique on
          // [tenantId, reference] â€” so two tenants each computing their
          // per-tenant max would both produce "CAPA-CHN-2026-001" and the
          // second insert would hit P2002 every retry. Reading the
          // global max for the prefix-year guarantees strictly greater.
          // Tenants may see gaps when two tenants share a site code AND
          // collide on sequence â€” documented trade-off of the global
          // unique design.
          const reference = await generateReference(
            referencePrefix,
            new Date(),
            async (prefix, year) => {
              const row = await tx.cAPA.findFirst({
                where: {
                  reference: { startsWith: `${prefix}-${year}-` },
                },
                orderBy: { reference: "desc" },
                select: { reference: true },
              });
              return row?.reference ?? null;
            },
          );
          const created = await tx.cAPA.create({
            data: {
              ...rest,
              // owner is now zod-optional; the Prisma column is still
              // non-null, so default an empty string when not supplied.
              owner: rest.owner ?? "",
              reference,
              tenantId: session.user.tenantId,
              status: "open",
              createdBy: session.user.name,
              dueDate: new Date(dueDate),
              findingId: linkedFindingId ?? null,
              // SME Section 1, Stage 2 (FULL) â€” write the new bidirectional
              // FK on the CAPA row at creation time. Keeps both sides
              // (CAPA.deviationId + Deviation.linkedCAPAId) atomic via the
              // surrounding $transaction below.
              deviationId: linkedDeviationId ?? null,
              diGate: diGateRequired ?? false,
              diGateStatus: diGateRequired ? "pending" : null,
            },
          });
          // Link-side updates moved INSIDE the transaction (SME Stage 2
          // FULL): the previous post-create updates ran outside the
          // transaction, so a Deviation.update failure left the CAPA
          // created without its back-link. Now both sides commit or
          // neither does. The Finding update also goes here for symmetry.
          if (linkedFindingId) {
            await tx.finding.update({
              where: { id: linkedFindingId, tenantId: session.user.tenantId },
              data: { status: "in_progress", linkedCAPAId: created.id },
            });
          }
          if (linkedDeviationId) {
            await tx.deviation.update({
              where: { id: linkedDeviationId, tenantId: session.user.tenantId },
              data: { linkedCAPAId: created.id },
            });
          }
          return created;
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!capa) {
      console.error("[action] createCAPA exhausted reference retries:", lastErr);
      return { success: false, error: sanitizeServerError(lastErr, "Failed to allocate CAPA reference") };
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_CREATED",
        recordId: capa.id,
        recordTitle: capa.reference
          ? `${capa.reference} â€” ${parsed.data.description.slice(0, 60)}`
          : parsed.data.description.slice(0, 80),
        newValue: parsed.data.risk,
      },
    });

    revalidatePath("/capa");
    revalidatePath("/gap-assessment");
    revalidatePath("/deviation");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] createCAPA failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create CAPA") };
  }
}

// NOTE: status field intentionally NOT accepted (Rung 3D-CAPA). Status
// changes route through dedicated guarded transitions:
//   open → in_progress:        startCAPAProgress
//   in_progress → pending_qa_review: submitForReview
//   pending_qa_review → pending_verification: approveCAPA
//   pending_verification → closed: signAndCloseCAPA
//   any → rejected:            rejectCAPA
//   closed/rejected → open:    reopenCAPA (carries the evidence unlock)
// See AUDIT-GLOBAL-PATTERNS.md Finding #1.
export async function updateCAPA(
  id: string,
  input: z.input<typeof UpdateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  // SME Section 1, Stage 4 (FULL) â€” block direct writes to correctiveActions.
  // The field stays on the CAPA row as a denormalised cache rebuilt by
  // syncCorrectiveActions inside the action-items mutation paths, but the
  // only path to mutate it is now addActionItem / updateActionItem / etc.
  // Audit the blocked attempt so legacy clients can be traced.
  if (parsed.data.correctiveActions !== undefined) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA",
          action: "CAPA_UPDATE_BLOCKED_CORRECTIVE_ACTIONS_DEPRECATED",
          recordId: id,
          newValue: JSON.stringify({
            attemptedBy: session.user.id,
            payloadLength: parsed.data.correctiveActions.length,
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_UPDATE_BLOCKED_CORRECTIVE_ACTIONS_DEPRECATED audit:", err);
    }
    return {
      success: false,
      error:
        "Direct writes to correctiveActions are deprecated. Use the structured Action Items API (addActionItem / updateActionItem / deleteActionItem / reorderActionItems) on the Actions tab instead.",
    };
  }

  try {
    // Pre-fetch the current row so we can detect a status transition and
    // lock / unlock evidence accordingly. This is the path the reopen flow
    // travels through (status: "closed" / "pending_qa_review" / "rejected"
    // â†’ "open" / "in_progress"). Tenant-scoped via the same where clause.
    const before = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: {
        status: true,
        reference: true,
        rca: true,
        rcaMethod: true,
        rcaApproved: true,
      },
    });
    if (!before) return { success: false, error: "CAPA not found" };

    // SME Section 1, Stage 3 (partial) â€” RCA field-lock.
    // Once a CAPA enters QA review (and through closure/rejection), the
    // rca and rcaMethod fields become the regulatory record of "what
    // we determined caused the deviation." Editing them while QA is
    // mid-review undermines the integrity of that review. Reuses the
    // existing LOCKED_CAPA_STATUSES set so the boundary is one
    // codebase-wide constant (matches evidence + alignment + criteria
    // locks). Strict: even re-posting the same value is treated as a
    // write attempt and blocked â€” server cannot distinguish intent.
    // `!== undefined` (not falsy) â€” clearing to empty string is itself
    // a destructive edit and must be blocked.
    if (
      (parsed.data.rca !== undefined || parsed.data.rcaMethod !== undefined) &&
      LOCKED_CAPA_STATUSES.has(before.status)
    ) {
      const attemptedFields = [
        parsed.data.rca !== undefined ? "rca" : null,
        parsed.data.rcaMethod !== undefined ? "rcaMethod" : null,
      ].filter((v): v is string => v !== null);
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA",
            action: "CAPA_UPDATE_BLOCKED_RCA_LOCKED",
            recordId: id,
            recordTitle: (before.reference ?? id).slice(0, 80),
            newValue: JSON.stringify({
              currentStatus: before.status,
              attemptedFields,
            }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_UPDATE_BLOCKED_RCA_LOCKED audit:", err);
      }
      return {
        success: false,
        error: "Root cause analysis is locked once the CAPA enters QA review.",
      };
    }

    // SME Section 1, Stage 3 (FULL) â€” auto-invalidate the RCA review
    // when the underlying rca / rcaMethod text changes after approval.
    // The Stage-3 RCA field-lock blocks edits >= pending_qa_review, but
    // during "in_progress" the RCA is editable AND can already be
    // approved by QA. Editing the approved content silently would mean
    // QA's "Approved" verdict applies to text the reviewer never saw.
    // So: detect any change, and if rcaApproved is true, clear the
    // verdict + audit it so the reviewer re-reviews.
    const rcaChanged =
      parsed.data.rca !== undefined && parsed.data.rca !== before.rca;
    const rcaMethodChanged =
      parsed.data.rcaMethod !== undefined && parsed.data.rcaMethod !== before.rcaMethod;
    const shouldInvalidateRcaReview =
      (rcaChanged || rcaMethodChanged) && before.rcaApproved === true;
    const rcaInvalidateData = shouldInvalidateRcaReview
      ? {
          rcaApproved: null,
          rcaReviewedBy: null,
          rcaReviewedById: null,
          rcaReviewedAt: null,
          rcaReviewNotes: null,
          rcaOverrideBy: null,
          rcaOverrideById: null,
          rcaOverrideAt: null,
          rcaOverrideReason: null,
        }
      : {};

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
        ...rcaInvalidateData,
      },
    });

    if (shouldInvalidateRcaReview) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA / RCA Review",
            action: "CAPA_RCA_REVIEW_INVALIDATED_BY_EDIT",
            recordId: id,
            recordTitle: (before.reference ?? id).slice(0, 80),
            newValue: JSON.stringify({
              changedFields: [
                rcaChanged ? "rca" : null,
                rcaMethodChanged ? "rcaMethod" : null,
              ].filter((v): v is string => v !== null),
            }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_RCA_REVIEW_INVALIDATED_BY_EDIT audit:", err);
      }
    }

    // RUNG 3D-CAPA — the status-transition lock/unlock side-effect moved out
    // of updateCAPA (status is no longer accepted here). Forward locks happen
    // in submitForReview / rejectCAPA / signAndCloseCAPA; the unlock-on-reopen
    // happens in reopenCAPA.

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_UPDATED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] updateCAPA failed:", err);
    return { success: false, error: "Failed to update CAPA" };
  }
}

export async function clearDIGate(
  id: string,
  input: z.input<typeof ClearDIGateSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can clear the Data Integrity gate" };
  }

  const parsed = ClearDIGateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        diGateStatus: "cleared",
        diGateReviewedBy: session.user.name,
        diGateReviewDate: new Date(),
        diGateNotes: parsed.data.notes ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_DI_GATE_CLEARED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] clearDIGate failed:", err);
    return { success: false, error: "Failed to clear DI gate" };
  }
}

export async function submitForReview(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    // SME Section 1, Stage 3 (FULL) â€” RCA QA gate. The CAPA cannot leave
    // in_progress without a QA reviewer (different from the creator)
    // approving the root cause analysis. rcaApproved=true is the only
    // acceptable state; null=unreviewed and false=rejected both block.
    if (existing.rcaApproved !== true) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA",
            action: "CAPA_SUBMIT_BLOCKED_RCA_NOT_APPROVED",
            recordId: id,
            newValue: JSON.stringify({
              rcaApproved: existing.rcaApproved,
              reason:
                existing.rcaApproved === false
                  ? "rca_rejected"
                  : "rca_not_yet_reviewed",
            }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_SUBMIT_BLOCKED_RCA_NOT_APPROVED audit:", err);
      }
      return {
        success: false,
        error:
          existing.rcaApproved === false
            ? "RCA was rejected by QA â€” revise the root cause analysis and request re-review before submitting for full QA review."
            : "RCA must be approved by QA before this CAPA can enter full review. Open the RCA tab and request review.",
      };
    }

    // Substage 4.7 gate â€” action plan must be reviewed for cosmetic-CAPA
    // risk before submission. Either alignmentStatus === "aligned", or a
    // separate-of-duties override on a "cosmetic" verdict has been recorded.
    if (
      existing.alignmentStatus !== "aligned" &&
      !existing.alignmentOverrideReason
    ) {
      return {
        success: false,
        error:
          "Action plan must be reviewed for cosmetic CAPA risk before submission. " +
          "Open the Actions tab to complete the alignment review.",
      };
    }

    if (existing.diGate && existing.diGateStatus !== "cleared") {
      return {
        success: false,
        error: "Data Integrity gate must be cleared before submitting for review",
      };
    }

    // Lock evidence + effectiveness criteria FIRST so the CAPA never sits in
    // pending_qa_review with editable artifacts. Both helpers inside
    // lockCAPAArtifacts are idempotent â€” re-runs are safe.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "pending_qa_review" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_SUBMITTED_FOR_REVIEW",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] submitForReview failed:", err);
    return { success: false, error: "Failed to submit for review" };
  }
}

export async function rejectCAPA(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject CAPAs" };
  }

  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    // Rejection ends investigation activity â€” lock both evidence and
    // criteria the same way submitForReview/signAndCloseCAPA do so the
    // trail is consistent.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "rejected",
        diGateNotes: parsed.data.reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_REJECTED",
        recordId: id,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] rejectCAPA failed:", err);
    return { success: false, error: "Failed to reject CAPA" };
  }
}

/**
 * RUNG 3D-CAPA — guarded open → in_progress transition. Was the UI autoAdvance
 * via updateCAPA (status bypass). Optimistic-locked on status="open" so a
 * concurrent transition can't double-fire. No precondition beyond "open" —
 * matches the prior behaviour (the UI advanced once RCA text was entered;
 * full RCA approval is gated later, at submitForReview).
 */
export async function startCAPAProgress(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!CAPA_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "You do not have permission to advance this CAPA." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  const updated = await prisma.cAPA.updateMany({
    where: { id, tenantId: session.user.tenantId, status: "open" },
    data: { status: "in_progress" },
  });
  if (updated.count === 0) {
    return { success: false, error: "CAPA cannot start progress — it is not in the open state." };
  }
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "CAPA",
      action: "CAPA_PROGRESS_STARTED",
      recordId: id,
      oldValue: "open",
      newValue: "in_progress",
    },
  });
  revalidatePath("/capa");
  revalidatePath(`/capa/${id}`);
  return { success: true, data: null };
}

/**
 * RUNG 3D-CAPA — guarded closed/rejected → open transition (reopen). Senior
 * action (QA Head / admins only). Requires a reason. Carries the evidence +
 * criteria unlock side-effect that previously lived in updateCAPA's status
 * boundary detection (now the only place it fires).
 */
export async function reopenCAPA(
  id: string,
  input: z.input<typeof ReopenCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (
    session.user.role !== "qa_head" &&
    session.user.role !== "customer_admin" &&
    session.user.role !== "super_admin"
  ) {
    return { success: false, error: "Only a QA Head or an admin can reopen a CAPA." };
  }
  const parsed = ReopenCAPASchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const before = await prisma.cAPA.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { status: true, reference: true },
  });
  if (!before) return { success: false, error: "CAPA not found" };
  if (before.status !== "closed" && before.status !== "rejected") {
    return { success: false, error: "Only a closed or rejected CAPA can be reopened." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "open" },
    });
    // Unlock evidence + effectiveness criteria (moved here from updateCAPA).
    await unlockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_REOPENED",
        recordId: id,
        recordTitle: (before.reference ?? id).slice(0, 80),
        oldValue: before.status,
        newValue: JSON.stringify({ status: "open", reason: parsed.data.reason }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] reopenCAPA failed:", err);
    return { success: false, error: "Failed to reopen CAPA" };
  }
}

export async function deleteCAPA(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    await prisma.cAPA.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_DELETED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCAPA failed:", err);
    return { success: false, error: "Failed to delete CAPA" };
  }
}
