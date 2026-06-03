import { GapPage } from "@/modules/gap-assessment/GapPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getFindings, getFindingEvidenceDocIds } from "@/lib/queries";

export const metadata = {
  title: "Gap Assessment — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [findings, evidenceDocFindingIds] = await Promise.all([
    getFindings(session.user.tenantId),
    getFindingEvidenceDocIds(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Gap Assessment">
      <GapPage findings={findings} evidenceDocFindingIds={evidenceDocFindingIds} />
    </ErrorBoundary>
  );
}
