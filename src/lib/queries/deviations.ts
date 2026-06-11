import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getDeviations = cache(async (tenantId: string) => {
  return prisma.deviation.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    // Include the linked CAPA's human-readable reference so the list +
    // detail views can render "CAPA-…" instead of the raw cuid.
    include: { sourcedCAPA: { select: { id: true, reference: true } } },
  });
});

export const getDeviation = cache(async (id: string, tenantId: string) => {
  return prisma.deviation.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
});

