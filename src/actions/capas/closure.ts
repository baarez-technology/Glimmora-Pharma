"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { lockCAPAArtifacts } from "@/lib/evidence-lock";
import {
  evaluateApprovalProgress,
  type ApprovalTier,
} from "@/lib/capa-approvals";
// CHANGE CONTROL HIDDEN — 6.4 dependency gate bypassed inside
// signAndCloseCAPA. `evaluateCCDependencies` stays imported because
// `loadCAPACCDeps` (the read-only helper exported from this file) still
// works for any future caller. The two gate-only helpers below are
// commented and re-added when the gate is restored.
import { evaluateCCDependencies } from "@/lib/cc-dependencies";
// import {
//   canMarkCAPAImplemented,
//   ccDepsSnapshot,
// } from "@/lib/cc-dependencies";
import {
  canonicalizeCAPAClosureContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { SIGNING_AUDIT_MODULE, type ActionResult } from "./_types";
import { readSigningProvenance } from "./_shared";

const SignCloseCAPASchema = z.object({
  // Re-authentication password (Part 11 §11.200(a)(1)(ii)).
  password: z.string().min(1, "Password is required to sign"),
  // Free-form selection from the SignClose modal — e.g. "approve",
  // "verify", "confirm". Embedded in the canonical content so the
  // signed record carries the operator's stated meaning.
  signatureMeaning: z.string().min(1, "Signature meaning is required"),
  ccBlockOverride: z
    .object({ reason: z.string().min(20) })
    .optional(),
});

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
  input: z.input<typeof SignCloseCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SignCloseCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ccBlockOverride = parsed.data.ccBlockOverride;

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
    select: {
      id: true,
      risk: true,
      reference: true,
      description: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  // CHANGE CONTROL HIDDEN — ccLinks query removed from the Promise.all
  // since the 6.4 gate that consumed it is bypassed. The destructure is
  // back to two items. To re-enable: restore the third query + the
  // ccLinks identifier here, plus the gate block below.
  const [approvals, comments] = await Promise.all([
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
    // prisma.cAPAChangeControlLink.findMany({
    //   where: { capaId: id, tenantId: session.user.tenantId },
    //   include: {
    //     changeControl: {
    //       select: {
    //         id: true,
    //         reference: true,
    //         status: true,
    //         targetImplementationDate: true,
    //         deletedAt: true,
    //       },
    //     },
    //   },
    // }),
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

  // CHANGE CONTROL HIDDEN — 6.4 dependency gate bypassed. CAPAs now close
  // without consulting linked CC status. The action still accepts
  // ccBlockOverride in its input schema for backward compatibility, but
  // the value is ignored. To re-enable: uncomment the gate block below
  // and the dependent audit rows further down (CAPA_MARKED_IMPLEMENTED
  // carrying ccDepsSnapshot, CAPA_CC_BLOCK_OVERRIDDEN). The
  // ccBlockOverrideReason / ccBlockOverrideById / ccBlockOverrideByName /
  // ccBlockOverrideAt fields on the CAPA model are preserved.
  // const deps = evaluateCCDependencies(ccLinks);
  // const gate = canMarkCAPAImplemented({
  //   capaRisk: existing.risk,
  //   deps,
  //   overrideProvided: Boolean(ccBlockOverride),
  //   overrideReason: ccBlockOverride?.reason,
  // });
  // if (!gate.allowed) {
  //   if (gate.reason === "HARD_GATE_BLOCKED") {
  //     return {
  //       success: false,
  //       error: `Cannot mark CAPA as implemented: ${gate.details ?? "linked change controls not satisfied."}`,
  //     };
  //   }
  //   if (gate.reason === "SOFT_GATE_REQUIRES_OVERRIDE") {
  //     return {
  //       success: false,
  //       error: gate.details ?? "Linked change controls are still incomplete. Provide an override reason (min 20 chars) to proceed.",
  //     };
  //   }
  //   if (gate.reason === "OVERRIDE_REASON_TOO_SHORT") {
  //     return {
  //       success: false,
  //       error: gate.details ?? "Override reason must be at least 20 characters.",
  //     };
  //   }
  // }
  // const overrideUsed = gate.allowed && Boolean(ccBlockOverride) && deps.incompleteCount > 0;
  const overrideUsed = false;

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing. Mirrors
  // the approveCAPA pattern: verify before any state change so a wrong
  // password causes zero side effects beyond the failed-attempt audit row.
  const passwordOk = await verifyPasswordForSigning(
    session.user.id,
    parsed.data.password,
  );
  if (!passwordOk) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: SIGNING_AUDIT_MODULE,
        action: "SIGNING_PASSWORD_FAILED",
        recordId: id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_CLOSURE",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  try {
    const now = new Date();
    const effectivenessDue = new Date(now);
    effectivenessDue.setDate(effectivenessDue.getDate() + 90);

    // Defensive lock — usually already locked from submitForReview but
    // re-locking is a no-op for already-locked items. Outside the tx
    // because lockCAPAArtifacts is idempotent and uses its own queries.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      name: session.user.name,
      role: session.user.role,
    });

    // Build the canonical content + hash before the transaction so any
    // serialisation issue surfaces as a clean failure (no half-written rows).
    const passwordVerifiedAt = now;
    const closingComment = overrideUsed
      ? `[CC override] ${ccBlockOverride!.reason.trim()}`
      : null;
    const canonicalContent = canonicalizeCAPAClosureContent({
      capaId: existing.id,
      capaReference: existing.reference,
      capaDescription: existing.description,
      riskLevel: existing.risk,
      closedAt: now,
      closingComment,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `${existing.reference ?? existing.id} closed by ${session.user.name} (${session.user.role}) — risk: ${existing.risk}`;
    const provenance = await readSigningProvenance();

    // Atomic: mint the SignedRecord, flip CAPA.status, link
    // CAPA.closureSignatureId. Either all three commit or none.
    const { capa, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_CLOSURE",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: parsed.data.signatureMeaning,
          contentHash,
          contentSummary,
          passwordVerifiedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.cAPA.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          status: "closed",
          closedBy: session.user.name,
          closedAt: now,
          effectivenessCheck: true,
          effectivenessDate: effectivenessDue,
          closureSignatureId: sig.id,
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
      return { capa: updated, signedRecord: sig };
    });

    if (capa.findingId) {
      await prisma.finding.update({
        where: { id: capa.findingId, tenantId: session.user.tenantId },
        data: { status: "Closed" },
      });
    }

    // CHANGE CONTROL HIDDEN — depsForAudit removed because the gate it
    // backed is bypassed. To re-enable, uncomment.
    // const depsForAudit = ccDepsSnapshot(deps);
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
    // Paired CAPA_CLOSURE_SIGNED row — points at the SignedRecord id so the
    // audit trail and the SignedRecord ledger cross-reference cleanly.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_CLOSURE_SIGNED",
        recordId: signedRecord.id,
        recordTitle: capa.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: parsed.data.signatureMeaning,
          capaId: capa.id,
        }),
      },
    });
    // CHANGE CONTROL HIDDEN — Substage 6.4 audit rows
    // (CAPA_MARKED_IMPLEMENTED carrying the ccDepsSnapshot, plus the
    // conditional CAPA_CC_BLOCK_OVERRIDDEN row) are suppressed because
    // the underlying gate is bypassed. The action strings remain available
    // for any future re-enable. To re-enable: restore depsForAudit above
    // plus this block.
    // await prisma.auditLog.create({
    //   data: {
    //     tenantId: session.user.tenantId,
    //     userId: session.user.id,
    //     userName: session.user.name,
    //     userRole: session.user.role,
    //     module: "CAPA",
    //     action: "CAPA_MARKED_IMPLEMENTED",
    //     recordId: id,
    //     recordTitle: capa.description.slice(0, 80),
    //     newValue: JSON.stringify({
    //       capaRisk: existing.risk,
    //       ccDepsSnapshot: depsForAudit,
    //       overrideUsed,
    //     }),
    //   },
    // });
    // if (overrideUsed) {
    //   await prisma.auditLog.create({
    //     data: {
    //       tenantId: session.user.tenantId,
    //       userId: session.user.id,
    //       userName: session.user.name,
    //       userRole: session.user.role,
    //       module: "CAPA",
    //       action: "CAPA_CC_BLOCK_OVERRIDDEN",
    //       recordId: id,
    //       recordTitle: capa.description.slice(0, 80),
    //       newValue: JSON.stringify({
    //         overrideReason: ccBlockOverride!.reason.trim(),
    //         capaRisk: existing.risk,
    //         incompleteCCs: depsForAudit.incompleteRefs,
    //       }),
    //     },
    //   });
    // }

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
