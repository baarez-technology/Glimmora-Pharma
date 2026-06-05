"use client";

import { MapPin, Users, CreditCard, CheckCircle2 } from "lucide-react";
import { planLabel } from "@/lib/plans";
import { type PlanConfig } from "@/store/auth.slice";

/**
 * Container-level summary for the super_admin detail view: utilisation against
 * the plan cap (Users X / cap, Sites X / cap) plus the plan + validity. These
 * are aggregate counts only — no individual user or site details (the bright
 * line: super_admin manages the container, not what's inside it).
 */
interface DetailSummaryCardsProps {
  userCount: number;
  siteCount: number;
  plan: PlanConfig | null;
  planExpired: boolean;
}

export function DetailSummaryCards({ userCount, siteCount, plan, planExpired }: DetailSummaryCardsProps) {
  const cards = [
    { label: "Sites", value: `${siteCount} / ${plan ? plan.maxSites : "—"}`, icon: MapPin, color: "var(--brand)" },
    { label: "Users", value: `${userCount} / ${plan ? plan.maxUsers : "—"}`, icon: Users, color: "var(--success)" },
    { label: "Plan", value: plan ? planLabel(plan.tier, plan.displayName) : "None", icon: CreditCard, color: "var(--warning)" },
    { label: "Plan valid", value: plan && !planExpired ? "Yes" : "No", icon: CheckCircle2, color: plan && !planExpired ? "var(--success)" : "var(--text-muted)" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((stat) => (
        <div key={stat.label} className="stat-card flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: stat.color + "15" }}
          >
            <stat.icon className="w-5 h-5" style={{ color: stat.color }} aria-hidden="true" />
          </div>
          <div>
            <p className="stat-label">{stat.label}</p>
            <p className="text-[20px] font-bold" style={{ color: "var(--card-text)" }}>{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
