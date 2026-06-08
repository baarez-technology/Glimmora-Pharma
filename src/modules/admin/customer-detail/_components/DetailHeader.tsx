"use client";

import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import dayjs from "@/lib/dayjs";
import { planLabel } from "@/lib/plans";
import { type Tenant, type PlanConfig } from "@/store/auth.slice";

interface DetailHeaderProps {
  tenant: Tenant;
  plan: PlanConfig | null;
  onEdit: () => void;
}

/**
 * Header: org icon + name + a single identity subline
 * "CODE · TIER · STATUS · created DATE". The subline replaces the old separate
 * tier + status badges (which duplicated facts shown elsewhere on the page).
 */
export function DetailHeader({ tenant, plan, onEdit }: DetailHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}
        >
          <Building2 className="w-7 h-7" style={{ color: "var(--brand)" }} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: "var(--text-primary)" }}>
            {tenant.name}
          </h1>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
            <span className="font-mono font-medium">{tenant.customerCode ?? "—"}</span>
            {" · "}{plan ? planLabel(plan.tier, plan.displayName) : "No plan"}
            {" · "}{tenant.active ? "Active" : "Suspended"}
            {" · created "}{tenant.createdAt ? dayjs(tenant.createdAt).format("D MMM YYYY") : "—"}
          </p>
        </div>
      </div>
      <Button variant="primary" icon={Pencil} onClick={onEdit}>
        Edit Account
      </Button>
    </div>
  );
}
