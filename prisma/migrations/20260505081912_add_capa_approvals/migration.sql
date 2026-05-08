-- CreateTable
CREATE TABLE "CAPAApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "signatureId" TEXT,
    CONSTRAINT "CAPAApproval_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CAPAApproval_tenantId_capaId_idx" ON "CAPAApproval"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAApproval_capaId_idx" ON "CAPAApproval"("capaId");
