/**
 * Shared types + constants for the CAPA action domain files. Lives in a
 * regular module (no "use server") so the domain files can re-export
 * non-async-function values without violating Next 16's "use
 * server"-files-must-export-only-async-functions rule. See the earlier
 * hotfix that moved Change Control constants out of "use server" — same
 * problem class.
 */

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// Audit module strings — slash-form per M6 cleanup. Centralised so the
// alignment + approvals + signing rows all reference identical strings.
export const ALIGNMENT_AUDIT_MODULE = "CAPA / Alignment";
export const ALIGNMENT_LOCKED_MESSAGE =
  "Cannot modify alignment review — CAPA has progressed to QA review.";
export const APPROVAL_AUDIT_MODULE = "CAPA / Approvals";
export const SIGNING_AUDIT_MODULE = "CAPA / Approvals";
