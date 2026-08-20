import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";

/**
 * Per-record audit feed — the "show me this record's history" query.
 *
 * The Audit Trail module is the authoritative, tenant-wide trail, but it is
 * visible to qa_head / customer_admin / super_admin ONLY, and finding one
 * record's history there means filtering a tenant-wide log. Two modules already
 * solved this locally and differently: FDA 483 has an Audit tab
 * (getFDA483EventAuditRows) and CAPA has a collapsed audit bar. Deviation,
 * CSV/CSA had a 3-row "Recent activity" card and Deviation had nothing.
 *
 * This is the shared loader those surfaces can share, so a third variant does
 * not get written. It does NOT replace the module-specific FDA 483 query, which
 * additionally re-checks that module's record-level visibility rules before
 * returning anything — that gate is specific to FDA 483 and belongs with it.
 *
 * SCOPING: always tenant-filtered, and filtered by `module` as well as
 * `recordId` so a cuid collision across modules (or a child id reused as a
 * recordId elsewhere) cannot leak an unrelated row into a record's history.
 * Callers pass the module tag their writers use.
 */

/** The shape every per-record audit surface renders. Serialised for the client. */
export interface RecordAuditRow {
  id: string;
  createdAt: string;
  userName: string;
  userRole: string | null;
  action: string;
  recordTitle: string | null;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Audit rows for one record (optionally including its children).
 *
 * @param tenantId  caller's tenant — never optional, never client-supplied
 * @param modules   the AuditLog.module tag(s) whose writers cover this record.
 *                  An array because a record's history can legitimately span
 *                  tags: a deviation's own events are "Deviation Management",
 *                  but its signature events are written under the signing
 *                  module, and omitting those would show a closure with no
 *                  signature behind it.
 * @param recordIds the record plus any child ids whose events belong to it
 * @param limit     newest-first cap (default 100)
 */
export const getRecordAuditRows = cache(
  async (
    tenantId: string,
    modules: readonly string[],
    recordIds: readonly string[],
    limit = 100,
  ): Promise<RecordAuditRow[]> => {
    // An empty id list would otherwise compile to `recordId IN ()` and, with the
    // module filter alone still matching, return the module's whole history.
    if (recordIds.length === 0 || modules.length === 0) return [];
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId,
        module: { in: [...modules] },
        recordId: { in: [...recordIds] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        userName: true,
        userRole: true,
        action: true,
        recordTitle: true,
        oldValue: true,
        newValue: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userName: r.userName,
      userRole: r.userRole,
      action: r.action,
      recordTitle: r.recordTitle,
      oldValue: r.oldValue,
      newValue: r.newValue,
    }));
  },
);

/** Audit rows for one deviation, including its tasks. */
export const getDeviationAuditRows = cache(
  async (tenantId: string, deviationId: string, limit = 100): Promise<RecordAuditRow[]> => {
    const tasks = await prisma.deviationTask.findMany({
      where: { deviationId, tenantId },
      select: { id: true },
    });
    return getRecordAuditRows(
      tenantId,
      // Both tags are real: attachDeviationDocument writes "Deviation"
      // (deviations.ts:101) while every other writer uses "Deviation
      // Management". A trail built from one tag would silently drop the other's
      // events, so both are queried. SIGNING_AUDIT_MODULE covers the
      // signature rows minted on close/reject.
      ["Deviation Management", "Deviation", SIGNING_AUDIT_MODULE],
      [deviationId, ...tasks.map((t) => t.id)],
      limit,
    );
  },
);
