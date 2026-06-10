import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCAPAReadiness, type ReadinessCondition } from "@/lib/capa-readiness";

/**
 * Phase 5 — the Worklist data loader (read-only). Returns the action items
 * assigned to the user PLUS the CAPAs they drive (ownerId), so a driver with
 * no personally-assigned items still sees their CAPA group. All writes happen
 * through the existing Phase-3/4/5 owner/driver server paths; this only reads.
 *
 * Serialised (Dates → ISO) so it can cross the server→client boundary directly.
 */

export interface WorklistItem {
  id: string;
  capaId: string;
  sequence: number;
  description: string;
  owner: string;
  ownerId: string | null;
  dueDate: string;
  status: string;
  completionNotes: string | null;
  reworkReason: string | null;
  reworkRequestedAt: string | null;
}

export interface WorklistEvidenceCategory {
  id: string;
  category: string;
  status: string;
}

export interface WorklistGroup {
  capa: {
    id: string;
    reference: string | null;
    title: string;
    status: string;
    dueDate: string | null;
    risk: string;
    isDriver: boolean;
  };
  items: WorklistItem[];
  /** Driver-only: readiness summary (consumes the shared getCAPAReadiness). */
  readiness: { metCount: number; total: number; allMet: boolean; conditions: ReadinessCondition[] } | null;
  /** Driver-only: unanswered evidence categories (PENDING / IN_PROGRESS). */
  unansweredEvidence: WorklistEvidenceCategory[] | null;
  /** Driver-only: true when no evidence rows exist yet (needs init). */
  evidenceNeedsInit: boolean;
}

export interface Worklist {
  groups: WorklistGroup[];
  openCount: number;
  reworkCount: number;
  nextDue: string | null;
}

const ACTIVE_STATUSES = ["open", "in_progress", "pending_qa_review", "pending_verification"];
const OPEN_ITEM_STATUSES = new Set(["pending", "in_progress", "rework"]);

export const getWorklist = cache(async (userId: string, tenantId: string): Promise<Worklist> => {
  const [items, drivenCapas] = await Promise.all([
    prisma.cAPAActionItem.findMany({
      // Exclude soft-deleted items and items whose parent CAPA was soft-deleted.
      where: { ownerId: userId, tenantId, deletedAt: null, capa: { deletedAt: null } },
      orderBy: { dueDate: "asc" },
      include: {
        capa: {
          select: {
            id: true, reference: true, description: true, status: true,
            dueDate: true, risk: true, ownerId: true,
          },
        },
      },
    }),
    prisma.cAPA.findMany({
      where: { tenantId, ownerId: userId, status: { in: ACTIVE_STATUSES }, deletedAt: null },
      select: { id: true, reference: true, description: true, status: true, dueDate: true, risk: true, ownerId: true },
    }),
  ]);

  // Build the group set: every CAPA the user has items in, plus every CAPA the
  // user drives (even with zero assigned items).
  const groupCapas = new Map<string, (typeof items)[number]["capa"]>();
  for (const it of items) groupCapas.set(it.capa.id, it.capa);
  for (const c of drivenCapas) if (!groupCapas.has(c.id)) groupCapas.set(c.id, c);

  const itemsByCapa = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByCapa.get(it.capaId) ?? [];
    arr.push(it);
    itemsByCapa.set(it.capaId, arr);
  }

  const groups: WorklistGroup[] = [];
  for (const [capaId, capa] of groupCapas) {
    const isDriver = capa.ownerId === userId;
    const groupItems: WorklistItem[] = (itemsByCapa.get(capaId) ?? []).map((it) => ({
      id: it.id,
      capaId: it.capaId,
      sequence: it.sequence,
      description: it.description,
      owner: it.owner,
      ownerId: it.ownerId,
      dueDate: it.dueDate.toISOString(),
      status: it.status,
      completionNotes: it.completionNotes,
      reworkReason: it.reworkReason,
      reworkRequestedAt: it.reworkRequestedAt ? it.reworkRequestedAt.toISOString() : null,
    }));

    let readiness: WorklistGroup["readiness"] = null;
    let unansweredEvidence: WorklistEvidenceCategory[] | null = null;
    let evidenceNeedsInit = false;

    if (isDriver) {
      const [allActions, evidence, criteria, capaRow] = await Promise.all([
        prisma.cAPAActionItem.findMany({ where: { capaId, tenantId, deletedAt: null }, select: { status: true } }),
        prisma.evidenceItem.findMany({ where: { capaId }, select: { id: true, category: true, status: true } }),
        prisma.cAPAEffectivenessCriterion.findMany({ where: { capaId, deletedAt: null }, select: { id: true } }),
        prisma.cAPA.findUnique({
          where: { id: capaId },
          select: { rcaApproved: true, alignmentStatus: true, alignmentOverrideReason: true, diGate: true, diGateStatus: true },
        }),
      ]);
      const r = getCAPAReadiness(capaRow!, allActions, evidence, criteria);
      readiness = {
        metCount: r.conditions.filter((c) => c.met).length,
        total: r.conditions.length,
        allMet: r.allMet,
        conditions: r.conditions,
      };
      evidenceNeedsInit = evidence.length === 0;
      unansweredEvidence = evidence
        .filter((e) => e.status === "PENDING" || e.status === "IN_PROGRESS")
        .map((e) => ({ id: e.id, category: e.category, status: e.status }));
    }

    groups.push({
      capa: {
        id: capa.id,
        reference: capa.reference,
        title: capa.description,
        status: capa.status,
        dueDate: capa.dueDate ? capa.dueDate.toISOString() : null,
        risk: capa.risk,
        isDriver,
      },
      items: groupItems,
      readiness,
      unansweredEvidence,
      evidenceNeedsInit,
    });
  }

  // Driver groups first, then groups with the soonest item due date.
  groups.sort((a, b) => {
    if (a.capa.isDriver !== b.capa.isDriver) return a.capa.isDriver ? -1 : 1;
    const ad = a.items[0]?.dueDate ?? a.capa.dueDate ?? "";
    const bd = b.items[0]?.dueDate ?? b.capa.dueDate ?? "";
    return ad.localeCompare(bd);
  });

  const openItems = items.filter((i) => OPEN_ITEM_STATUSES.has(i.status));
  const reworkCount = items.filter((i) => i.status === "rework").length;
  const nextDue = openItems.length > 0
    ? openItems.map((i) => i.dueDate).sort((a, b) => a.getTime() - b.getTime())[0].toISOString()
    : null;

  return { groups, openCount: openItems.length, reworkCount, nextDue };
});
