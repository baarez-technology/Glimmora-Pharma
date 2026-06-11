import { BatchRecordsPage } from "@/modules/batch-records/BatchRecordsPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";

export const metadata = {
  title: "Batch Records — Pharma Glimmora",
};

/**
 * Batch Records route — Batch Readiness Agent surface.
 *
 * Client-side AGI feature: batch records + completeness analysis flow through
 * the mock AI gateway in the browser, so no server fetch is needed yet. Gated
 * on requireAuth() + the module ErrorBoundary like every other (app) route.
 * When a real MES/batch backend is wired, fetch records + pass them as props.
 */
export default async function Page() {
  await requireAuth();
  return (
    <ErrorBoundary moduleName="Batch Records">
      <BatchRecordsPage />
    </ErrorBoundary>
  );
}
