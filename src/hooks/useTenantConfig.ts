import { useMemo } from "react";
import { useAppSelector } from "./useAppSelector";
import type { TenantOrgConfig, TenantSiteConfig, TenantUserConfig, SubscriptionPlan } from "@/store/auth.slice";
import dayjs from "@/lib/dayjs";

const DEFAULT_ORG: TenantOrgConfig = {
  companyName: "Pharma Glimmora",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  regulatoryRegion: "India",
};

export function useTenantConfig() {
  const currentTenantId = useAppSelector((s) => s.auth.currentTenant);
  const currentUser = useAppSelector((s) => s.auth.user);
  const tenants = useAppSelector((s) => s.auth.tenants);

  const tenant = useMemo(
    () => tenants.find((t) => t.id === currentTenantId),
    [tenants, currentTenantId],
  );
  const config = tenant?.config;

  const rawSites = useMemo(() => (config?.sites ?? []) as TenantSiteConfig[], [config?.sites]);
  const users = useMemo(() => (config?.users ?? []) as TenantUserConfig[], [config?.users]);

  // Inactive sites are hidden from every consumer EXCEPT Settings → Sites
  // (which uses allSitesIncludingInactive to still show and re-enable them).
  const allSites = useMemo(() => rawSites.filter((s) => s.status === "Active"), [rawSites]);
  const allSitesIncludingInactive = rawSites;

  const userConfig = useMemo(
    () => users.find((u) => u.id === currentUser?.id),
    [users, currentUser?.id],
  );

  const accessibleSites = useMemo(() => {
    if (!userConfig) return allSites;
    if (userConfig.allSites) return allSites;
    if (currentUser?.role === "super_admin") return allSites;
    if (currentUser?.role === "customer_admin") return allSites;
    if (currentUser?.role === "qa_head") return allSites;
    return allSites.filter((s) => userConfig.assignedSites.includes(s.id));
  }, [userConfig, allSites, currentUser?.role]);

  // ── Subscription helpers ──
  const subscriptionPlans = useMemo<SubscriptionPlan[]>(
    () => tenant?.subscriptionPlans ?? [],
    [tenant?.subscriptionPlans],
  );

  const activePlan = useMemo(
    () => subscriptionPlans.find((p) => (p.status ?? "").toLowerCase() === "active") ?? null,
    [subscriptionPlans],
  );

  // Plans created via admin UI use `expiryDate`; the TS type says `endDate`.
  // Check both to avoid field-name mismatch causing false "expired" state.
  const subscriptionInfo = useMemo(() => {
    const planExpiry = activePlan
      ? (activePlan as SubscriptionPlan & { expiryDate?: string }).expiryDate ?? activePlan.endDate
      : null;

    const daysRemaining = planExpiry
      ? Math.max(0, dayjs.utc(planExpiry).diff(dayjs(), "day"))
      : null;

    const isExpired = planExpiry
      ? dayjs().isAfter(dayjs.utc(planExpiry))
      : !activePlan;

    const isNearExpiry = daysRemaining !== null && daysRemaining <= 14 && daysRemaining > 0;

    const maxAccounts = activePlan?.maxAccounts ?? 0;
    const usedAccounts = users.length;

    const accountsRemaining = maxAccounts === -1 ? -1 : Math.max(0, maxAccounts - usedAccounts);
    const isAtAccountLimit = maxAccounts !== -1 && usedAccounts >= maxAccounts;

    return {
      daysRemaining,
      isExpired,
      isNearExpiry,
      maxAccounts,
      usedAccounts,
      accountsRemaining,
      isAtAccountLimit,
    };
  }, [activePlan, users.length]);

  return {
    tenantId: currentTenantId ?? "",
    tenantName: tenant?.name ?? "Pharma Glimmora",
    tenantPlan: tenant?.plan ?? ("enterprise" as const),
    org: config?.org ?? DEFAULT_ORG,
    sites: accessibleSites,
    allSites,
    allSitesIncludingInactive,
    users,
    userConfig,
    // subscription
    subscriptionPlans,
    activePlan,
    ...subscriptionInfo,
  };
}
