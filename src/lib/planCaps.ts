import { prisma } from "@/lib/prisma";

/**
 * Server-side plan-cap enforcement (Phase 1 exit gate).
 *
 * Caps are stored frozen on the tenant's plan (Plan.maxUsers / Plan.maxSites,
 * see src/lib/plans.ts). These helpers HARD-block creation past the cap; the
 * UI's >=80% amber treatment is a separate soft cue and is not relied upon
 * here. Counts are of ACTIVE rows only — a deactivated (isActive=false) user
 * or site is the app's soft-delete equivalent and does NOT occupy a seat.
 */

export type CapBlockCode = "NO_PLAN_ASSIGNED" | "PLAN_EXPIRED" | "PLAN_CAP_EXCEEDED" | "SITE_CAP_EXCEEDED";

export interface CapResult {
  ok: boolean;
  /** Set when ok === false. Maps to src/lib/labels/errorCodes.ts. */
  code?: CapBlockCode;
}

/** The tenant's assigned plan, or null. */
export function resolveTenantPlan(tenantId: string) {
  return prisma.plan.findUnique({ where: { tenantId } });
}

/** Plan must exist and not be past its expiry date. */
async function loadUsablePlan(tenantId: string): Promise<{ plan: Awaited<ReturnType<typeof resolveTenantPlan>>; code?: CapBlockCode }> {
  const plan = await resolveTenantPlan(tenantId);
  if (!plan) return { plan: null, code: "NO_PLAN_ASSIGNED" };
  // Past expiry → blocked (mirrors the login / AppShell plan gate).
  if (new Date(plan.expiryDate).getTime() < Date.now()) return { plan, code: "PLAN_EXPIRED" };
  return { plan };
}

/**
 * Hard cap check for adding a USER. Counts ACTIVE users only (isActive=true),
 * so deactivated users free their seat. Returns { ok:true } or the block code.
 */
export async function assertCanAddUser(tenantId: string): Promise<CapResult> {
  const { plan, code } = await loadUsablePlan(tenantId);
  if (!plan || code) return { ok: false, code: code ?? "NO_PLAN_ASSIGNED" };
  const activeUsers = await prisma.user.count({ where: { tenantId, isActive: true } });
  if (activeUsers >= plan.maxUsers) return { ok: false, code: "PLAN_CAP_EXCEEDED" };
  return { ok: true };
}

/**
 * Hard cap check for adding a SITE. Counts ACTIVE sites only (isActive=true).
 */
export async function assertCanAddSite(tenantId: string): Promise<CapResult> {
  const { plan, code } = await loadUsablePlan(tenantId);
  if (!plan || code) return { ok: false, code: code ?? "NO_PLAN_ASSIGNED" };
  const activeSites = await prisma.site.count({ where: { tenantId, isActive: true } });
  if (activeSites >= plan.maxSites) return { ok: false, code: "SITE_CAP_EXCEEDED" };
  return { ok: true };
}
