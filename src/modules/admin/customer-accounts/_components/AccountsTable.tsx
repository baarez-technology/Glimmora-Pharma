"use client";

import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { planLabel } from "@/lib/plans";
import { planState, lifecycleLabel } from "@/lib/tenantStatus";
import dayjs from "@/lib/dayjs";
import { type Tenant } from "@/store/auth.slice";
import { planUtilisation } from "../helpers";
import { AccountRowMenu } from "./AccountRowMenu";

/**
 * The organizations table. Modern-list behavior: the whole row navigates to
 * the tenant detail (customerCode-first, cuid fallback); utilisation vs plan
 * cap is shown inline; MFA is a read-only pill (changed in detail/edit, not
 * here); row actions live in the ⋮ overflow menu (View / Edit / Suspend).
 */
interface AccountsTableProps {
  rows: Tenant[];
  totalCount: number;
  isSuperAdmin: boolean;
  /** True when a search query or a stat-card filter is narrowing the list. */
  isFiltered: boolean;
  onEdit: (tenant: Tenant) => void;
  onSuspend: (tenant: Tenant) => void;
  onCreate: () => void;
}

export function AccountsTable({ rows, totalCount, isSuperAdmin, isFiltered, onEdit, onSuspend, onCreate }: AccountsTableProps) {
  const router = useRouter();
  // customerCode-first URL with cuid fallback (link behavior preserved).
  const goToDetail = (tenant: Tenant) => router.push(`/admin/customer/${tenant.customerCode ?? tenant.id}`);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Organizations</span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} of {totalCount}
        </span>
      </div>
      <div className="overflow-x-auto">
        {/* min-width forces horizontal scroll on narrow viewports instead of
            squishing columns; the overflow-x-auto wrapper supplies the scrollbar. */}
        <table className="data-table min-w-[960px]" aria-label="Customer accounts">
          <thead>
            <tr>
              <th scope="col">Organization</th>
              <th scope="col">Plan</th>
              <th scope="col">Utilisation</th>
              <th scope="col">Account</th>
              <th scope="col">Subscription</th>
              {isSuperAdmin && <th scope="col">MFA</th>}
              <th scope="col">Created</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => {
              const tenantPlan = tenant.plan;
              const expiry = tenantPlan?.expiryDate;
              const plState = planState(tenant);
              const initial = tenant.name.charAt(0).toUpperCase();
              const util = tenantPlan ? planUtilisation(tenant) : null;
              const maxPct = util ? Math.min(1, Math.max(util.userPct, util.sitePct)) : 0;
              const nearCap = util ? (util.userPct >= 0.8 || util.sitePct >= 0.8) : false;
              const atCap = maxPct >= 1;
              const barColor = atCap ? "var(--danger)" : nearCap ? "var(--warning)" : "var(--brand)";
              return (
                <tr
                  key={tenant.id}
                  onClick={() => goToDetail(tenant)}
                  className="cursor-pointer hover:bg-(--bg-hover)"
                >
                  {/* Organization */}
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[14px] font-bold" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>{initial}</div>
                      <div className="min-w-0">
                        <span className="text-[13px] font-semibold block truncate" style={{ color: "var(--text-primary)" }}>{tenant.name}</span>
                        <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{tenant.adminEmail}</p>
                      </div>
                    </div>
                  </td>
                  {/* Plan (tier) — subscription status is its own column */}
                  <td>
                    <div className="text-[12px]">
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>{tenantPlan ? planLabel(tenantPlan.tier, tenantPlan.displayName) : "—"}</p>
                      {tenantPlan && expiry && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Expires {dayjs.utc(expiry).format("MMM D, YYYY")}</p>}
                    </div>
                  </td>
                  {/* Utilisation vs plan cap */}
                  <td>
                    {util ? (
                      <div className="min-w-[110px]">
                        <span className="text-[12px]" style={{ color: nearCap ? barColor : "var(--text-secondary)" }}>
                          {tenant.config.users.length}/{tenantPlan!.maxUsers}u · {tenant.config.sites.length}/{tenantPlan!.maxSites}s
                        </span>
                        <div className="h-1.5 rounded-full mt-1" style={{ background: "var(--bg-border)" }} role="progressbar" aria-valuenow={Math.round(maxPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${tenant.name} utilisation`}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(maxPct * 100)}%`, background: barColor }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  {/* Account status — lifecycle (tenant.active), via lifecycleLabel */}
                  <td>
                    <Badge variant={tenant.active === false ? "gray" : "green"}>{lifecycleLabel(tenant.active)}</Badge>
                  </td>
                  {/* Subscription status — planState, independent of account status */}
                  <td>
                    {plState === "ok" ? (
                      <Badge variant="green">Active</Badge>
                    ) : plState === "expired" ? (
                      <Badge variant="red">Expired</Badge>
                    ) : (
                      <Badge variant="gray">No plan</Badge>
                    )}
                  </td>
                  {/* MFA — read-only pill (super_admin only). Changed in detail/edit. */}
                  {isSuperAdmin && (
                    <td>
                      <Badge variant={tenant.mfaEnabled ? "green" : "gray"}>{tenant.mfaEnabled ? "Enabled" : "Disabled"}</Badge>
                    </td>
                  )}
                  {/* Created */}
                  <td>
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {tenant.createdAt ? dayjs(tenant.createdAt).format("MMM D, YYYY") : "—"}
                    </span>
                  </td>
                  {/* Actions — overflow menu (stops row navigation internally) */}
                  <td>
                    <AccountRowMenu tenant={tenant} onView={goToDetail} onEdit={onEdit} onSuspend={onSuspend} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 8 : 7} className="text-center py-10">
                  <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                    {isFiltered ? "No organizations match the current filter" : "No customer accounts yet"}
                  </p>
                  <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
                    {isFiltered ? "Try a different search term or clear the active filter." : "Add your first customer to get started."}
                  </p>
                  {!isFiltered && <Button variant="primary" size="sm" icon={Plus} onClick={onCreate}>Add Customer</Button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
