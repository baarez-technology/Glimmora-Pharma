import { api } from "./axios";
import { store } from "@/store";

export interface AuditEntry {
  action: string;
  module: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const { user } = store.getState().auth;
  if (!user) return;
  try {
    await api.post("/audit", {
      ...entry,
      userId: user.id,
      userEmail: user.email,
    });
  } catch {
    console.error("[audit] failed", entry);
  }
}
