-- CreateTable
CREATE TABLE "StageDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "validationStageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "retainUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageDocument_validationStageId_fkey" FOREIGN KEY ("validationStageId") REFERENCES "ValidationStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StageDocument_validationStageId_idx" ON "StageDocument"("validationStageId");

-- CreateIndex
CREATE INDEX "StageDocument_tenantId_uploadedAt_idx" ON "StageDocument"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "StageDocument_deletedAt_idx" ON "StageDocument"("deletedAt");
