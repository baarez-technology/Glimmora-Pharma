"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { assertTenantOwnsParent } from "@/lib/tenantScope";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Stage document upload constants (mirrors substage 3.2 EvidenceFile) ──
//
// Same MIME whitelist + size cap + retention floor so an inspector reading
// across the two surfaces sees one consistent file-handling policy rather
// than per-feature drift. Diverging here would force every audit checklist
// to enumerate two sets of rules.
const STAGE_DOC_MAX_FILE_MB = Number(process.env.STAGE_DOC_MAX_FILE_MB ?? "10");
const STAGE_DOC_MAX_FILE_BYTES = STAGE_DOC_MAX_FILE_MB * 1024 * 1024;
const STAGE_DOC_RETENTION_YEARS = 7;

const STAGE_DOC_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);

const STAGE_DOC_AUDIT_MODULE = "CSV / Validation";

function nowPlusYears(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

const RemoveStageDocumentSchema = z.object({
  reason: z
    .string()
    .min(10, "Deletion reason must be at least 10 characters")
    .max(2000, "Deletion reason must be 2000 characters or fewer"),
});

const CreateSystemSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  vendor: z.string().optional(),
  version: z.string().optional(),
  gxpRelevance: z.string().default("Major"),
  gamp5Category: z.string().default("4"),
  riskLevel: z.string().default("MEDIUM"),
  siteId: z.string().optional(),
  intendedUse: z.string().optional(),
  gxpScope: z.string().optional(),
  plannedActions: z.string().optional(),
  owner: z.string().optional(),
  validationStatus: z.string().optional(),
});

const STANDARD_STAGES = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"] as const;

export async function createSystem(
  input: z.input<typeof CreateSystemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateSystemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const system = await prisma.gxPSystem.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        validationStatus: "Not Started",
        createdBy: session.user.name,
      },
    });

    await prisma.validationStage.createMany({
      data: STANDARD_STAGES.map((stageName) => ({
        systemId: system.id,
        stageName,
        status: "not_started",
      })),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_CREATED",
        recordId: system.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] createSystem failed:", err);
    return { success: false, error: "Failed to create system" };
  }
}

export async function updateSystem(
  id: string,
  input: Partial<z.input<typeof CreateSystemSchema>>,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const system = await prisma.gxPSystem.update({
      where: { id, tenantId: session.user.tenantId },
      data: input,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] updateSystem failed:", err);
    return { success: false, error: "Failed to update system" };
  }
}

export async function submitStageForReview(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "in_review",
        submittedBy: session.user.name,
        submittedDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_SUBMITTED_FOR_REVIEW",
        recordId: stageId,
        newValue: stage.stageName,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] submitStageForReview failed:", err);
    return { success: false, error: "Failed to submit stage" };
  }
}

export async function approveStage(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can approve stages" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "approved",
        approvedBy: session.user.name,
        approvedDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_APPROVED",
        recordId: stageId,
        newValue: `${stage.stageName} → approved`,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] approveStage failed:", err);
    return { success: false, error: "Failed to approve stage" };
  }
}

export async function rejectStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject stages" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "rejected",
        rejectedBy: session.user.name,
        rejectionReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_REJECTED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] rejectStage failed:", err);
    return { success: false, error: "Failed to reject stage" };
  }
}

export async function deleteSystem(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.gxPSystem.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteSystem failed:", err);
    return { success: false, error: "Failed to delete system" };
  }
}

/* ══════════════════════════════════════
 * SKIP STAGE (QA Head only)
 * ══════════════════════════════════════ */

export async function skipStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can skip stages" };
  }
  if (!reason.trim()) {
    return { success: false, error: "Skip reason required" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "skipped",
        approvedBy: session.user.name,
        approvedDate: new Date(),
        rejectionReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_SKIPPED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] skipStage failed:", err);
    return { success: false, error: "Failed to skip stage" };
  }
}

/* ══════════════════════════════════════
 * UPDATE STAGE NOTES
 * ══════════════════════════════════════ */

export async function updateStageNotes(stageId: string, notes: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: { notes },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_NOTES_UPDATED",
        recordId: stageId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] updateStageNotes failed:", err);
    return { success: false, error: "Failed to update notes" };
  }
}

/* ══════════════════════════════════════
 * ROADMAP ACTIVITIES
 *
 * Schema fields: id, systemId, title, type, status,
 * startDate?, endDate?, owner?, completionType?, createdAt, updatedAt.
 * (No `activityType`, `priority`, `completedBy`, or `completedAt` columns —
 * spec assumed those; we omit them.)
 * ══════════════════════════════════════ */

const AddRoadmapActivitySchema = z.object({
  systemId: z.string().min(1),
  title: z.string().min(2),
  type: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  owner: z.string().optional(),
  completionType: z.string().optional(),
});

export async function addRoadmapActivity(
  input: z.input<typeof AddRoadmapActivitySchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddRoadmapActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // IDOR guard — verify the caller's tenant owns the parent system.
  // RoadmapActivity has no tenantId column (scopes via system.tenantId).
  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    name: string;
  }>(session, "gxpSystem", parsed.data.systemId, { name: true });
  if (!parent) return { success: false, error: "FORBIDDEN" };
  try {
    const activity = await prisma.roadmapActivity.create({
      data: {
        systemId: parsed.data.systemId,
        title: parsed.data.title,
        type: parsed.data.type,
        owner: parsed.data.owner ?? null,
        completionType: parsed.data.completionType ?? null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: "Planned",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "ROADMAP_ACTIVITY_ADDED",
        recordId: parsed.data.systemId,
        recordTitle: `${parent.name} — ${parsed.data.title}`,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] addRoadmapActivity failed:", err);
    return { success: false, error: "Failed to add activity" };
  }
}

export async function updateRoadmapActivity(id: string, status: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.roadmapActivity.findFirst({
      where: { id, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const activity = await prisma.roadmapActivity.update({
      where: { id },
      data: { status },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "ROADMAP_ACTIVITY_UPDATED",
        recordId: id,
        newValue: status,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] updateRoadmapActivity failed:", err);
    return { success: false, error: "Failed to update activity" };
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Stage document uploads (CSV/CSA validation lifecycle)
 *
 * Mirrors the substage 3.2 EvidenceFile pattern: tenant-scope check via
 * the parent stage → system → tenant chain, MIME + size whitelist,
 * SHA-256 content hash, sanitised filename, hash-prefixed storage key
 * for natural idempotence on duplicate uploads, soft-delete only (Part 11
 * §11.10(e)). Lock signal is the parent stage's `status === "approved"` —
 * once a stage is sealed, no document mutations are allowed.
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Tenant-scope guard: returns the ValidationStage joined to its System's
 * tenantId, or null if missing or owned by another tenant. super_admin
 * bypasses scope (matches the convention used elsewhere in this file).
 */
async function loadStageScoped(stageId: string) {
  const session = await requireAuth();
  const stage = await prisma.validationStage.findUnique({
    where: { id: stageId },
    include: {
      system: { select: { id: true, name: true, tenantId: true } },
    },
  });
  if (!stage) return { session, stage: null as null };
  if (
    session.user.role !== "super_admin" &&
    stage.system.tenantId !== session.user.tenantId
  ) {
    return { session, stage: null as null };
  }
  return { session, stage };
}

const STAGE_LOCKED_MESSAGE =
  "This stage is locked — documents cannot be added once approved.";

/**
 * Upload a document attached to a single ValidationStage. Accepts FormData
 * with `stageId` (string) and `file` (File). Stage must not be approved;
 * file must clear MIME + size whitelist; resulting StageDocument row is
 * paired with one audit-log entry on success.
 */
export async function addStageDocument(
  formData: FormData,
): Promise<
  ActionResult<{
    id: string;
    fileName: string;
    originalFileName: string;
    fileSize: number;
    contentHashSha256: string;
  }>
> {
  const stageId = formData.get("stageId");
  const file = formData.get("file");

  if (typeof stageId !== "string" || stageId.length === 0) {
    return { success: false, error: "Missing stageId" };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }
  if (file.size === 0) {
    return { success: false, error: "File is empty" };
  }
  if (file.size > STAGE_DOC_MAX_FILE_BYTES) {
    return {
      success: false,
      error: `File exceeds ${STAGE_DOC_MAX_FILE_MB} MB limit`,
    };
  }
  if (!STAGE_DOC_ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error:
        "Unsupported file type. Allowed: PDF, PNG, JPG, DOCX, XLSX, CSV, TXT",
    };
  }

  const { session, stage } = await loadStageScoped(stageId);
  if (!stage) return { success: false, error: "Stage not found" };
  if (stage.status === "approved") {
    return { success: false, error: STAGE_LOCKED_MESSAGE };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHashSha256 = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);

    // Hash-prefixed key so re-uploading the same bytes lands at the same
    // storage path (idempotent on disk; the DB still gets a new row so the
    // upload event itself is recorded).
    const storageKey = `stage-documents/${stage.systemId}/${stage.id}/${contentHashSha256}-${sanitized}`;
    const { url } = await fileStorage.save(storageKey, buffer, file.type);

    const created = await prisma.stageDocument.create({
      data: {
        tenantId: stage.system.tenantId,
        validationStageId: stage.id,
        fileName: sanitized,
        originalFileName: sanitized,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: url,
        contentHashSha256,
        retainUntil: nowPlusYears(STAGE_DOC_RETENTION_YEARS),
        uploadedById: session.user.id,
        uploadedByName: session.user.name,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: stage.system.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: STAGE_DOC_AUDIT_MODULE,
        action: "STAGE_DOCUMENT_UPLOADED",
        recordId: created.id,
        recordTitle: `${stage.system.name} — ${stage.stageName}`,
        newValue: JSON.stringify({
          originalFileName: sanitized,
          fileSize: file.size,
          contentHashSha256Prefix: contentHashSha256.slice(0, 16),
        }),
      },
    });

    revalidatePath("/csv-csa");
    return {
      success: true,
      data: {
        id: created.id,
        fileName: sanitized,
        originalFileName: sanitized,
        fileSize: file.size,
        contentHashSha256,
      },
    };
  } catch (err) {
    console.error("[action] addStageDocument failed:", err);
    return { success: false, error: "Failed to upload document" };
  }
}

/**
 * Soft-delete a stage document. The disk bytes are preserved (Part 11
 * Enduring) and the DB row remains queryable — only the deletedAt /
 * deletedBy / deletionReason metadata is set. Reason ≥ 10 chars required.
 * Locked stages (status = "approved") reject deletes, same as uploads.
 */
export async function removeStageDocument(
  documentId: string,
  input: z.input<typeof RemoveStageDocumentSchema>,
): Promise<ActionResult> {
  const parsed = RemoveStageDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const session = await requireAuth();
  const doc = await prisma.stageDocument.findUnique({
    where: { id: documentId },
    include: {
      validationStage: {
        include: {
          system: { select: { id: true, name: true, tenantId: true } },
        },
      },
    },
  });
  if (!doc) return { success: false, error: "Document not found" };
  if (
    session.user.role !== "super_admin" &&
    doc.validationStage.system.tenantId !== session.user.tenantId
  ) {
    return { success: false, error: "Document not found" };
  }
  if (doc.deletedAt !== null) {
    return { success: false, error: "Document is already removed" };
  }
  if (doc.validationStage.status === "approved") {
    return { success: false, error: STAGE_LOCKED_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.stageDocument.update({
        where: { id: documentId },
        data: {
          deletedAt: new Date(),
          deletedById: session.user.id,
          deletedByName: session.user.name,
          deletionReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: doc.validationStage.system.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          module: STAGE_DOC_AUDIT_MODULE,
          action: "STAGE_DOCUMENT_SOFT_DELETED",
          recordId: documentId,
          recordTitle: `${doc.validationStage.system.name} — ${doc.validationStage.stageName}`,
          oldValue: JSON.stringify({
            originalFileName: doc.originalFileName,
            fileSize: doc.fileSize,
          }),
          newValue: JSON.stringify({
            deletionReason: parsed.data.reason,
          }),
        },
      });
    });

    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeStageDocument failed:", err);
    return { success: false, error: "Failed to remove document" };
  }
}
