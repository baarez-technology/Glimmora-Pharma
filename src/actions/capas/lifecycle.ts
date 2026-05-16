"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  lockCAPAArtifacts,
  unlockCAPAArtifacts,
  LOCKED_CAPA_STATUSES,
} from "@/lib/evidence-lock";
import { generateReference, isReferenceConflict } from "@/lib/reference";
import type { ActionResult } from "./_types";

/* ── CAPA lifecycle actions ──
 *
 * Create / update / clearDIGate / submitForReview / rejectCAPA /
 * deleteCAPA. Closure (signAndCloseCAPA) lives in closure.ts because
 * it carries the CC-dependency gate; alignment + approvals are split
 * out into their own files. Each file has its own "use server" so they
 * can be tree-shaken independently.
 */

// ── Schemas ──

const CreateCAPASchema = z.object({
  description: z.string().min(10, "Description must be at least 10 characters"),
  source: z.enum([
    "Gap Assessment",
    "Deviation",
    "FDA 483",
    "Internal Audit",
    "External Audit",
    "Customer Complaint",
    "Other",
  ]),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  siteId: z.string().optional(),
  linkedFindingId: z.string().optional(),
  linkedDeviationId: z.string().optional(),
  diGateRequired: z.boolean().optional(),
});

const UpdateCAPASchema = z.object({
  description: z.string().min(10).optional(),
  source: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.string().optional(),
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
  correctiveActions: z.string().optional(),
});

const ClearDIGateSchema = z.object({
  notes: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

// ── Actions ──

export async function createCAPA(
  input: z.input<typeof CreateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

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
          // Reference lookup is intentionally GLOBAL (no tenantId filter).
          // CAPA.reference has a global @unique index, not @@unique on
          // [tenantId, reference] — so two tenants each computing their
          // per-tenant max would both produce "CAPA-2026-001" and the second
          // insert would hit P2002 every retry (the per-tenant max still
          // says "this tenant has none"). Reading the global max for the
          // year guarantees the computed next-number is strictly greater
          // than anything already in the unique index. Tenants may see
          // gaps in their own sequence — that's the documented trade-off
          // of the global unique design.
          const reference = await generateReference(
            "CAPA",
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
          return tx.cAPA.create({
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
              diGate: diGateRequired ?? false,
              diGateStatus: diGateRequired ? "pending" : null,
            },
          });
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!capa) {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      const code = (lastErr as { code?: string } | null)?.code;
      console.error("[action] createCAPA exhausted reference retries:", { code, message, lastErr });
      return {
        success: false,
        error: process.env.NODE_ENV === "production"
          ? "Failed to allocate CAPA reference"
          : `Failed to allocate CAPA reference: ${code ? `[${code}] ` : ""}${message}`,
      };
    }

    if (linkedFindingId) {
      await prisma.finding.update({
        where: { id: linkedFindingId, tenantId: session.user.tenantId },
        data: { status: "In Progress", linkedCAPAId: capa.id },
      });
    }

    if (linkedDeviationId) {
      await prisma.deviation.update({
        where: { id: linkedDeviationId, tenantId: session.user.tenantId },
        data: { linkedCAPAId: capa.id },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_CREATED",
        recordId: capa.id,
        recordTitle: capa.reference
          ? `${capa.reference} — ${parsed.data.description.slice(0, 60)}`
          : parsed.data.description.slice(0, 80),
        newValue: parsed.data.risk,
      },
    });

    revalidatePath("/capa");
    revalidatePath("/gap-assessment");
    revalidatePath("/deviation");
    return { success: true, data: capa };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    console.error("[action] createCAPA failed:", { code, message, err });
    return {
      success: false,
      error: process.env.NODE_ENV === "production"
        ? "Failed to create CAPA"
        : `Failed to create CAPA: ${code ? `[${code}] ` : ""}${message}`,
    };
  }
}

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

  try {
    // Pre-fetch the current row so we can detect a status transition and
    // lock / unlock evidence accordingly. This is the path the reopen flow
    // travels through (status: "closed" / "pending_qa_review" / "rejected"
    // → "open" / "in_progress"). Tenant-scoped via the same where clause.
    const before = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { status: true },
    });
    if (!before) return { success: false, error: "CAPA not found" };

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
      },
    });

    // Lock / unlock side-effect when the CAPA crosses the investigation
    // boundary. Idempotent — both helpers no-op when the desired state is
    // already in place.
    if (parsed.data.status && parsed.data.status !== before.status) {
      const wasLocked = LOCKED_CAPA_STATUSES.has(before.status);
      const willBeLocked = LOCKED_CAPA_STATUSES.has(parsed.data.status);
      const actor = { name: session.user.name, role: session.user.role };
      if (!wasLocked && willBeLocked) {
        await lockCAPAArtifacts(id, session.user.tenantId, actor);
      } else if (wasLocked && !willBeLocked) {
        await unlockCAPAArtifacts(id, session.user.tenantId, actor);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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
        userName: session.user.name,
        userRole: session.user.role,
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

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    // Substage 4.7 gate — action plan must be reviewed for cosmetic-CAPA
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
    // lockCAPAArtifacts are idempotent — re-runs are safe.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      name: session.user.name,
      role: session.user.role,
    });

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "pending_qa_review" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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

  try {
    // Rejection ends investigation activity — lock both evidence and
    // criteria the same way submitForReview/signAndCloseCAPA do so the
    // trail is consistent.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      name: session.user.name,
      role: session.user.role,
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
        userName: session.user.name,
        userRole: session.user.role,
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

export async function deleteCAPA(id: string): Promise<ActionResult> {
  const session = await requireAuth();

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
        userName: session.user.name,
        userRole: session.user.role,
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
