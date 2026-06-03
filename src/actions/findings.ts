"use server";

/**
 * Server Actions for Gap Assessment findings.
 *
 * Reference implementation — shows the pattern for
 * migrating from Redux dispatch + API routes to
 * Server Actions + revalidatePath.
 *
 * Each action:
 *  1. Checks auth via requireAuth()
 *  2. Validates input with Zod
 *  3. Mutates via Prisma
 *  4. Creates audit log entry
 *  5. Revalidates the page cache
 *  6. Returns result (no throw — return errors)
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { generateReference, isReferenceConflict } from "@/lib/reference";

// Shared with the create form (AddFindingModal) — keep this the single source
// of truth for the minimum requirement length so client and server never
// disagree (a mismatch made short edits fail silently).
const MIN_REQUIREMENT = 10;

// ── Schemas ──

const CreateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT, `Requirement must be at least ${MIN_REQUIREMENT} characters`),
  purpose: z.string().optional(),
  area: z.string().min(1, "Area is required"),
  framework: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Owner is required"),
  targetDate: z.string().min(1, "Target date is required"),
  siteId: z.string().optional(),
  evidenceLink: z.string().optional(),
});

const UpdateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT).optional(),
  purpose: z.string().optional(),
  area: z.string().min(1).optional(),
  severity: z.enum(["Critical", "High", "Low"]).optional(),
  status: z.enum(["Open", "In Progress", "Closed"]).optional(),
  owner: z.string().min(1).optional(),
  targetDate: z.string().optional(),
  rootCause: z.string().optional(),
  evidenceLink: z.string().optional(),
  linkedCAPAId: z.string().optional(),
  // Free-text rationale recorded alongside the edit-history diff. Not a column
  // on Finding — it lands in FindingEdit.reason.
  reason: z.string().optional(),
});

// ── Return types ──

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Actions ──

export async function createFinding(input: z.input<typeof CreateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    // Race-safe reference allocation — same pattern as createCAPA. Two
    // concurrent creates can read the same max and compute the same
    // "GAP-2026-NNN"; the second insert hits the global unique index, so we
    // retry on that specific collision and rethrow anything else.
    const MAX_RETRIES = 5;
    let finding: Awaited<ReturnType<typeof prisma.finding.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        finding = await prisma.$transaction(async (tx) => {
          const reference = await generateReference("GAP", new Date(), async (prefix, year) => {
            const row = await tx.finding.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          });
          return tx.finding.create({
            data: {
              ...parsed.data,
              reference,
              tenantId: session.user.tenantId,
              status: "Open",
              createdBy: session.user.name,
              targetDate: new Date(parsed.data.targetDate),
            },
          });
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!finding) {
      console.error("[action] createFinding exhausted reference retries:", lastErr);
      return { success: false, error: "Failed to allocate finding reference" };
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_CREATED",
        recordId: finding.id,
        recordTitle: finding.reference
          ? `${finding.reference} — ${parsed.data.requirement.slice(0, 60)}`
          : parsed.data.requirement.slice(0, 80),
        newValue: parsed.data.severity,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] createFinding failed:", err);
    return { success: false, error: "Failed to create finding" };
  }
}

// Human-readable labels + value formatting for the edit-history diff. Only
// the fields a user can actually change through the detail form are diffed.
const DIFF_FIELDS: { key: "requirement" | "purpose" | "owner" | "targetDate" | "evidenceLink" | "status"; label: string }[] = [
  { key: "requirement", label: "Requirement" },
  { key: "purpose", label: "Purpose" },
  { key: "owner", label: "Owner" },
  { key: "targetDate", label: "Target date" },
  { key: "evidenceLink", label: "Evidence link" },
  { key: "status", label: "Status" },
];

function normalizeForDiff(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "targetDate") {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(value);
}

export async function updateFinding(id: string, input: z.input<typeof UpdateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const before = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!before) return { success: false, error: "Finding not found" };

    const { reason, ...updates } = parsed.data;

    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...updates,
        ...(updates.targetDate ? { targetDate: new Date(updates.targetDate) } : {}),
      },
    });

    // Build the field-level diff for the append-only edit trail.
    const changes = DIFF_FIELDS.flatMap(({ key, label }) => {
      if (!(key in updates) || updates[key] === undefined) return [];
      const oldValue = normalizeForDiff(key, (before as Record<string, unknown>)[key]);
      const newValue = normalizeForDiff(key, (updates as Record<string, unknown>)[key]);
      if (oldValue === newValue) return [];
      return [{ field: label, oldValue, newValue }];
    });

    if (changes.length > 0) {
      await prisma.findingEdit.create({
        data: {
          findingId: id,
          tenantId: session.user.tenantId,
          editedBy: session.user.id,
          editedByName: session.user.name,
          reason: reason?.trim() || null,
          changes: JSON.stringify(changes),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_UPDATED",
        recordId: id,
        recordTitle: before.reference ?? undefined,
        newValue: changes.length > 0 ? JSON.stringify(changes) : undefined,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] updateFinding failed:", err);
    return { success: false, error: "Failed to update finding" };
  }
}

export async function deleteFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    await prisma.finding.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_DELETED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFinding failed:", err);
    return { success: false, error: "Failed to delete finding" };
  }
}

export async function closeFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "Closed" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_CLOSED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] closeFinding failed:", err);
    return { success: false, error: "Failed to close finding" };
  }
}

// ── Evidence document upload ──

const EVIDENCE_MAX_FILE_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const EVIDENCE_MAX_BYTES = EVIDENCE_MAX_FILE_MB * 1024 * 1024;
const EVIDENCE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

/**
 * Upload a document as evidence for a finding. Stores the bytes via the file
 * storage abstraction, records a Document row linked to the finding, and sets
 * the finding's evidenceLink to the stored file name so the Evidence Index
 * reflects it. Mirrors addEvidenceFile in actions/evidence.ts.
 */
export async function uploadFindingEvidence(
  findingId: string,
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  const session = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };
  if (file.size === 0) return { success: false, error: "File is empty" };
  if (file.size > EVIDENCE_MAX_BYTES) {
    return { success: false, error: `File exceeds ${EVIDENCE_MAX_FILE_MB} MB limit` };
  }
  if (!EVIDENCE_ALLOWED_MIME.has(file.type)) {
    return { success: false, error: "File type not allowed" };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, requirement: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const storageKey = `findings/${findingId}/${contentHash}-${sanitized}`;
    await fileStorage.save(storageKey, buffer, file.type);

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    await prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          tenantId: session.user.tenantId,
          fileName: sanitized,
          fileType: file.type,
          fileSize: `${sizeKb} KB`,
          version: "v1.0",
          status: "draft",
          uploadedBy: session.user.name,
          description: `Evidence for ${finding.reference ?? findingId}`,
          linkedModule: "Gap Assessment",
          linkedRecordId: findingId,
          // Persist the retrieval metadata so the Evidence Index can serve
          // the bytes back via GET /api/findings/[id]/evidence. Without
          // storageKey the uploaded file was written to disk but orphaned —
          // there was no way to read it back.
          sourceModule: "gap-assessment",
          sourceId: findingId,
          storageKey,
          sha256: contentHash,
          originalFileName: file.name,
          fileExtension: sanitized.includes(".") ? sanitized.slice(sanitized.lastIndexOf(".") + 1).toLowerCase() : null,
        },
      });
      await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: { evidenceLink: sanitized },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userName: session.user.name,
          userRole: session.user.role,
          module: "Gap Assessment",
          action: "FINDING_EVIDENCE_UPLOADED",
          recordId: findingId,
          recordTitle: finding.reference ?? undefined,
          newValue: JSON.stringify({ fileName: sanitized, fileSize: file.size, contentHash }),
        },
      });
    });

    revalidatePath("/gap-assessment");
    revalidatePath("/evidence");
    return { success: true, data: { fileName: sanitized } };
  } catch (err) {
    console.error("[action] uploadFindingEvidence failed:", err);
    return { success: false, error: "Failed to upload evidence file" };
  }
}
