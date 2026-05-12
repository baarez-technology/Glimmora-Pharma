// Centralised badge variant lookups for the CAPA domain.
//
// Extracted from inline duplicates in CAPADetailModal, CAPATrackerTab, and
// SignCloseModal that all carried bit-identical maps. The CAPA_ prefix is
// deliberate — DriftStatus, ComplianceStatus, and system risk-level all
// also map to Badge variants, but their key sets and value sets differ
// from CAPA's. Centralising them under bare RISK_VARIANT / STATUS_VARIANT
// names would set us up for a naming collision the next time one of those
// other maps gets a second consumer (rule of three: extract on the third
// duplicate, not the first).
//
// The narrow value-union types (e.g. "red" | "amber" | "green") are
// intentionally tighter than the full Badge `variant` prop union — Badge
// accepts six colours, but CAPA risk only ever produces three. The narrow
// types are assignable to Badge's wider union, so consumers stay
// type-safe without losing precision.

import type { CAPARisk } from "@/store/capa.slice";
import type { CAPAStatus } from "@/types/capa";
import type {
  ChangeControlRisk,
  ChangeControlStatus,
} from "@/lib/change-control-constants";

export const CAPA_RISK_VARIANT: Record<CAPARisk, "red" | "amber" | "green"> = {
  Critical: "red",
  High: "amber",
  // Medium added in substage 5.2 prereq-A. Sits between High (amber) and
  // Low (green); using amber matches the existing "anything not Low/safe
  // is amber" hierarchy without introducing a new colour.
  Medium: "amber",
  Low: "green",
};

export const CAPA_STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green" | "red"> = {
  open: "blue",
  in_progress: "amber",
  pending_qa_review: "purple",
  closed: "green",
  rejected: "red",
};

// Substage 4.8 — Change Control variants. Risk colour mirrors the CAPA
// hierarchy (Critical=red, High/Medium=amber, Low=green). Status colour
// follows the lifecycle: in-flight = blue/amber/purple, terminal-success
// = green/gray, terminal-failure = red. Note: Closed=gray (not green) is
// intentional — for CCs, "Closed" is post-implementation archival, while
// "Implemented" is the success state worth highlighting.
export const CC_RISK_VARIANT: Record<ChangeControlRisk, "red" | "amber" | "green"> = {
  Critical: "red",
  High: "amber",
  Medium: "amber",
  Low: "green",
};

export const CC_STATUS_VARIANT: Record<
  ChangeControlStatus,
  "blue" | "amber" | "green" | "purple" | "gray" | "red"
> = {
  Draft: "blue",
  "In Review": "amber",
  Approved: "purple",
  "In Implementation": "amber",
  Implemented: "green",
  Closed: "gray",
  Rejected: "red",
};
