import type { AuditLog } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import dayjs from "@/lib/dayjs";

/* ── Event category (derived from the raw action prefix) ── */
export type AuditCategory = "Account" | "Plan" | "Security" | "Other";

export function categoryOf(action: string): AuditCategory {
  if (action.startsWith("TENANT_")) return "Account";
  if (action.startsWith("PLAN_") || action.startsWith("SUBSCRIPTION_")) return "Plan";
  if (action.startsWith("MFA_")) return "Security";
  return "Other";
}

const CATEGORY_VARIANT: Record<AuditCategory, "blue" | "green" | "amber" | "gray"> = {
  Account: "blue",
  Plan: "green",
  Security: "amber",
  Other: "gray",
};

interface PlatformAuditTableProps {
  rows: AuditLog[];
  tenantMap: Record<string, { code: string | null; name: string }>;
}

/**
 * Platform audit table. Who → roleLabel (never a raw role code), Event →
 * auditEventLabel (never a raw action code), Tenant → customerCode when known
 * else the tenant name.
 */
export function PlatformAuditTable({ rows, tenantMap }: PlatformAuditTableProps) {
  const tenantOf = (e: AuditLog): string => {
    const t = e.recordId ? tenantMap[e.recordId] : undefined;
    return t?.code ?? t?.name ?? e.recordTitle ?? "—";
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table" aria-label="Platform audit events">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Event</th>
            <th scope="col">Tenant</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center py-8">
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No events match the current filter.</p>
              </td>
            </tr>
          ) : (
            rows.map((e) => {
              const cat = categoryOf(e.action);
              return (
                <tr key={e.id}>
                  <td>
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {dayjs(e.createdAt).format("DD MMM YYYY, HH:mm")}
                    </span>
                  </td>
                  <td>
                    <div className="text-[12px]">
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>{e.userName}</p>
                      {e.userRole && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roleLabel(e.userRole)}</p>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</span>
                      <Badge variant={CATEGORY_VARIANT[cat]}>{cat}</Badge>
                    </div>
                  </td>
                  <td>
                    <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>{tenantOf(e)}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
