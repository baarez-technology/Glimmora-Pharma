import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Cached query: all findings for a tenant, newest first.
 * React cache() deduplicates within a single request.
 */
export const getFindings = cache(async (tenantId: string) => {
  return prisma.finding.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { edits: { orderBy: { editedAt: "asc" } } },
  });
});

/**
 * Cached query: single finding by ID (with tenant guard).
 */
export const getFinding = cache(async (id: string, tenantId: string) => {
  return prisma.finding.findFirst({
    where: { id, tenantId },
    include: { edits: { orderBy: { editedAt: "asc" } } },
  });
});

/**
 * Cached query: the set of finding IDs that have an uploaded evidence document
 * (a Document row with retrievable bytes). The Evidence Index uses this to
 * decide whether a finding's evidence link should resolve to the in-app
 * download route (GET /api/findings/[id]/evidence). Typed-reference evidence
 * has no Document/storageKey and so is intentionally excluded.
 */
export const getFindingEvidenceDocIds = cache(async (tenantId: string) => {
  const docs = await prisma.document.findMany({
    where: {
      tenantId,
      linkedModule: "Gap Assessment",
      storageKey: { not: null },
      deletedAt: null,
    },
    select: { linkedRecordId: true },
  });
  return [...new Set(docs.map((d) => d.linkedRecordId).filter((x): x is string => !!x))];
});

/**
 * Computed stats for the Gap Assessment page header.
 */
export const getFindingStats = cache(async (tenantId: string) => {
  const findings = await getFindings(tenantId);
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "Critical").length,
    open: findings.filter((f) => f.status !== "Closed").length,
    closed: findings.filter((f) => f.status === "Closed").length,
  };
});
