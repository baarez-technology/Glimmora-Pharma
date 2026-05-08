import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Pencil,
  Send,
  Wrench,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";

/**
 * Pure-logic helper that picks the single most-actionable next step for
 * a CAPA in any state. The result drives:
 *   - The persistent NextStepBanner above every modal tab body.
 *   - The Overview tab's contextual headline.
 *
 * Priority order (first match wins):
 *   1. Closed / Rejected / Pending QA review — terminal-state banners.
 *   2. Description, RCA, Criteria, Actions, Alignment — gating items
 *      checked in submission-priority order.
 *   3. "All ready, submit for review" — happy path.
 *
 * Pure function, no side effects, no JSX. Lives outside CAPADetailModal
 * so the helper can be tested in isolation and reused without dragging
 * the modal's React tree along.
 */

export type DetailSubTab =
  | "overview"
  | "evidence"
  | "rca"
  | "actions"
  | "criteria";

export interface NextStepInfo {
  Icon: typeof CheckCircle2;
  title: string;
  description: string;
  tone: "success" | "warning" | "info";
  /** Tab the banner suggests the user move to. The banner uses this to
   *  decide whether to render the "Go to X" action button — when the
   *  user is already on `targetTab`, the button is suppressed and the
   *  banner becomes pure guidance. */
  targetTab: DetailSubTab | null;
  action: { label: string; onClick: () => void } | null;
}

export function getNextStep(args: {
  capa: CAPA;
  hasDescription: boolean;
  hasRca: boolean;
  hasActions: boolean;
  hasCriteria: boolean;
  hasAlignment: boolean;
  timezone: string;
  dateFormat: string;
  onChangeTab: (tab: DetailSubTab) => void;
  onSubmitForReview: () => void;
}): NextStepInfo {
  const {
    capa,
    hasDescription,
    hasRca,
    hasActions,
    hasCriteria,
    hasAlignment,
    timezone,
    dateFormat,
    onChangeTab,
    onSubmitForReview,
  } = args;

  if (capa.status === "closed") {
    const dateText = capa.closedAt ? dayjs.utc(capa.closedAt).tz(timezone).format(dateFormat) : "—";
    return {
      Icon: CheckCircle2,
      title: "CAPA closed",
      description: `Closed on ${dateText}.`,
      tone: "success",
      targetTab: null,
      action: null,
    };
  }
  if (capa.status === "rejected") {
    return {
      Icon: AlertCircle,
      title: "CAPA rejected",
      description: "QA returned this CAPA for revision. Re-open from the Actions tab.",
      tone: "warning",
      targetTab: "actions",
      action: { label: "Go to Actions tab", onClick: () => onChangeTab("actions") },
    };
  }
  if (capa.status === "pending_qa_review") {
    return {
      Icon: Clock,
      title: "Awaiting approvals",
      description: "QA Head review pending. The Actions tab tracks who's signed.",
      tone: "info",
      targetTab: "actions",
      action: { label: "Go to Actions tab", onClick: () => onChangeTab("actions") },
    };
  }
  // Editable states: open / in_progress. Walk the priority list in spec order.
  if (!hasDescription) {
    return {
      Icon: Pencil,
      title: "Add description",
      description: "Click Edit to add a meaningful description so reviewers know what this CAPA is about.",
      tone: "warning",
      targetTab: "overview",
      action: { label: "Go to Overview tab", onClick: () => onChangeTab("overview") },
    };
  }
  if (!hasRca) {
    return {
      Icon: GitBranch,
      title: "Document root cause",
      description: "Identify why this issue happened so the corrective action targets the actual cause.",
      tone: "warning",
      targetTab: "rca",
      action: { label: "Go to RCA tab", onClick: () => onChangeTab("rca") },
    };
  }
  if (!hasCriteria) {
    return {
      Icon: CheckCircle2,
      title: "Add success criteria",
      description: "Define how you'll measure that the corrective action actually worked.",
      tone: "warning",
      targetTab: "criteria",
      action: { label: "Go to Criteria tab", onClick: () => onChangeTab("criteria") },
    };
  }
  if (!hasActions) {
    return {
      Icon: Wrench,
      title: "Add corrective actions",
      description: "Document what will fix the issue and prevent recurrence.",
      tone: "warning",
      targetTab: "actions",
      action: { label: "Go to Actions tab", onClick: () => onChangeTab("actions") },
    };
  }
  if (!hasAlignment) {
    return {
      Icon: AlertTriangle,
      title: "Complete alignment review",
      description: "Verify the corrective actions match the documented root cause before submission.",
      tone: "warning",
      targetTab: "actions",
      action: { label: "Go to Actions tab", onClick: () => onChangeTab("actions") },
    };
  }
  return {
    Icon: Send,
    title: "Submit for review",
    description: "All required items are in place. Send to QA for approval when ready.",
    tone: "info",
    targetTab: "actions",
    action: { label: "Submit for review", onClick: onSubmitForReview },
  };
}
