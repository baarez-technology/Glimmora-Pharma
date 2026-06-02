"use server";

/**
 * Server Actions for Gap Assessment findings.
 *
 * Reference implementation â€” shows the pattern for
 * migrating from Redux dispatch + API routes to
 * Server Actions + revalidatePath.
 *
 * Each action:
 *  1. Checks auth via requireAuth()
 *  2. Validates input with Zod
 *  3. Mutates via Prisma
 *  4. Creates audit log entry
 *  5. Revalidates the page cache
 *  6. Returns result (no throw â€” return errors)
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/auth";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import { sanitizeServerError } from "@/lib/errors";

// â”€â”€ Schemas â”€â”€

const CreateFindingSchema = z.object({
  requirement: z.string().min(10, "Requirement must be at least 10 characters"),
  area: z.string().min(1, "Area is required"),
  framework: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Owner is required"),
  targetDate: z.string().min(1, "Target date is required"),
  siteId: z.string().optional(),
  evidenceLink: z.string().optional(),
  // SME Section 1, Stage 6 (FULL) â€” optional recurrence link, same
  // semantic as Deviation.previousCAPAId.
  previousCAPAId: z.string().optional(),
});

const UpdateFindingSchema = z.object({
  requirement: z.string().min(10).optional(),
  area: z.string().min(1).optional(),
  severity: z.enum(["Critical", "High", "Low"]).optional(),
  status: z.enum(["Open", "In Progress", "Closed"]).optional(),
  owner: z.string().min(1).optional(),
  targetDate: z.string().optional(),
  rootCause: z.string().optional(),
  evidenceLink: z.string().optional(),
  linkedCAPAId: z.string().optional(),
});

// â”€â”€ Return types â”€â”€

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// â”€â”€ Actions â”€â”€

export async function createFinding(input: z.input<typeof CreateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // SME Section 1, Stage 6 (FULL) â€” validate the optional recurrence
  // link before persisting. Same pattern as createDeviation.
  let priorCAPAStatus: string | null = null;
  if (parsed.data.previousCAPAId) {
    const prior = await prisma.cAPA.findFirst({
      where: { id: parsed.data.previousCAPAId, tenantId: session.user.tenantId },
      select: { id: true, status: true },
    });
    if (!prior) {
      return {
        success: false,
        error: "Cited recurrence CAPA not found in your tenant.",
      };
    }
    priorCAPAStatus = prior.status;
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }

  // SME final rung â€” site-scoped reference allocation. Same retry-on-
  // P2002 shape as createDeviation / createCAPA.
  let siteCodeForRef: string | null = null;
  if (parsed.data.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: parsed.data.siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("FND", siteCodeForRef);

  const MAX_REF_RETRIES = 5;
  let finding: Awaited<ReturnType<typeof prisma.finding.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      finding = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.finding.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        return tx.finding.create({
          data: {
            ...parsed.data,
            reference,
            tenantId: session.user.tenantId,
            // RUNG 3H — canonical Title Case (matches the schema default, the
            // updateFinding enum, the FindingStatus type, and all read sites).
            status: "Open",
            createdBy: session.user.name,
            targetDate: new Date(parsed.data.targetDate),
          },
        });
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!finding) {
    console.error("[action] createFinding exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate finding reference") };
  }

  try {

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_CREATED",
        recordId: finding.id,
        recordTitle: parsed.data.requirement.slice(0, 80),
        newValue: parsed.data.severity,
      },
    });
    if (parsed.data.previousCAPAId) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_LINKED_TO_PRIOR_CAPA_AS_RECURRENCE",
          recordId: finding.id,
          recordTitle: parsed.data.requirement.slice(0, 80),
          newValue: JSON.stringify({
            previousCAPAId: parsed.data.previousCAPAId,
            priorCAPAStatus,
            atCreation: true,
          }),
        },
      });
    }

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] createFinding failed:", err);
    return { success: false, error: "Failed to create finding" };
  }
}

export async function updateFinding(id: string, input: z.input<typeof UpdateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.targetDate ? { targetDate: new Date(parsed.data.targetDate) } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_UPDATED",
        recordId: id,
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
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Rung 3J.1 — destructive delete is admin-tier (mirrors SYSTEM_DELETE_ROLES),
  // narrower than the COMPLIANCE_AUTHOR_ROLES that gate create/update/close.
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can delete a finding." };
  }

  try {
    await prisma.finding.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
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
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }

  try {
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "Closed" }, // RUNG 3H — canonical Title Case
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
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
