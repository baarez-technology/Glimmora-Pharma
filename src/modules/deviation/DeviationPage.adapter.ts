import type { Deviation as PrismaDeviation } from "@prisma/client";
import type { Deviation, DeviationStatus, DeviationSeverity, ImpactLevel } from "@/store/deviation.slice";

/** Prisma Deviation plus the optional `sourcedCAPA` relation selected by
 *  getDeviations (carries the linked CAPA's reference for display). */
export type PrismaDeviationWithCapa = PrismaDeviation & {
  sourcedCAPA?: { id: string; reference: string | null } | null;
};

/* ── Adapt Prisma Deviation → slice Deviation shape ── */
export function adaptDeviation(p: PrismaDeviationWithCapa): Deviation {
  return {
    id: p.id,
    reference: p.reference ?? undefined,
    tenantId: p.tenantId,
    siteId: p.siteId ?? "",
    title: p.title,
    description: p.description,
    type: p.type as Deviation["type"],
    category: p.category as Deviation["category"],
    severity: p.severity as DeviationSeverity,
    area: p.area,
    detectedBy: p.detectedBy,
    detectedDate: p.detectedDate.toISOString(),
    reportedBy: p.detectedBy,
    reportedDate: p.detectedDate.toISOString(),
    owner: p.owner,
    dueDate: p.dueDate ? p.dueDate.toISOString() : "",
    status: p.status as DeviationStatus,
    immediateAction: p.immediateAction ?? "",
    rootCause: p.rootCause ?? undefined,
    rcaMethod: (p.rcaMethod ?? undefined) as Deviation["rcaMethod"],
    createdById: p.createdById ?? undefined,
    // Tier 2 — investigation + CAPA decision (Dates → ISO strings).
    rcaData: p.rcaData ?? undefined,
    investigationCompletedAt: p.investigationCompletedAt
      ? p.investigationCompletedAt.toISOString()
      : undefined,
    investigationCompletedById: p.investigationCompletedById ?? undefined,
    capaDecisionMade: p.capaDecisionMade,
    capaDecisionRequired: p.capaDecisionRequired ?? undefined,
    capaDecisionReason: p.capaDecisionReason ?? undefined,
    capaDecisionAt: p.capaDecisionAt ? p.capaDecisionAt.toISOString() : undefined,
    capaDecisionById: p.capaDecisionById ?? undefined,
    patientSafetyImpact: (p.patientSafetyImpact ?? "none") as ImpactLevel,
    productQualityImpact: (p.productQualityImpact ?? "none") as ImpactLevel,
    regulatoryImpact: (p.regulatoryImpact ?? "none") as ImpactLevel,
    batchesAffected: p.batchesAffected
      ? p.batchesAffected.split(",").map((b) => b.trim()).filter(Boolean)
      : undefined,
    linkedCAPAId: p.linkedCAPAId ?? undefined,
    linkedCAPARef: p.sourcedCAPA?.reference ?? undefined,
    documents: [],
    closedBy: p.closedBy ?? undefined,
    closedDate: p.closedDate ? p.closedDate.toISOString() : undefined,
    closureNotes: p.closureNotes ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
