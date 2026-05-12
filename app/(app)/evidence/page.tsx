import { EvidencePage } from "@/modules/evidence/EvidencePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getCAPAEvidenceFiles, getDocuments, getDocumentStats } from "@/lib/queries";

export const metadata = {
  title: "Evidence & Documents — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [docs, stats, capaEvidenceFiles] = await Promise.all([
    getDocuments(session.user.tenantId),
    getDocumentStats(session.user.tenantId),
    getCAPAEvidenceFiles(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Evidence & Documents">
      <EvidencePage docs={docs} stats={stats} capaEvidenceFiles={capaEvidenceFiles} />
    </ErrorBoundary>
  );
}
