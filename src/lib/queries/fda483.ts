import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Audit-trail rows scoped to a single FDA 483 event (and its child
 * observations + commitments + documents). Used by the AuditTab on the
 * event detail page.
 *
 * Filter strategy: `recordId` is set to the event id for event-level
 * actions but to the child id for OBSERVATION_UPDATED / DELETED,
 * COMMITMENT_UPDATED / DELETED, RESPONSE_DOCUMENT_* etc. We expand the
 * filter to cover every child id we already know about so the tab
 * surfaces the full timeline.
 */
export const getFDA483EventAuditLogs = cache(
  async (tenantId: string, eventId: string, limit = 50) => {
    // Resolve child ids up-front so the AuditLog query can union them
    // into the recordId filter.
    const event = await prisma.fDA483Event.findFirst({
      where: { id: eventId, tenantId },
      select: {
        id: true,
        observations: { select: { id: true } },
        commitments: { select: { id: true } },
        documents: { select: { id: true } },
      },
    });
    if (!event) return [];
    const ids = [
      event.id,
      ...event.observations.map((o) => o.id),
      ...event.commitments.map((c) => c.id),
      ...event.documents.map((d) => d.id),
    ];
    return prisma.auditLog.findMany({
      where: {
        tenantId,
        module: "FDA 483",
        recordId: { in: ids },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
);

export const getFDA483Events = cache(async (tenantId: string) => {
  return prisma.fDA483Event.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      observations: { orderBy: { number: "asc" } },
      // First-class commitments — surface source linkage (observation/CAPA),
      // who completed it, and evidence docs for the upgraded card.
      commitments: {
        orderBy: { createdAt: "asc" },
        include: {
          observation: { select: { id: true, number: true, reference: true } },
          capa: { select: { id: true, reference: true } },
          completedByUser: { select: { id: true, name: true } },
          documents: { orderBy: { uploadedAt: "asc" } },
        },
      },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });
});

export const getFDA483Event = cache(async (id: string, tenantId: string) => {
  return prisma.fDA483Event.findFirst({
    where: { id, tenantId },
    include: {
      observations: { orderBy: { number: "asc" } },
      // First-class commitments — surface source linkage (observation/CAPA),
      // who completed it, and evidence docs for the upgraded card.
      commitments: {
        orderBy: { createdAt: "asc" },
        include: {
          observation: { select: { id: true, number: true, reference: true } },
          capa: { select: { id: true, reference: true } },
          completedByUser: { select: { id: true, name: true } },
          documents: { orderBy: { uploadedAt: "asc" } },
        },
      },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });
});

/**
 * Headline stats for the FDA 483 module KPI cards.
 *
 * Status values match the slice + server-action conventions
 * (PascalCase with spaces): "Open", "Under Investigation",
 * "Response Submitted", "Closed", "Warning Letter", etc.
 */
export const getFDA483Stats = cache(async (tenantId: string) => {
  const events = await getFDA483Events(tenantId);
  const now = Date.now();

  const isOpen = (s: string) => s === "Open" || s === "Under Investigation" || s === "Response Due" || s === "Response Drafted" || s === "Pending QA Sign-off";
  const isSubmittedOrClosed = (s: string) => s === "Response Submitted" || s === "FDA Acknowledged" || s === "Closed";

  return {
    total: events.length,
    open: events.filter((e) => isOpen(e.status)).length,
    responseDue: events.filter(
      (e) =>
        !isSubmittedOrClosed(e.status) &&
        new Date(e.responseDeadline).getTime() > now,
    ).length,
    overdue: events.filter(
      (e) =>
        !isSubmittedOrClosed(e.status) &&
        new Date(e.responseDeadline).getTime() < now,
    ).length,
    closed: events.filter((e) => e.status === "Closed").length,
    warningLetter: events.filter((e) => e.status === "Warning Letter").length,
    totalObservations: events.reduce((sum, e) => sum + e.observations.length, 0),
  };
});
