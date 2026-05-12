"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  canonicalizeDeviationClosureContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CloseDeviationSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
  notes: z.string().max(2000).optional(),
});

const CreateDeviationSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(["critical", "major", "minor"]),
  area: z.string().min(1),
  immediateAction: z.string().min(5),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  owner: z.string().min(1),
  dueDate: z.string().min(1),
  detectedDate: z.string().optional(),
  siteId: z.string().optional(),
  batchesAffected: z.string().optional(),
});

const UpdateDeviationSchema = CreateDeviationSchema.partial().extend({
  status: z.string().optional(),
  rootCause: z.string().optional(),
  rcaMethod: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5),
});

export async function createDeviation(
  input: z.input<typeof CreateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const deviation = await prisma.deviation.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        category: parsed.data.category,
        severity: parsed.data.severity,
        area: parsed.data.area,
        immediateAction: parsed.data.immediateAction,
        patientSafetyImpact: parsed.data.patientSafetyImpact,
        productQualityImpact: parsed.data.productQualityImpact,
        regulatoryImpact: parsed.data.regulatoryImpact,
        owner: parsed.data.owner,
        siteId: parsed.data.siteId ?? null,
        batchesAffected: parsed.data.batchesAffected ?? null,
        tenantId: session.user.tenantId,
        status: "open",
        detectedBy: session.user.name,
        detectedDate: parsed.data.detectedDate ? new Date(parsed.data.detectedDate) : new Date(),
        dueDate: new Date(parsed.data.dueDate),
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_CREATED",
        recordId: deviation.id,
        recordTitle: parsed.data.title,
        newValue: parsed.data.severity,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] createDeviation failed:", err);
    return { success: false, error: "Failed to create deviation" };
  }
}

export async function updateDeviation(
  id: string,
  input: z.input<typeof UpdateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const { dueDate, detectedDate, ...rest } = parsed.data;
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(detectedDate ? { detectedDate: new Date(detectedDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] updateDeviation failed:", err);
    return { success: false, error: "Failed to update deviation" };
  }
}

export async function closeDeviation(
  id: string,
  input: z.input<typeof CloseDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CloseDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can close deviations" };
  }

  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      title: true,
      severity: true,
      rootCause: true,
    },
  });
  if (!existing) return { success: false, error: "Deviation not found" };

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing.
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
        recordTitle: existing.title.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "DEVIATION_CLOSURE",
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
    const closedAt = new Date();
    const canonicalContent = canonicalizeDeviationClosureContent({
      deviationId: existing.id,
      title: existing.title,
      severity: existing.severity,
      rootCause: existing.rootCause,
      closingComment: parsed.data.notes ?? null,
      closedAt,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `Deviation ${existing.id.slice(0, 8)} (${existing.severity}) closed by ${session.user.name} (${session.user.role})`;
    const provenance = await readSigningProvenance();

    const { deviation, signedRecord } = await prisma.$transaction(
      async (tx) => {
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "DEVIATION_CLOSURE",
            recordId: existing.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Closed",
            contentHash,
            contentSummary,
            passwordVerifiedAt: closedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        const updated = await tx.deviation.update({
          where: { id, tenantId: session.user.tenantId },
          data: {
            status: "closed",
            closedBy: session.user.name,
            closedDate: closedAt,
            closureNotes: parsed.data.notes ?? null,
            closureSignatureId: sig.id,
          },
        });
        return { deviation: updated, signedRecord: sig };
      },
    );

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_CLOSED",
        recordId: id,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: SIGNING_AUDIT_MODULE,
        action: "DEVIATION_CLOSED_AND_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.title.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Closed",
          deviationId: existing.id,
        }),
      },
    });
    revalidatePath("/deviation");
    revalidatePath("/");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] closeDeviation failed:", err);
    return { success: false, error: "Failed to close deviation" };
  }
}

export async function rejectDeviation(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject deviations" };
  }
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Rejection reason must be at least 5 characters" };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "rejected" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_REJECTED",
        recordId: id,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] rejectDeviation failed:", err);
    return { success: false, error: "Failed to reject deviation" };
  }
}

export async function deleteDeviation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.deviation.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDeviation failed:", err);
    return { success: false, error: "Failed to delete deviation" };
  }
}
