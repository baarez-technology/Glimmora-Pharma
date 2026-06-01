"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import {
  canonicalizeDocumentApprovalContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const ApproveDocumentSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

const CreateDocumentSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().optional(),
  fileSize: z.string().optional(),
  description: z.string().optional(),
  linkedModule: z.string().optional(),
  linkedRecordId: z.string().optional(),
});

export async function createDocument(
  input: z.input<typeof CreateDocumentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const doc = await prisma.document.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        version: "v1.0",
        status: "draft",
        uploadedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_UPLOADED",
        recordId: doc.id,
        recordTitle: parsed.data.fileName,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] createDocument failed:", err);
    return { success: false, error: "Failed to upload document" };
  }
}

export async function approveDocument(
  id: string,
  input: z.input<typeof ApproveDocumentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ApproveDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can approve documents" };
  }

  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, fileName: true, version: true },
  });
  if (!existing) return { success: false, error: "Document not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing.
  const passwordOk = await verifyPasswordForSigning(
    session.user.id,
    parsed.data.password,
  );
  if (!passwordOk) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "SIGNING_PASSWORD_FAILED",
        recordId: id,
        recordTitle: existing.fileName,
        newValue: JSON.stringify({
          recordType: "DOCUMENT_APPROVAL",
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
    const approvedAt = new Date();
    const canonicalContent = canonicalizeDocumentApprovalContent({
      docId: existing.id,
      title: existing.fileName,
      version: existing.version,
      approvedAt,
      approverId: session.user.id,
      approverRole: session.user.role,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `Document ${existing.fileName} v${existing.version} approved by ${session.user.name} (${session.user.role})`;
    const provenance = await readSigningProvenance();

    const { doc, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "DOCUMENT_APPROVAL",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: "Approved",
          contentHash,
          contentSummary,
          passwordVerifiedAt: approvedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.document.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          status: "approved",
          approvedBy: session.user.name,
          approvedAt,
          approvalSignatureId: sig.id,
        },
      });
      return { doc: updated, signedRecord: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_APPROVED",
        recordId: id,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "DOCUMENT_APPROVAL_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.fileName,
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Approved",
          docId: existing.id,
          version: existing.version,
        }),
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] approveDocument failed:", err);
    return { success: false, error: "Failed to approve document" };
  }
}

export async function rejectDocument(id: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject documents" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    // Schema has no rejectedBy/rejectionReason — store reason in description
    // and flip status; full audit trail captures the rejection event.
    const doc = await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "rejected" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_REJECTED",
        recordId: id,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] rejectDocument failed:", err);
    return { success: false, error: "Failed to reject document" };
  }
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.document.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDocument failed:", err);
    return { success: false, error: "Failed to delete document" };
  }
}
