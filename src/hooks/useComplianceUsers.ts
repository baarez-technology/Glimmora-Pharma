import { useTenantConfig } from "./useTenantConfig";

const EXCLUDED_ROLES = ["super_admin", "customer_admin", "viewer"];

export function useComplianceUsers() {
  const { users } = useTenantConfig();
  return users.filter(
    (u) => u.status === "Active" && !EXCLUDED_ROLES.includes(u.role),
  );
}
