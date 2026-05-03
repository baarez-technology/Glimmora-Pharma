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

import type { CAPARisk, CAPAStatus } from "@/store/capa.slice";

export const CAPA_RISK_VARIANT: Record<CAPARisk, "red" | "amber" | "green"> = {
  Critical: "red",
  High: "amber",
  Low: "green",
};

export const CAPA_STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green"> = {
  Open: "blue",
  "In Progress": "amber",
  "Pending QA Review": "purple",
  Closed: "green",
};
