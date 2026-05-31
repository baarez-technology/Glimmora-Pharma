-- CreateTable
CREATE TABLE "FDA483CommitmentDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    CONSTRAINT "FDA483CommitmentDocument_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FDA483Commitment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483CommitmentDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FDA483Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueDate" DATETIME,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reference" TEXT,
    "observationId" TEXT,
    "capaId" TEXT,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "FDA483Commitment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "FDA483Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "FDA483Observation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FDA483Commitment" ("dueDate", "eventId", "id", "owner", "status", "text") SELECT "dueDate", "eventId", "id", "owner", "status", "text" FROM "FDA483Commitment";
DROP TABLE "FDA483Commitment";
ALTER TABLE "new_FDA483Commitment" RENAME TO "FDA483Commitment";
CREATE UNIQUE INDEX "FDA483Commitment_reference_key" ON "FDA483Commitment"("reference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
