-- CreateTable
CREATE TABLE "CAPAComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "isConcern" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedComment" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPAComment_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CAPAComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CAPAComment_capaId_createdAt_idx" ON "CAPAComment"("capaId", "createdAt");

-- CreateIndex
CREATE INDEX "CAPAComment_tenantId_capaId_idx" ON "CAPAComment"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAComment_parentId_idx" ON "CAPAComment"("parentId");
