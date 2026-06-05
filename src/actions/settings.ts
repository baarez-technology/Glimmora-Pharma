"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { BCRYPT_COST } from "@/lib/passwords";
import { sanitizeServerError } from "@/lib/errors";
import { assertCanAddUser, assertCanAddSite, type CapBlockCode } from "@/lib/planCaps";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateSiteSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional(),
  gmpScope: z.string().optional(),
  risk: z.string().default("MEDIUM"),
});

const UpdateSiteSchema = CreateSiteSchema.partial().extend({
  // Site row.status in the Redux model maps to Prisma Site.isActive.
  // Settings UI sends "Active"/"Inactive"; the tab adapter converts to boolean.
  isActive: z.boolean().optional(),
});

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(2),
  role: z.string().min(1),
  siteId: z.string().optional(),
  password: z.string().min(6),
  gxpSignatory: z.boolean().default(false),
});

const UpdateUserSchema = CreateUserSchema.partial().extend({
  password: z.string().min(6).optional(),
  // Status toggle (Active/Inactive) maps to Prisma User.isActive.
  isActive: z.boolean().optional(),
});

function isAdmin(role: string): boolean {
  return role === "customer_admin" || role === "super_admin";
}

export async function createSite(
  input: z.input<typeof CreateSiteSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can create sites" };
  }
  const parsed = CreateSiteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // Hard cap enforcement (Phase 1) — blocks creation past plan.maxSites, and on
  // no-plan / expired-plan. Runs AFTER the role gate; never a bypass. For
  // super_admin this is the platform tenant (no plan) → NO_PLAN_ASSIGNED.
  const cap = await assertCanAddSite(session.user.tenantId);
  if (!cap.ok) {
    const code: CapBlockCode = cap.code ?? "SITE_CAP_EXCEEDED";
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_CREATE_BLOCKED",
        recordTitle: parsed.data.name,
        newValue: code,
      },
    });
    return { success: false, error: code };
  }
  try {
    const site = await prisma.site.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_CREATED",
        recordId: site.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: site };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "A site with this name already exists" };
    }
    console.error("[action] createSite failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create site") };
  }
}

export async function updateSite(
  id: string,
  input: z.input<typeof UpdateSiteSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const parsed = UpdateSiteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (session.user.role !== "super_admin") {
    const owned = await prisma.site.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const site = await prisma.site.update({
      where: { id },
      data: parsed.data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_UPDATED",
        recordId: id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: site };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "A site with this name already exists" };
    }
    console.error("[action] updateSite failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update site") };
  }
}

export async function deleteSite(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.site.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.site.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteSite failed:", err);
    return { success: false, error: "Failed to delete site" };
  }
}

export async function createUser(
  input: z.input<typeof CreateUserSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can create users" };
  }
  const parsed = CreateUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // Hard cap enforcement (Phase 1) — blocks creation past plan.maxUsers, and on
  // no-plan / expired-plan. Runs AFTER the role gate; never a bypass. For
  // super_admin this is the platform tenant (no plan) → NO_PLAN_ASSIGNED.
  const cap = await assertCanAddUser(session.user.tenantId);
  if (!cap.ok) {
    const code: CapBlockCode = cap.code ?? "PLAN_CAP_EXCEEDED";
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_CREATE_BLOCKED",
        recordTitle: parsed.data.name,
        newValue: code,
      },
    });
    return { success: false, error: code };
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        username: parsed.data.username,
        role: parsed.data.role,
        siteId: parsed.data.siteId ?? null,
        gxpSignatory: parsed.data.gxpSignatory,
        tenantId: session.user.tenantId,
        passwordHash,
        isActive: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_CREATED",
        recordId: user.id,
        recordTitle: parsed.data.name,
        newValue: parsed.data.role,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: user };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "Email or username already exists" };
    }
    console.error("[action] createUser failed:", err);
    return { success: false, error: "Failed to create user" };
  }
}

/**
 * Server-side cap pre-check for the Settings → Users "Add user" flow.
 *
 * The Settings UsersTab provisions users through the AI backend + Redux (it
 * does not call createUser), so this lets that flow enforce the SAME hard cap
 * server-side before it proceeds — a disabled button alone is not enforcement.
 * Records a USER_CREATE_BLOCKED audit on a block. Returns the cap block code as
 * `error` (the UI maps it through errorCodeLabel).
 */
export async function checkUserCap(): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const cap = await assertCanAddUser(session.user.tenantId);
  if (cap.ok) return { success: true, data: null };
  const code: CapBlockCode = cap.code ?? "PLAN_CAP_EXCEEDED";
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Settings",
      action: "USER_CREATE_BLOCKED",
      newValue: code,
    },
  });
  return { success: false, error: code };
}

export async function updateUser(
  id: string,
  input: z.input<typeof UpdateUserSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const parsed = UpdateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  // High-value: blocks customer_admin of tenant A from mutating users in tenant B.
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const user = await prisma.user.update({
      where: { id },
      data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: user };
  } catch (err) {
    console.error("[action] updateUser failed:", err);
    return { success: false, error: "Failed to update user" };
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.user.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteUser failed:", err);
    return { success: false, error: "Failed to delete user" };
  }
}
