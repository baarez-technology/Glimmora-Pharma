-- CreateTable
CREATE TABLE "CAPAActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
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
    CONSTRAINT "CAPAActionItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CAPAActionItem_tenantId_capaId_idx" ON "CAPAActionItem"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAActionItem_capaId_sequence_idx" ON "CAPAActionItem"("capaId", "sequence");

-- CreateIndex
CREATE INDEX "CAPAActionItem_dueDate_idx" ON "CAPAActionItem"("dueDate");
