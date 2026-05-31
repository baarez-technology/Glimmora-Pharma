import { cache } from "react";
import { prisma } from "@/lib/prisma";

// SME Section 1, Stage 2 (FULL) — include shape for the bidirectional
// CAPA↔Deviation link. Reused by both list and detail queries so the
// Redux mapper sees the same shape regardless of which path hydrated
// the row. Only the small set of columns the "Linked deviation" panel
// renders are fetched; full deviation row is one extra query away when
// needed.
const DEVIATION_INCLUDE = {
  select: {
    id: true,
    title: true,
    severity: true,
    status: true,
    createdAt: true,
  },
} as const;

// SME Section 1, Stage 4 (FULL) — order by sequence so the Redux CAPA
// always renders action items in the right order without per-render
// sorting. Includes every column the new ActionItemsSection table needs.
const ACTION_ITEMS_INCLUDE = {
  orderBy: { sequence: "asc" },
} as const;

export const getCAPAs = cache(async (tenantId: string) => {
  return prisma.cAPA.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { documents: true, deviation: DEVIATION_INCLUDE, actionItems: ACTION_ITEMS_INCLUDE },
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
    include: {
      documents: true,
      finding: true,
      deviation: DEVIATION_INCLUDE,
      actionItems: ACTION_ITEMS_INCLUDE,
    },
  });
});

/**
 * SME Section 1, Stage 6 (FULL) — suggested-recurrence query.
 *
 * Returns up to 10 closed CAPAs in the same tenant + (optional) same
 * site whose closure date is within the lookback window (default 90
 * days). Used by the Deviation / Finding creation modals to offer
 * "possible recurrence" candidates; user confirms by selecting one and
 * the creation action persists previousCAPAId.
 *
 * Filters:
 *  - tenantId match (mandatory)
 *  - status === "closed"
 *  - siteId match (when supplied)
 *  - closedAt within last windowDays days
 *  - excludes CAPAs already known to be ineffective — the recurrence
 *    conversation is different for those (the team should look at the
 *    fresh root cause, not re-confirm the prior CAPA's failure)
 * Ordered by closedAt desc; limited to 10 rows.
 */
export const getSuggestedRecurrenceMatches = cache(
  async (params: {
    tenantId: string;
    siteId?: string;
    windowDays?: number;
  }) => {
    const windowDays = params.windowDays ?? 90;
    const earliest = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    return prisma.cAPA.findMany({
      where: {
        tenantId: params.tenantId,
        status: "closed",
        closedAt: { gte: earliest },
        ...(params.siteId ? { siteId: params.siteId } : {}),
        NOT: { effectivenessVerdict: "ineffective" },
      },
      orderBy: { closedAt: "desc" },
      take: 10,
      select: {
        id: true,
        reference: true,
        description: true,
        closedAt: true,
        dueDate: true,
        effectivenessDate: true,
        siteId: true,
        risk: true,
      },
    });
  },
);

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
