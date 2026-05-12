import { requireAuth } from "@/lib/auth";
import { getTenant } from "@/lib/queries/tenants";
import { AppShell } from "@/components/layout/AppShell";
import type { AuthUser, UserRole } from "@/store/auth.slice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  // Fetch the user's own tenant so AppShell can seed Redux. Without this,
  // useTenantConfig() finds no tenant in state, treats the missing
  // subscriptionPlans as expired, and the AppShell gate fires "No active
  // subscription" even when the DB row is healthy.
  const initialTenant = session.user.tenantId
    ? await getTenant(session.user.tenantId)
    : null;
  // Forward the resolved session user so AppShell can self-heal Redux's
  // auth.user/currentTenant when localStorage is stale (e.g. the
  // persistMiddleware's 500ms debounce missed the post-login dispatch
  // before window.location.assign navigated). Without currentTenant set,
  // useTenantConfig() can't locate the tenant we just dispatched into
  // tenants[] and the subscription gate fires against a healthy DB row.
  const initialUser: AuthUser | null = session.user.tenantId
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role as UserRole,
        gxpSignatory: session.user.gxpSignatory ?? false,
        orgId: session.user.tenantId,
        tenantId: session.user.tenantId,
      }
    : null;
  return (
    <AppShell initialTenant={initialTenant} initialUser={initialUser}>
      {children}
    </AppShell>
  );
}
