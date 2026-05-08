import type { Deviation as PrismaDeviation } from "@prisma/client";
import type { Deviation, DeviationStatus, DeviationSeverity, ImpactLevel } from "@/store/deviation.slice";

/* ── Adapt Prisma Deviation → slice Deviation shape ── */
export function adaptDeviation(p: PrismaDeviation): Deviation {
  return {
    id: p.id,
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
    patientSafetyImpact: (p.patientSafetyImpact ?? "none") as ImpactLevel,
    productQualityImpact: (p.productQualityImpact ?? "none") as ImpactLevel,
    regulatoryImpact: (p.regulatoryImpact ?? "none") as ImpactLevel,
    batchesAffected: p.batchesAffected
      ? p.batchesAffected.split(",").map((b) => b.trim()).filter(Boolean)
      : undefined,
    linkedCAPAId: p.linkedCAPAId ?? undefined,
    documents: [],
    closedBy: p.closedBy ?? undefined,
    closedDate: p.closedDate ? p.closedDate.toISOString() : undefined,
    closureNotes: p.closureNotes ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
