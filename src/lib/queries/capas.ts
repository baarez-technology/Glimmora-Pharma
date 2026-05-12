import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getCAPAs = cache(async (tenantId: string) => {
  return prisma.cAPA.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { documents: true },
  });
});

/**
 * Substage 5.2 — list every approval row recorded against a CAPA, oldest
 * first (chronological order matches how the Approvals section renders
 * the progress list). Tenant-scoped via the explicit `tenantId` filter
 * AND the implicit parent-CAPA-tenant guarantee.
 */
export const getCAPAApprovals = cache(
  async (tenantId: string, capaId: string) => {
    // revokedAt filter — soft-revoked approvals stay in the table for
    // audit traceability but are hidden from the active approval list
    // (the UI's "Awaiting approvals (n/total)" badge only counts live
    // signatures). Revocation history lives in the SignedRecord ledger
    // + AuditLog and isn't surfaced in the active panel.
    return prisma.cAPAApproval.findMany({
      where: { tenantId, capaId, revokedAt: null },
      orderBy: { approvedAt: "asc" },
    });
  },
);

/**
 * Substage 5.2 §5.3 — flat list of all comments on a CAPA, including
 * soft-deleted rows so the UI can render "[deleted]" placeholders without
 * losing reply chains. The tree structure (parent / replies) is derived
 * client-side from `parentId` — a flat list keeps the cache deterministic
 * and the server query simple. Order: createdAt ascending so the UI can
 * reconstruct deterministic threads.
 */
export const getCAPAComments = cache(
  async (tenantId: string, capaId: string) => {
    return prisma.cAPAComment.findMany({
      where: { tenantId, capaId },
      orderBy: { createdAt: "asc" },
    });
  },
);

export const getCAPA = cache(async (id: string, tenantId: string) => {
  return prisma.cAPA.findFirst({
    where: { id, tenantId },
    include: { documents: true, finding: true },
  });
});

export const getCAPAStats = cache(async (tenantId: string) => {
  const capas = await getCAPAs(tenantId);
  const now = new Date();
  return {
    total: capas.length,
    open: capas.filter((c) => c.status !== "closed").length,
    overdue: capas.filter((c) => (c.status === "open" || c.status === "in_progress") && c.dueDate && c.dueDate < now).length,
    closed: capas.filter((c) => c.status === "closed").length,
  };
});
