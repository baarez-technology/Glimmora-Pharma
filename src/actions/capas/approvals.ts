"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  canonicalizeCAPAApprovalContent,
  canonicalizeCAPAApprovalRevocationContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import {
  APPROVAL_REQUIREMENTS,
  canApproveCAPA,
  type ApprovalTier,
} from "@/lib/capa-approvals";
import { getCAPAApprovals } from "@/lib/queries/capas";
import {
  APPROVAL_AUDIT_MODULE,
  SIGNING_AUDIT_MODULE,
  type ActionResult,
} from "./_types";
import { readSigningProvenance } from "./_shared";

/* ── Substage 5.2 — Tiered Approval Routing + Substage 5.4 — e-sig ───────
 *
 * Count-based approvals keyed off APPROVAL_REQUIREMENTS in
 * src/lib/capa-approvals.ts. closure.ts's signAndCloseCAPA gates the
 * actual closure on evaluateApprovalProgress; the actions here are the
 * approver-side surface (record / revoke a single approval) plus the
 * client-callable read used by ApprovalsSection.
 *
 * Substage 5.4 layered Part 11 e-signatures on top: every approve and
 * revoke action mints a SignedRecord row with a SHA-256 content hash and
 * a re-authenticated password under §11.200(a)(1)(ii).
 */

// ── Schemas ──

const ApproveCAPASchema = z.object({
  // Re-authentication password (Part 11 §11.200(a)(1)(ii)). Plaintext —
  // never logged, never echoed back. The action runs bcrypt.compare and
  // discards the value.
  password: z.string().min(1, "Password is required to sign"),
  comment: z.string().max(2000).optional(),
});

const RevokeCAPAApprovalSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

/**
 * Client-callable read wrapper — mirrors loadCriteriaForCAPA / loadEvidenceForCAPA.
 * The panel calls this from a client component to refresh after a successful
 * approve / revoke. Tenant-scoped via the parent-CAPA guard.
 */
export async function loadApprovalsForCAPA(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const approvals = await getCAPAApprovals(session.user.tenantId, capaId);
  return { success: true, data: approvals };
}

/**
 * Record one approval against a CAPA in pending_qa_review. Distinct users
 * (by id) at the same role count once each; same user cannot approve
 * twice. The CAPA only closes once evaluateApprovalProgress(risk,
 * approvals, comments).satisfied === true, enforced inside
 * signAndCloseCAPA. Per substage 5.3 ("All reviewer comments adjudicated
 * and documented before approval"), this action also blocks while any
 * concern comment is unresolved — applies to intermediate approvals as
 * well as the final close.
 */
export async function approveCAPA(
  capaId: string,
  input: z.input<typeof ApproveCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ApproveCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: {
      id: true,
      status: true,
      risk: true,
      description: true,
      reference: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.status !== "pending_qa_review") {
    return {
      success: false,
      error: "CAPA is not awaiting approvals — submit it for QA review first.",
    };
  }
  // Role allowed for this tier? "Critical" needs qa_head + regulatory_affairs;
  // other tiers need qa_head only. Anyone else (it_cdo, viewer, etc.) gets
  // a hard rejection — they're not in the approver set for this tier.
  if (!canApproveCAPA(session.user.role, existing.risk)) {
    const tierReqs = APPROVAL_REQUIREMENTS[existing.risk as ApprovalTier];
    const allowedRoles = tierReqs
      ? tierReqs.map((r) => r.role.replace("_", " ")).join(" or ")
      : "an authorised approver";
    return {
      success: false,
      error: `Your role cannot approve a ${existing.risk} CAPA — ${allowedRoles} required.`,
    };
  }
  // Distinct-user rule — same user cannot stack two LIVE approvals against
  // the same CAPA. revokedAt: null filter means a previously-revoked
  // approval doesn't lock the user out of re-approving.
  const alreadyApproved = await prisma.cAPAApproval.findFirst({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      approverId: session.user.id,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (alreadyApproved) {
    return {
      success: false,
      error: "You have already approved this CAPA. Approval requires distinct users.",
    };
  }
  // §5.3 — block approval while any concern comment is unresolved.
  // Counts isConcern && !resolvedAt && !deletedAt (deleted concerns are
  // treated as withdrawn).
  const unresolvedConcerns = await prisma.cAPAComment.count({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      isConcern: true,
      resolvedAt: null,
      deletedAt: null,
    },
  });
  if (unresolvedConcerns > 0) {
    return {
      success: false,
      error: `Approval blocked: ${unresolvedConcerns} unresolved concern${unresolvedConcerns === 1 ? "" : "s"} must be resolved first.`,
    };
  }

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing. We
  // verify before any state change so a wrong password causes zero side
  // effects (other than the audit row, which is the point — every failed
  // signing attempt is recorded).
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
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_APPROVAL",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  // Build the canonical content + hash BEFORE the transaction so any
  // serialisation issue surfaces as a clean failure (no half-written rows).
  const passwordVerifiedAt = new Date();
  const approvedAt = passwordVerifiedAt; // single moment for both
  const canonicalContent = canonicalizeCAPAApprovalContent({
    capaId: existing.id,
    capaReference: existing.reference,
    capaDescription: existing.description,
    riskLevel: existing.risk,
    approverRole: session.user.role,
    approvedAt,
    comment: parsed.data.comment ?? null,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} approved by ${session.user.name} (${session.user.role}) — risk: ${existing.risk}`;
  const provenance = await readSigningProvenance();

  try {
    // Atomic 3-step: create approval row first (so we have its id for
    // SignedRecord.recordId), then create the SignedRecord, then link
    // the approval back via signatureId. Either all three commit or none.
    const { approval, signedRecord } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.cAPAApproval.create({
          data: {
            tenantId: session.user.tenantId,
            capaId,
            approverRole: session.user.role,
            approverName: session.user.name,
            approverId: session.user.id,
            approvedAt,
            comment: parsed.data.comment ?? null,
            signatureId: null,
          },
        });
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "CAPA_APPROVAL",
            recordId: created.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Approved",
            contentHash,
            contentSummary,
            passwordVerifiedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        const linked = await tx.cAPAApproval.update({
          where: { id: created.id },
          data: { signatureId: sig.id },
        });
        return { approval: linked, signedRecord: sig };
      },
    );

    // Two paired audit rows — one for the workflow event (CAPA_APPROVED),
    // one for the signing event (CAPA_APPROVAL_SIGNED). The signed event
    // points at the SignedRecord id so the audit trail and the
    // SignedRecord ledger cross-reference cleanly.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: APPROVAL_AUDIT_MODULE,
        action: "CAPA_APPROVED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          role: session.user.role,
          name: session.user.name,
          comment: parsed.data.comment ?? null,
          signatureId: signedRecord.id,
        }),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_APPROVAL_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Approved",
          capaId,
          approvalId: approval.id,
        }),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: { approval, signature: signedRecord } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    console.error("[action] approveCAPA failed:", { code, message, err });
    return {
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Failed to record approval"
          : `Failed to record approval: ${code ? `[${code}] ` : ""}${message}`,
    };
  }
}

/**
 * Revoke an approval the caller themselves recorded. Only the approver
 * who placed the row can take it back, and only while the CAPA is still
 * in pending_qa_review (revocation after closure would require the close
 * to be undone first, which is intentionally not possible here).
 *
 * Substage 5.4 — revocation is a Part 11 signing event in its own right.
 * The original approval row is NOT deleted: it carries `revokedAt` +
 * `revokedSignatureId` so the audit chain stays intact. The original
 * SignedRecord is also preserved (Part 11 immutability). A NEW
 * SignedRecord with recordType = "CAPA_APPROVAL_REVOCATION" is appended,
 * with its own contentHash + password re-verification.
 */
export async function revokeCAPAApproval(
  approvalId: string,
  input: z.input<typeof RevokeCAPAApprovalSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RevokeCAPAApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const existing = await prisma.cAPAApproval.findFirst({
    where: { id: approvalId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          status: true,
          description: true,
          reference: true,
        },
      },
    },
  });
  if (!existing) return { success: false, error: "Approval not found" };
  if (existing.revokedAt !== null) {
    return { success: false, error: "Approval has already been revoked." };
  }
  if (existing.capa.status !== "pending_qa_review") {
    return {
      success: false,
      error:
        "Cannot revoke approval — the CAPA has already moved past QA review.",
    };
  }
  if (existing.approverId !== session.user.id) {
    return {
      success: false,
      error: "You can only revoke your own approval.",
    };
  }

  // §11.200(a)(1)(ii) password re-verification — same as the approve path.
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
        recordId: existing.capa.id,
        recordTitle: existing.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_APPROVAL_REVOCATION",
          approvalId: existing.id,
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  const passwordVerifiedAt = new Date();
  const revokedAt = passwordVerifiedAt;
  const canonicalContent = canonicalizeCAPAApprovalRevocationContent({
    approvalId: existing.id,
    capaId: existing.capa.id,
    capaReference: existing.capa.reference,
    originalApprovedAt: existing.approvedAt,
    originalApproverRole: existing.approverRole,
    originalApproverId: existing.approverId,
    revokedAt,
    revokerId: session.user.id,
    revokerRole: session.user.role,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.capa.reference ?? existing.capa.id} approval by ${existing.approverName} (${existing.approverRole}) revoked by ${session.user.name}`;
  const provenance = await readSigningProvenance();

  try {
    const { revocationSignature } = await prisma.$transaction(
      async (tx) => {
        // 1. Mint the revocation SignedRecord (immutable; never deleted
        //    even if the underlying approval is later resigned by another
        //    user).
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "CAPA_APPROVAL_REVOCATION",
            recordId: existing.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Revoked",
            contentHash,
            contentSummary,
            passwordVerifiedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        // 2. Mark the approval revoked + link to the revocation signature.
        //    The original signatureId stays untouched — the original
        //    approval SignedRecord is preserved (Part 11 immutability).
        await tx.cAPAApproval.update({
          where: { id: approvalId },
          data: {
            revokedAt,
            revokedSignatureId: sig.id,
          },
        });
        return { revocationSignature: sig };
      },
    );

    const snapshot = {
      approverRole: existing.approverRole,
      approverName: existing.approverName,
      approverId: existing.approverId,
      approvedAt: existing.approvedAt.toISOString(),
      comment: existing.comment,
      originalSignatureId: existing.signatureId,
    };
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: APPROVAL_AUDIT_MODULE,
        action: "CAPA_APPROVAL_REVOKED",
        recordId: existing.capa.id,
        recordTitle: existing.capa.description.slice(0, 80),
        oldValue: JSON.stringify(snapshot),
        newValue: JSON.stringify({
          revocationSignatureId: revocationSignature.id,
          revokedBy: session.user.name,
        }),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_APPROVAL_REVOKED_AND_SIGNED",
        recordId: revocationSignature.id,
        recordTitle: existing.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Revoked",
          approvalId: existing.id,
          capaId: existing.capa.id,
        }),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: { revocationSignature } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    console.error("[action] revokeCAPAApproval failed:", { code, message, err });
    return {
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Failed to revoke approval"
          : `Failed to revoke approval: ${code ? `[${code}] ` : ""}${message}`,
    };
  }
}
