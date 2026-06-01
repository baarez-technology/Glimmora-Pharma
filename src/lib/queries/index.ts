/**
 * Cached Prisma query functions for Server Components.
 *
 * Each function uses React cache() to deduplicate within
 * a single server request. Import these instead of calling
 * prisma directly in Server Components.
 */

export { getFindings, getFinding, getFindingStats } from "./findings";
export { getCAPAs, getCAPA, getCAPAStats, getCAPAApprovals, getCAPAComments } from "./capas";
export { getCAPAEffectivenessCriteria } from "./capa-criteria";
export {
  getChangeControls,
  getChangeControlById,
  getCAPAChangeControlLinks,
  getChangeControlsWithDeleted,
} from "./change-control";
export { getDeviations, getDeviation } from "./deviations";
export { getFDA483Events, getFDA483Event, getFDA483Stats, getFDA483EventAuditLogs } from "./fda483";
export { getSystems, getDeletedSystems, getSystem, getSystemsStats, getRTMStats, getSystemByRef, getLinkableFindings, getSystemRecentActivity } from "./systems";
export { getRAIDItems, getDocuments, getDocumentStats, getCAPAEvidenceFiles, getAuditLogs, getAGIActivityLogs } from "./governance";
export { getInspections, getInspection, getReadinessStats, getOverallReadiness, getPlaybooks, computeReadinessScore } from "./inspections";
export { getSites, getUsers } from "./settings";
export { getDashboardStats } from "./dashboard";
