"use client";

import { Building2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import dayjs from "@/lib/dayjs";
import { planLabel } from "@/lib/plans";
import { type Tenant, type PlanConfig } from "@/store/auth.slice";

const planVariant: Record<string, "green" | "blue" | "amber" | "gray"> = {
  ENTERPRISE: "green",
  PROFESSIONAL: "blue",
  ESSENTIALS: "amber",
  TAILORED: "gray",
};

interface DetailHeaderProps {
  tenant: Tenant;
  plan: PlanConfig | null;
  onEdit: () => void;
}

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
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Code: <span className="font-mono font-medium" style={{ color: "var(--text-secondary)" }}>{tenant.customerCode ?? "—"}</span>
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={plan ? (planVariant[plan.tier] ?? "gray") : "gray"}>
              {plan ? planLabel(plan.tier, plan.displayName) : "No plan"}
            </Badge>
            <Badge variant={tenant.active ? "green" : "red"}>
              {tenant.active ? "Active" : "Suspended"}
            </Badge>
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Created {tenant.createdAt ? dayjs(tenant.createdAt).format("MMM D, YYYY") : "—"}
            </span>
          </div>
        </div>
      </div>
      <Button variant="primary" icon={Pencil} onClick={onEdit}>
        Edit Account
      </Button>
    </div>
  );
}
