import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getAuditLogs } from "@/lib/queries";
import { getTenants } from "@/lib/queries/tenants";
import { PlatformAuditPage } from "@/modules/admin/platform-audit";

// Platform-level screen — super_admin only.
const ALLOWED_ROLES = new Set(["super_admin"]);

export const metadata = {
  title: "Platform Audit — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "platform-audit",
    recordTitle: "/admin/audit",
    extra: { path: "/admin/audit" },
  });

  // Platform admin actions (TENANT_*/PLAN_*/MFA_*) are logged under the
  // super_admin's own tenantId, so this returns the platform event feed.
  const result = await getAuditLogs(session.user.tenantId);

  // Resolve each event's affected tenant (recordId → human label). Only the
  // id→{code,name} map crosses to the client — never any user/site roster.
  const tenants = await getTenants();
  const tenantMap: Record<string, { code: string | null; name: string }> = {};
  for (const t of tenants) tenantMap[t.id] = { code: t.customerCode ?? null, name: t.name };

  return (
    <PlatformAuditPage
      logs={result.logs}
      totalCount={result.totalCount}
      truncated={result.truncated}
      limit={result.limit}
      tenantMap={tenantMap}
    />
  );
}
