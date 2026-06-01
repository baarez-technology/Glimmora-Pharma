import { CSVPage } from "@/modules/csv-csa/CSVPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getSystems, getDeletedSystems, getSystemsStats, getRTMStats } from "@/lib/queries";

export const metadata = {
  title: "CSV/CSA Validation — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [systems, stats, rtmStats] = await Promise.all([
    getSystems(session.user.tenantId),
    getSystemsStats(session.user.tenantId),
    getRTMStats(session.user.tenantId),
  ]);

  // RUNG 3B — archived systems are admin-only; non-admins never receive the
  // data (archive view + restore are gated to customer_admin/super_admin).
  const isAdmin = session.user.role === "customer_admin" || session.user.role === "super_admin";
  const deletedSystems = isAdmin ? await getDeletedSystems(session.user.tenantId) : [];

  return (
    <ErrorBoundary moduleName="CSV/CSA Validation">
      <CSVPage systems={systems} deletedSystems={deletedSystems} stats={stats} rtmStats={rtmStats} />
    </ErrorBoundary>
  );
}
