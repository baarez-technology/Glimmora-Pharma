import type { CAPA, CAPARisk, CAPASource, RCAMethod } from "@/store/capa.slice";
import type { CAPAStatus } from "@/types/capa";

type PrismaCAPA = {
  id: string;
  reference: string | null;
  tenantId: string;
  siteId: string | null;
  findingId: string | null;
  source: string;
  description: string;
  risk: string;
  owner: string;
  dueDate: Date | null;
  status: string;
  rca: string | null;
  rcaMethod: string | null;
  correctiveActions: string | null;
  effectivenessCheck: boolean;
  effectivenessDate: Date | null;
  diGate: boolean;
  diGateStatus: string | null;
  diGateNotes: string | null;
  diGateReviewedBy: string | null;
  diGateReviewDate: Date | null;
  alignmentStatus: string | null;
  alignmentReviewedBy: string | null;
  alignmentReviewedById: string | null;
  alignmentReviewedAt: Date | null;
  alignmentNotes: string | null;
  alignmentOverrideBy: string | null;
  alignmentOverrideById: string | null;
  alignmentOverrideAt: Date | null;
  alignmentOverrideReason: string | null;
  ccBlockOverrideReason: string | null;
  ccBlockOverrideById: string | null;
  ccBlockOverrideByName: string | null;
  ccBlockOverrideAt: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export const STATUS_MAP: Record<string, CAPAStatus> = {
  // Canonical (snake_case) — identity.
  open: "open",
  in_progress: "in_progress",
  pending_qa_review: "pending_qa_review",
  closed: "closed",
  rejected: "rejected",
  // Legacy Title-Case — fold to canonical for any rows still pending the
  // fix_capa_status_vocab.sql migration. Safe to remove once that
  // migration has run everywhere.
  Open: "open",
  "In Progress": "in_progress",
  "Pending QA Review": "pending_qa_review",
  Closed: "closed",
};

export function mapCAPAFromPrisma(row: PrismaCAPA): CAPA {
  return {
    id: row.id,
    reference: row.reference ?? undefined,
    tenantId: row.tenantId,
    siteId: row.siteId ?? "",
    findingId: row.findingId ?? undefined,
    source: (row.source as CAPASource) ?? "Gap Assessment",
    risk: (row.risk as CAPARisk) ?? "Low",
    owner: row.owner,
    dueDate: row.dueDate ? row.dueDate.toISOString() : "",
    status: STATUS_MAP[row.status] ?? "open",
    description: row.description,
    rca: row.rca ?? undefined,
    rcaMethod: (row.rcaMethod as RCAMethod | null) ?? undefined,
    correctiveActions: row.correctiveActions ?? undefined,
    effectivenessCheck: row.effectivenessCheck,
    effectivenessDate: row.effectivenessDate ? row.effectivenessDate.toISOString() : undefined,
    diGate: row.diGate,
    diGateStatus: (row.diGateStatus as "open" | "cleared" | null) ?? undefined,
    diGateNotes: row.diGateNotes ?? undefined,
    diGateReviewedBy: row.diGateReviewedBy ?? undefined,
    diGateReviewDate: row.diGateReviewDate ? row.diGateReviewDate.toISOString() : undefined,
    alignmentStatus:
      row.alignmentStatus === "aligned" ||
      row.alignmentStatus === "cosmetic" ||
      row.alignmentStatus === "needs_review"
        ? row.alignmentStatus
        : undefined,
    alignmentReviewedBy: row.alignmentReviewedBy ?? undefined,
    alignmentReviewedById: row.alignmentReviewedById ?? undefined,
    alignmentReviewedAt: row.alignmentReviewedAt
      ? row.alignmentReviewedAt.toISOString()
      : undefined,
    alignmentNotes: row.alignmentNotes ?? undefined,
    alignmentOverrideBy: row.alignmentOverrideBy ?? undefined,
    alignmentOverrideById: row.alignmentOverrideById ?? undefined,
    alignmentOverrideAt: row.alignmentOverrideAt
      ? row.alignmentOverrideAt.toISOString()
      : undefined,
    alignmentOverrideReason: row.alignmentOverrideReason ?? undefined,
    ccBlockOverrideReason: row.ccBlockOverrideReason ?? undefined,
    ccBlockOverrideById: row.ccBlockOverrideById ?? undefined,
    ccBlockOverrideByName: row.ccBlockOverrideByName ?? undefined,
    ccBlockOverrideAt: row.ccBlockOverrideAt
      ? row.ccBlockOverrideAt.toISOString()
      : undefined,
    closedAt: row.closedAt ? row.closedAt.toISOString() : undefined,
    closedBy: row.closedBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
