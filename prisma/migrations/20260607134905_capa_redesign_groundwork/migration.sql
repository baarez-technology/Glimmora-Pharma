-- AlterTable
ALTER TABLE "EvidenceItem" ADD COLUMN "naReason" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CAPAActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reworkReason" TEXT,
    "reworkRequestedById" TEXT,
    "reworkRequestedAt" DATETIME,
    "completedBy" TEXT,
    "completedById" TEXT,
    "completedAt" DATETIME,
    "completionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPAActionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_reworkRequestedById_fkey" FOREIGN KEY ("reworkRequestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CAPAActionItem" ("capaId", "completedAt", "completedBy", "completedById", "completionNotes", "createdAt", "createdBy", "createdById", "description", "dueDate", "id", "owner", "ownerId", "sequence", "status", "tenantId", "updatedAt") SELECT "capaId", "completedAt", "completedBy", "completedById", "completionNotes", "createdAt", "createdBy", "createdById", "description", "dueDate", "id", "owner", "ownerId", "sequence", "status", "tenantId", "updatedAt" FROM "CAPAActionItem";
DROP TABLE "CAPAActionItem";
ALTER TABLE "new_CAPAActionItem" RENAME TO "CAPAActionItem";
CREATE INDEX "CAPAActionItem_tenantId_capaId_idx" ON "CAPAActionItem"("tenantId", "capaId");
CREATE INDEX "CAPAActionItem_capaId_sequence_idx" ON "CAPAActionItem"("capaId", "sequence");
CREATE INDEX "CAPAActionItem_dueDate_idx" ON "CAPAActionItem"("dueDate");
CREATE INDEX "CAPAActionItem_ownerId_idx" ON "CAPAActionItem"("ownerId");
CREATE TABLE "new_CAPAComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "parentId" TEXT,
    "actionItemId" TEXT,
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
    CONSTRAINT "CAPAComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CAPAComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAComment_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "CAPAActionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CAPAComment" ("authorId", "authorName", "authorRole", "body", "capaId", "createdAt", "deletedAt", "deletedById", "deletedByName", "deletionReason", "id", "isConcern", "parentId", "resolvedAt", "resolvedById", "resolvedByName", "resolvedComment", "tenantId", "updatedAt") SELECT "authorId", "authorName", "authorRole", "body", "capaId", "createdAt", "deletedAt", "deletedById", "deletedByName", "deletionReason", "id", "isConcern", "parentId", "resolvedAt", "resolvedById", "resolvedByName", "resolvedComment", "tenantId", "updatedAt" FROM "CAPAComment";
DROP TABLE "CAPAComment";
ALTER TABLE "new_CAPAComment" RENAME TO "CAPAComment";
CREATE INDEX "CAPAComment_capaId_createdAt_idx" ON "CAPAComment"("capaId", "createdAt");
CREATE INDEX "CAPAComment_tenantId_capaId_idx" ON "CAPAComment"("tenantId", "capaId");
CREATE INDEX "CAPAComment_parentId_idx" ON "CAPAComment"("parentId");
CREATE INDEX "CAPAComment_actionItemId_idx" ON "CAPAComment"("actionItemId");
CREATE TABLE "new_EvidenceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "retainUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedById" TEXT,
    "actionItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceFile_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "CAPAActionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvidenceFile" ("contentHashSha256", "createdAt", "deletedAt", "deletedBy", "deletionReason", "evidenceItemId", "fileExtension", "fileName", "fileSize", "fileType", "fileUrl", "id", "originalFileName", "retainUntil", "uploadedBy") SELECT "contentHashSha256", "createdAt", "deletedAt", "deletedBy", "deletionReason", "evidenceItemId", "fileExtension", "fileName", "fileSize", "fileType", "fileUrl", "id", "originalFileName", "retainUntil", "uploadedBy" FROM "EvidenceFile";
DROP TABLE "EvidenceFile";
ALTER TABLE "new_EvidenceFile" RENAME TO "EvidenceFile";
CREATE INDEX "EvidenceFile_evidenceItemId_idx" ON "EvidenceFile"("evidenceItemId");
CREATE INDEX "EvidenceFile_deletedAt_idx" ON "EvidenceFile"("deletedAt");
CREATE INDEX "EvidenceFile_actionItemId_idx" ON "EvidenceFile"("actionItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CAPA_effectivenessDate_idx" ON "CAPA"("effectivenessDate");
