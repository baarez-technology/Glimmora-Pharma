"use client";

import { X } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { PLAN_TIERS } from "@/lib/plans";
import { type AccountFilters } from "../helpers";

/**
 * The five column filters for the accounts list (Account / Plan / Subscription /
 * MFA / Created). Each is the existing Dropdown primitive; they AND-combine with
 * the search box and the stat-card quick-filters in the hook. A "Clear filters"
 * affordance appears whenever anything is narrowing the list.
 */

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Plan tiers sourced from PLAN_TIERS (not hardcoded) + Tailored + the no-plan case.
const PLAN_OPTIONS = [
  { value: "all", label: "All plans" },
  ...Object.keys(PLAN_TIERS).map((k) => ({ value: k, label: titleCase(k) })),
  { value: "TAILORED", label: "Tailored" },
  { value: "noplan", label: "No plan" },
];
const ACCOUNT_OPTIONS = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];
const SUB_OPTIONS = [
  { value: "all", label: "All subscriptions" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No plan" },
];
const MFA_OPTIONS = [
  { value: "all", label: "All MFA" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];
const CREATED_OPTIONS = [
  { value: "all", label: "Any created date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

interface AccountFiltersBarProps {
  filters: AccountFilters;
  setFilter: <K extends keyof AccountFilters>(key: K, value: AccountFilters[K]) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}

export function AccountFiltersBar({ filters, setFilter, hasActiveFilters, onClear }: AccountFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <Dropdown
        value={filters.accountStatus}
        onChange={(v) => setFilter("accountStatus", v as AccountFilters["accountStatus"])}
        options={ACCOUNT_OPTIONS}
        width="w-40"
      />
      <Dropdown
        value={filters.plan}
        onChange={(v) => setFilter("plan", v)}
        options={PLAN_OPTIONS}
        width="w-40"
      />
      <Dropdown
        value={filters.subStatus}
        onChange={(v) => setFilter("subStatus", v as AccountFilters["subStatus"])}
        options={SUB_OPTIONS}
        width="w-44"
      />
      <Dropdown
        value={filters.mfa}
        onChange={(v) => setFilter("mfa", v as AccountFilters["mfa"])}
        options={MFA_OPTIONS}
        width="w-36"
      />
      <Dropdown
        value={filters.created}
        onChange={(v) => setFilter("created", v as AccountFilters["created"])}
        options={CREATED_OPTIONS}
        width="w-44"
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-[12px] font-medium border-none bg-transparent cursor-pointer px-2 py-2 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" /> Clear filters
        </button>
      )}
    </div>
  );
}
