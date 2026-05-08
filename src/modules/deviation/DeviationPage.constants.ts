import type { DeviationStatus, DeviationSeverity } from "@/store/deviation.slice";

export const STATUS_VARIANT: Record<DeviationStatus, "gray" | "blue" | "amber" | "purple" | "green" | "red"> = {
  draft: "gray", open: "blue", under_investigation: "amber", pending_qa_review: "purple", closed: "green", rejected: "red",
};
export const STATUS_LABEL: Record<DeviationStatus, string> = {
  draft: "Draft", open: "Open", under_investigation: "Under Investigation", pending_qa_review: "Pending QA Review", closed: "Closed", rejected: "Rejected",
};
export const SEV_VARIANT: Record<DeviationSeverity, "red" | "amber" | "green"> = { critical: "red", major: "amber", minor: "green" };
export const IMPACT_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#10b981", none: "#64748b" };
export const CATEGORIES = ["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"];
export const AREAS = ["QC Lab", "Manufacturing", "Warehouse", "Utilities", "QMS", "R&D", "Packaging"];
