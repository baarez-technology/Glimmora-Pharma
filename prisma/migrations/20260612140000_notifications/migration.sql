-- In-app notifications (Phase 2) — additive: one new table, no changes to any
-- existing table. Notifications are a fault-isolated SIDE EFFECT (observer) of
-- GxP lifecycle events; they never block or roll back the triggering action.
-- Tenant-scoped + per-recipient. Provider: sqlite — DATETIME + CURRENT_TIMESTAMP
-- per repo convention; recipientUserId is a portable TEXT FK (indexed, no FK
-- constraint — matches the denorm-FK style used elsewhere in this schema).
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkPath" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME
);
CREATE INDEX "Notification_recipientUserId_isRead_createdAt_idx" ON "Notification"("recipientUserId", "isRead", "createdAt");
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
