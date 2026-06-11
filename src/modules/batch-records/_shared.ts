/**
 * Batch Records module constants, shared by the page UI.
 * Mirrors the FDA483_AUDIT_MODULE convention in ../fda-483/_shared.ts.
 */

import type {
  BatchReadinessLevel,
  BatchRecordEntryStatus,
  BatchLifecycle,
} from "@/lib/ai";

/** Audit-log `module` value, if/when a real backend persists actions. */
export const BATCH_RECORDS_AUDIT_MODULE = "Batch Records" as const;

export const READINESS_BADGE: Record<
  BatchReadinessLevel,
  "green" | "amber" | "red"
> = {
  ready: "green",
  needs_review: "amber",
  not_ready: "red",
};

export const READINESS_LABEL: Record<BatchReadinessLevel, string> = {
  ready: "Ready for review",
  needs_review: "Needs review",
  not_ready: "Not ready",
};

/** Colour per record-entry status, for the missing/review chips. */
export const ENTRY_STATUS_COLOR: Record<BatchRecordEntryStatus, string> = {
  complete: "#10b981",
  missing: "#ef4444",
  review: "#f59e0b",
};

export const LIFECYCLE_LABEL: Record<BatchLifecycle, string> = {
  in_process: "In process",
  under_review: "Under review",
  released: "Released",
};
