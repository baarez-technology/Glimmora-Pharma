import type { DeviationStatus } from "@/store/deviation.slice";

// Severity colour / display now flows through src/lib/severity.ts —
// callers use getSeverityVariant + normalizeSeverityForDisplay with the
// "fda" taxonomy (Critical / Major / Minor). The former SEV_VARIANT
// re-export is removed; status variants stay here until the Cat 2 rung
// folds them into a shared status taxonomy module.

export const STATUS_VARIANT: Record<DeviationStatus, "gray" | "blue" | "amber" | "purple" | "green" | "red"> = {
  draft: "gray", open: "blue", under_investigation: "amber", pending_qa_review: "purple", closed: "green", rejected: "red",
};
export const STATUS_LABEL: Record<DeviationStatus, string> = {
  draft: "Draft", open: "Open", under_investigation: "Under Investigation", pending_qa_review: "Pending QA Review", closed: "Closed", rejected: "Rejected",
};
export const IMPACT_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#10b981", none: "#64748b" };
export const CATEGORIES = ["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"];
export const AREAS = ["QC Lab", "Manufacturing", "Warehouse", "Utilities", "QMS", "R&D", "Packaging"];
