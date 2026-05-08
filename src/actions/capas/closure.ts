"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { lockCAPAArtifacts } from "@/lib/evidence-lock";
import {
  evaluateApprovalProgress,
  type ApprovalTier,
} from "@/lib/capa-approvals";
import {
  canMarkCAPAImplemented,
  ccDepsSnapshot,
  evaluateCCDependencies,
} from "@/lib/cc-dependencies";
import type { ActionResult } from "./_types";

/* ── CAPA closure path + CC dependency loader ──
 *
 * signAndCloseCAPA carries three gates:
 *   1. Substage 5.2 — count-based approval gate
 *   2. Substage 5.2 §5.3 — unresolved-concerns gate
 *   3. Substage 6.4 — Linked Change Control dependency gate (with
 *                     risk-proportionate hard / soft branches)
 *
 * loadCAPACCDeps is the client-callable read used by ActionsPanel's
 * Sign & Close pre-flight UX.
 */

export async function signAndCloseCAPA(
  id: string,
  ccBlockOverride?: { reason: string },
): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can sign and close CAPAs" };
  }

  if (!session.user.gxpSignatory) {
    return { success: false, error: "GxP signatory authority is required to sign and close" };
  }

  // Substage 5.2 — count-based approval gate + §5.3 unresolved-concerns
  // gate. Plus substage 6.4 — Linked Change Control dependency gate. All
  // three must clear before the lock + status flip so a CAPA can't enter
  // "closed" with either a pending approver slot, a pending discussion
  // concern, or an unfulfilled CC dependency.
  const existing = await prisma.cAPA.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, risk: true },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  const [approvals, comments, ccLinks] = await Promise.all([
    prisma.cAPAApproval.findMany({
      // revokedAt: null filters out approvals that were soft-revoked —
      // those slots are open again and don't count toward the gate.
      where: {
        capaId: id,
        tenantId: session.user.tenantId,
        revokedAt: null,
      },
      select: { approverRole: true, approverId: true },
    }),
    prisma.cAPAComment.findMany({
      where: { capaId: id, tenantId: session.user.tenantId },
      select: { isConcern: true, resolvedAt: true, deletedAt: true },
    }),
    prisma.cAPAChangeControlLink.findMany({
      where: { capaId: id, tenantId: session.user.tenantId },
      include: {
        changeControl: {
          select: {
            id: true,
            reference: true,
            status: true,
            targetImplementationDate: true,
            deletedAt: true,
          },
        },
      },
    }),
  ]);
  const progress = evaluateApprovalProgress(
    existing.risk as ApprovalTier,
    approvals,
    comments,
  );
  if (!progress.satisfied) {
    if (progress.reason === "UNRESOLVED_CONCERNS") {
      return {
        success: false,
        error: `Approval blocked: ${progress.unresolvedConcerns} unresolved concern${progress.unresolvedConcerns === 1 ? "" : "s"} must be resolved first.`,
      };
    }
    const missingDesc = progress.missing
      .map(
        (r) =>
          `${r.count} more ${r.role.replace("_", " ")} approval${r.count === 1 ? "" : "s"}`,
      )
      .join("; ");
    return {
      success: false,
      error: `Cannot close CAPA — pending approvals: ${missingDesc}.`,
    };
  }

  // Substage 6.4 — CC dependency gate. Risk-proportionate: Critical/High
  // hard-block; Medium/Low allow override-with-reason. Rejected CCs always
  // hard-block regardless of risk.
  const deps = evaluateCCDependencies(ccLinks);
  const gate = canMarkCAPAImplemented({
    capaRisk: existing.risk,
    deps,
    overrideProvided: Boolean(ccBlockOverride),
    overrideReason: ccBlockOverride?.reason,
  });
  if (!gate.allowed) {
    if (gate.reason === "HARD_GATE_BLOCKED") {
      return {
        success: false,
        error: `Cannot mark CAPA as implemented: ${gate.details ?? "linked change controls not satisfied."}`,
      };
    }
    if (gate.reason === "SOFT_GATE_REQUIRES_OVERRIDE") {
      return {
        success: false,
        error: gate.details ?? "Linked change controls are still incomplete. Provide an override reason (min 20 chars) to proceed.",
      };
    }
    if (gate.reason === "OVERRIDE_REASON_TOO_SHORT") {
      return {
        success: false,
        error: gate.details ?? "Override reason must be at least 20 characters.",
      };
    }
  }
  const overrideUsed = gate.allowed && Boolean(ccBlockOverride) && deps.incompleteCount > 0;

  try {
    const now = new Date();
    const effectivenessDue = new Date(now);
    effectivenessDue.setDate(effectivenessDue.getDate() + 90);

    // Defensive lock — usually already locked from submitForReview but
    // re-locking is a no-op for already-locked items.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      name: session.user.name,
      role: session.user.role,
    });

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "closed",
        closedBy: session.user.name,
        closedAt: now,
        effectivenessCheck: true,
        effectivenessDate: effectivenessDue,
        // Persist override metadata only when actually used. The fields
        // stay null on the normal flow (no incomplete CCs) so an
        // inspector reviewing the row can immediately tell whether an
        // override was applied.
        ...(overrideUsed
          ? {
              ccBlockOverrideReason: ccBlockOverride!.reason.trim(),
              ccBlockOverrideById: session.user.id,
              ccBlockOverrideByName: session.user.name,
              ccBlockOverrideAt: now,
            }
          : {}),
      },
    });

    if (capa.findingId) {
      await prisma.finding.update({
        where: { id: capa.findingId, tenantId: session.user.tenantId },
        data: { status: "Closed" },
      });
    }

    const depsForAudit = ccDepsSnapshot(deps);
    // Existing CAPA_CLOSED audit (kept verbatim for analytics continuity).
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_CLOSED",
        recordId: id,
        recordTitle: capa.description.slice(0, 80),
      },
    });
    // Substage 6.4 — paired CAPA_MARKED_IMPLEMENTED row carrying the
    // dependency snapshot for forensic clarity. Lets an inspector ask
    // "what was the linked-CC state at the moment this CAPA was sealed?"
    // without joining through the link table at the historical timestamp.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_MARKED_IMPLEMENTED",
        recordId: id,
        recordTitle: capa.description.slice(0, 80),
        newValue: JSON.stringify({
          capaRisk: existing.risk,
          ccDepsSnapshot: depsForAudit,
          overrideUsed,
        }),
      },
    });
    if (overrideUsed) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          module: "CAPA",
          action: "CAPA_CC_BLOCK_OVERRIDDEN",
          recordId: id,
          recordTitle: capa.description.slice(0, 80),
          newValue: JSON.stringify({
            overrideReason: ccBlockOverride!.reason.trim(),
            capaRisk: existing.risk,
            incompleteCCs: depsForAudit.incompleteRefs,
          }),
        },
      });
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    revalidatePath("/gap-assessment");
    revalidatePath("/");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] signAndCloseCAPA failed:", err);
    return { success: false, error: "Failed to close CAPA" };
  }
}

/**
 * Substage 6.4 — client-callable read of a CAPA's CC dependency state.
 * The Sign & Close button uses this for its pre-flight gate so the user
 * sees a hard-gate or soft-gate response BEFORE the SignClose modal
 * collects their e-signature credentials. Mirrors the
 * load{Approvals,Comments,Criteria}ForCAPA pattern.
 */
export async function loadCAPACCDeps(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: capaId }
        : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, risk: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const links = await prisma.cAPAChangeControlLink.findMany({
    where: { capaId },
    include: {
      changeControl: {
        select: {
          id: true,
          reference: true,
          status: true,
          targetImplementationDate: true,
          deletedAt: true,
        },
      },
    },
  });
  const deps = evaluateCCDependencies(links);
  return {
    success: true,
    data: { capaRisk: capa.risk, deps },
  };
}
