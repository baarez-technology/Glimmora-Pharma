"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { DOCUMENT_APPROVE_ROLES, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/permissions/roleSets";
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
  // Phase 6 cleanup FIX 3 — createDocument was requireAuth-only (any
  // authenticated user, incl. viewer, could create). Gate on the documents/
  // evidence author set the UI already assumes (usePermissions("evidence")
  // .canCreate = has(COMPLIANCE_AUTHOR_ROLES)). Viewer is excluded.
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit creating documents." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never authors GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
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
  if (!DOCUMENT_APPROVE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can approve documents" };
  }

  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, fileName: true, version: true },
  });
  if (!existing) return { success: false, error: "Document not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never signs GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

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
  if (!DOCUMENT_APPROVE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject documents" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never acts on GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
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

export async function deleteDocument(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never deletes GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Delete restricted to qa_head + customer_admin (app-wide GxP delete policy,
  // mirrors FDA483_DELETE_ROLES). Viewer and other roles blocked server-side.
  if (
    !DOCUMENT_APPROVE_ROLES.includes(session.user.role) &&
    !ADMIN_DELETE_ROLES.includes(session.user.role)
  ) {
    return { success: false, error: "Only a QA Head or an administrator can delete documents." };
  }
  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, fileName: true },
  });
  if (!existing) return { success: false, error: "Document not found" };
  try {
    // Soft-delete (Part 11 retention) — set the existing deletedAt/deletedBy/
    // deletionReason columns instead of destroying the row. List queries filter
    // deletedAt IS NULL, so it disappears from views but stays retained.
    await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        deletedAt: new Date(),
        deletedBy: session.user.name,
        deletionReason: reason ? reason.slice(0, 200) : null,
      },
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
        recordTitle: existing.fileName,
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDocument failed:", err);
    return { success: false, error: "Failed to delete document" };
  }
}

export async function restoreDocument(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never acts on GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (
    !DOCUMENT_APPROVE_ROLES.includes(session.user.role) &&
    !ADMIN_DELETE_ROLES.includes(session.user.role)
  ) {
    return { success: false, error: "Only a QA Head or an administrator can restore documents." };
  }
  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, fileName: true, deletedAt: true },
  });
  if (!existing) return { success: false, error: "Document not found" };
  if (!existing.deletedAt) return { success: false, error: "Document is not deleted." };
  try {
    await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedBy: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_RESTORED",
        recordId: id,
        recordTitle: existing.fileName,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreDocument failed:", err);
    return { success: false, error: "Failed to restore document" };
  }
}
