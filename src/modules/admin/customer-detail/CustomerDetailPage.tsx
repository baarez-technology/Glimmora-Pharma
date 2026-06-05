"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Mail,
  Calendar,
  Globe,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { updateTenant as updateTenantLocal } from "@/store/auth.slice";
import { toggleTenantMFA } from "@/actions/tenants";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import dayjs from "@/lib/dayjs";
import { planLabel } from "@/lib/plans";
import { DetailHeader } from "./_components/DetailHeader";
import { DetailSummaryCards } from "./_components/DetailSummaryCards";

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const dispatch = useAppDispatch();
  // The [id] route segment now carries the human-readable customerCode
  // (e.g. "PGI_001"). Resolve by customerCode first, then fall back to the
  // cuid id so old/bookmarked cuid URLs and optimistic post-create rows
  // (which may lack customerCode until the next getTenants() reload) still
  // resolve. The cuid PK is unchanged — only the URL key moved.
  const tenant = useAppSelector(
    (s) =>
      s.auth.tenants.find((t) => t.customerCode === id) ??
      s.auth.tenants.find((t) => t.id === id),
  );
  const currentRole = useAppSelector((s) => s.auth.user?.role);
  const isSuperAdmin = currentRole === "super_admin";

  const [mfaUpdating, setMfaUpdating] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaConfirmOpen, setMfaConfirmOpen] = useState(false);

  const applyMfa = async (next: boolean) => {
    if (!isSuperAdmin || !tenant) return;
    setMfaUpdating(true);
    setMfaError(null);
    dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: next } }));
    try {
      const result = await toggleTenantMFA(tenant.id, next);
      if (!result.success) {
        dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: !next } }));
        setMfaError(result.error ?? "Failed to update MFA setting.");
      }
    } catch (err) {
      console.error("[admin] toggleTenantMFA failed", err);
      dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: !next } }));
      setMfaError("Failed to update MFA setting.");
    } finally {
      setMfaUpdating(false);
    }
  };

  const handleMfaToggleClick = () => {
    if (!tenant) return;
    if (tenant.mfaEnabled) {
      applyMfa(false);
    } else {
      setMfaConfirmOpen(true);
    }
  };

  if (!tenant) {
    return (
      <div className="w-full max-w-[1200px] mx-auto">
        <Link href="/admin" className="inline-flex items-center gap-2 text-[13px] mb-4" style={{ color: "var(--brand)" }}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
        </Link>
        <div className="card">
          <div className="card-body text-center py-10">
            <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Customer not found
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
              The customer account you are looking for does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const adminUser = tenant.config.users.find(
    (u) => u.role === "customer_admin" || u.role === "super_admin",
  );
  const plan = tenant.plan ?? null;
  const planExpired = plan ? dayjs().isAfter(dayjs.utc(plan.expiryDate)) : false;

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-[13px] mb-4"
        style={{ color: "var(--brand)" }}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
      </Link>

      <DetailHeader tenant={tenant} plan={plan} onEdit={() => router.push(`/admin?edit=${tenant.id}`)} />

      {/* Container-level utilisation — aggregate counts vs plan cap, no rosters. */}
      <DetailSummaryCards
        userCount={tenant.config.users.length}
        siteCount={tenant.config.sites.length}
        plan={plan}
        planExpired={planExpired}
      />

      {/* Organization Info */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Organization Information</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Company Name</p>
              <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{tenant.config.org.companyName}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Admin Email</p>
              <p className="text-[14px] font-medium font-mono flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Mail className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.adminEmail}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Timezone</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.timezone}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Date Format</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.dateFormat}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Regulatory Region</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Globe className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.regulatoryRegion || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security — super_admin only. customer_admin must NOT control their own MFA. */}
      {isSuperAdmin && (
        <div className="card mb-6">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">Security</span>
            </div>
          </div>
          <div className="card-body">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>MFA Required</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                  When enabled, all users in this tenant (except super_admin) must complete email OTP verification on sign-in.
                </p>
                {mfaError && (
                  <p role="alert" className="text-[12px] mt-2" style={{ color: "var(--danger)" }}>
                    {mfaError}
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!tenant.mfaEnabled}
                aria-label={`MFA Required for ${tenant.name}: ${tenant.mfaEnabled ? "on" : "off"}`}
                disabled={mfaUpdating}
                onClick={handleMfaToggleClick}
                className="toggle-track shrink-0"
                style={{
                  background: tenant.mfaEnabled ? "var(--brand)" : "var(--bg-elevated)",
                  borderColor: tenant.mfaEnabled ? "var(--brand)" : "var(--bg-border)",
                  opacity: mfaUpdating ? 0.6 : 1,
                  cursor: mfaUpdating ? "wait" : "pointer",
                }}
              >
                <span
                  className="toggle-thumb"
                  style={{ transform: tenant.mfaEnabled ? "translateX(16px)" : "translateX(2px)" }}
                />
                <span className="sr-only">{tenant.mfaEnabled ? "On" : "Off"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary Administrator — container-level CONTACT only (the provisioning
          handshake). Role / GxP-signatory and the full user roster are
          inside-tenant details and intentionally not shown to super_admin. */}
      {adminUser && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Primary Administrator</span>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Name</p>
                <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{adminUser.name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Email</p>
                <p className="text-[14px] font-mono" style={{ color: "var(--text-primary)" }}>{adminUser.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Status</p>
                <Badge variant={adminUser.status === "Active" ? "green" : "gray"}>{adminUser.status}</Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Plan</span>
          </div>
          {plan && (
            <Badge variant={planExpired ? "red" : "green"}>{planExpired ? "Expired" : "Valid"}</Badge>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Assigned plan">
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Max Users</th>
                <th scope="col">Max Sites</th>
                <th scope="col">Min Retention</th>
                <th scope="col">Start Date</th>
                <th scope="col">Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              {!plan ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No plan assigned yet.</p>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td>{planLabel(plan.tier, plan.displayName)}</td>
                  <td>{plan.maxUsers}</td>
                  <td>{plan.maxSites}</td>
                  <td>{plan.minRetentionYears} yr</td>
                  <td>{dayjs.utc(plan.startDate).format("DD MMM YYYY")}</td>
                  <td style={{ color: planExpired ? "var(--danger)" : undefined }}>{dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MFA enable confirmation — toggleTenantMFA bumps sessionsValidAfter,
          which signs out every active user in the tenant. */}
      {mfaConfirmOpen && (
        <Modal open onClose={() => setMfaConfirmOpen(false)} title="Enable MFA Required?">
          <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Enabling MFA will sign out all current users in <strong style={{ color: "var(--text-primary)" }}>{tenant.name}</strong>. They&apos;ll need to sign in again with email OTP. Continue?
          </p>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Button variant="secondary" size="sm" onClick={() => setMfaConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setMfaConfirmOpen(false);
                applyMfa(true);
              }}
            >
              Enable MFA
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
