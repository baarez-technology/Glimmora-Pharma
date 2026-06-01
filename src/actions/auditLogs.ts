"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function logAuditAction(input: {
  module: string;
  action: string;
  recordId?: string;
  recordTitle?: string;
  oldValue?: string;
  newValue?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const log = await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: input.module,
        action: input.action,
        recordId: input.recordId ?? null,
        recordTitle: input.recordTitle ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
      },
    });
    return { success: true, data: log };
  } catch (err) {
    console.error("[action] logAuditAction failed:", err);
    return { success: false, error: "Failed to log action" };
  }
}

