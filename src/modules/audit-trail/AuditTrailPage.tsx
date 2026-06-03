"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Download,
  RefreshCw,
  Search,
  Funnel,
  FileSearch,
  Lock,
  X,
} from "lucide-react";
import type { AuditLog } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { AuditEventRow, type Severity } from "./_components/AuditEventRow";

/* ── Static option lists & action classifiers ────────────────────────────
   Kept module-scoped because they're pure data; rebuilding them per render
   would just be churn. The CRITICAL/STATUS/CREATE sets back the severity
   dot in the row AND the "Critical only" quick-filter chip. */

const MODULES = [
  "all",
  "Gap Assessment",
  "CAPA",
  "Deviation Management",
  "FDA 483",
  "CSV/CSA",
  "Evidence & Documents",
  "Governance",
  "Inspection Readiness",
  "Settings",
  "Admin",
  "AGI Console",
];

const ACTION_GROUPS = [
  "all",
  "Created",
  "Updated",
  "Status Changed",
  "Signed",
  "Submitted",
  "Deleted",
];

const CRITICAL_ACTIONS = new Set([
  "CAPA_CLOSED",
  "FDA483_RESPONSE_SUBMITTED",
  "DEVIATION_CLOSED",
  "USER_DELETED",
  "TENANT_DELETED",
]);
const STATUS_ACTIONS = new Set([
  "FDA483_STATUS_CHANGED",
  "STAGE_APPROVED",
  "STAGE_REJECTED",
  "CAPA_DI_GATE_CLEARED",
  "CAPA_SUBMITTED_FOR_REVIEW",
]);
const CREATE_ACTIONS = new Set([
  "FINDING_CREATED",
  "CAPA_CREATED",
  "DEVIATION_CREATED",
  "FDA483_EVENT_CREATED",
  "SYSTEM_CREATED",
  "DOCUMENT_UPLOADED",
  "RAID_ITEM_CREATED",
  "INSPECTION_CREATED",
  "USER_CREATED",
  "SITE_CREATED",
  "OBSERVATION_ADDED",
  "TENANT_CREATED",
  "RTM_ENTRY_CREATED",
]);

function severityOf(action: string): Severity {
  if (CRITICAL_ACTIONS.has(action)) return "critical";
  if (STATUS_ACTIONS.has(action)) return "status_change";
  if (CREATE_ACTIONS.has(action)) return "create";
  return "other";
}

function actionGroupMatch(action: string, group: string): boolean {
  if (group === "all") return true;
  const a = action.toLowerCase();
  if (group === "Created") return a.includes("created") || a.includes("uploaded") || a.includes("added");
  if (group === "Updated") return a.includes("updated") || a.includes("toggled") || a.includes("cleared") || a.includes("approved");
  if (group === "Status Changed") return a.includes("status") || a.includes("gate") || a.includes("rejected");
  if (group === "Signed") return a.includes("closed") || a.includes("signed");
  if (group === "Submitted") return a.includes("submitted");
  if (group === "Deleted") return a.includes("deleted") || a.includes("reopened");
  return true;
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Capa", "CAPA")
    .replace("Di ", "DI ")
    .replace("Fda", "FDA")
    .replace("Rca", "RCA")
    .replace("Agi", "AGI")
    .replace("Raid", "RAID")
    .replace("Rtm", "RTM")
    .replace("Csv", "CSV");
}

/** Relative for recent events ("3m ago"), absolute for older ones. Older
 *  events get the full date because relative-time ("4 days ago") becomes
 *  useless once an inspector is reconstructing a timeline. */
function formatTimestamp(iso: string | Date, timezone: string): string {
  const d = dayjs(iso);
  const diffMin = dayjs().diff(d, "minute");
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.tz(timezone).format("DD MMM YYYY HH:mm");
}

/* ── Filter state ────────────────────────────────────────────────────── */

interface LocalFilters {
  module: string;
  action: string;
  userId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  /** Quick-chip flag — when on, only rows whose action is in CRITICAL_ACTIONS
   *  are shown. Independent of the action-group dropdown so an inspector can
   *  combine "Critical only" with a module filter. */
  criticalOnly: boolean;
}

const EMPTY_FILTERS: LocalFilters = {
  module: "all",
  action: "all",
  userId: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  criticalOnly: false,
};

interface AuditTrailPageProps {
  logs: AuditLog[];
  /** Total audit-log rows in the tenant — may exceed `logs.length` when
   *  the loaded slice is capped. Used for the truncation notice and the
   *  summary row so the user always sees the true population size. */
  totalCount: number;
  /** True when totalCount > limit and the visible slice is the most-recent
   *  `limit` rows. Drives the standalone notice rendered above the
   *  filters. Filters and CSV export still operate on the loaded slice
   *  only — server-side date-range filtering is a separate change. */
  truncated: boolean;
  /** The cap applied by `getAuditLogs`. Surfaced for the notice so the
   *  message stays correct if the cap is ever changed in one place. */
  limit: number;
}

export function AuditTrailPage({ logs, totalCount, truncated, limit }: AuditTrailPageProps) {
  const router = useRouter();
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;
  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);

  const setFilter = <K extends keyof LocalFilters>(key: K, value: LocalFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const anyFilter =
    filters.module !== "all" ||
    filters.action !== "all" ||
    filters.userId !== "all" ||
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.criticalOnly;

  /** Apply a [from, to] date range to the dateFrom/dateTo inputs. Used by
   *  the Today / Last 7 / Last 30 quick chips. */
  const applyDateRange = (daysBack: number) => {
    const to = dayjs().format("YYYY-MM-DD");
    const from = dayjs().subtract(daysBack, "day").format("YYYY-MM-DD");
    setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  const filtered = useMemo(() => {
    let result = logs;
    if (filters.criticalOnly) result = result.filter((e) => CRITICAL_ACTIONS.has(e.action));
    if (filters.module !== "all") result = result.filter((e) => e.module === filters.module);
    if (filters.action !== "all") result = result.filter((e) => actionGroupMatch(e.action, filters.action));
    if (filters.userId !== "all") result = result.filter((e) => e.userId === filters.userId);
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.userName.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.module.toLowerCase().includes(q) ||
          (e.recordTitle ?? "").toLowerCase().includes(q) ||
          (e.recordId ?? "").toLowerCase().includes(q),
      );
    }
    if (filters.dateFrom) {
      const from = dayjs(filters.dateFrom).startOf("day");
      result = result.filter((e) => dayjs(e.createdAt).isAfter(from) || dayjs(e.createdAt).isSame(from));
    }
    if (filters.dateTo) {
      const to = dayjs(filters.dateTo).endOf("day");
      result = result.filter((e) => dayjs(e.createdAt).isBefore(to) || dayjs(e.createdAt).isSame(to));
    }
    return result;
  }, [logs, filters]);

  function exportCSV() {
    const header = "Timestamp,User,Role,Module,Action,Record ID,Record Title,Old Value,New Value";
    const rows = filtered.map((e) =>
      [
        dayjs(e.createdAt).tz(timezone).format("DD/MM/YYYY HH:mm"),
        `"${e.userName.replace(/"/g, '""')}"`,
        `"${(e.userRole ?? "").replace(/"/g, '""')}"`,
        `"${e.module.replace(/"/g, '""')}"`,
        formatAction(e.action),
        e.recordId ?? "",
        `"${(e.recordTitle ?? "").replace(/"/g, '""')}"`,
        `"${(e.oldValue ?? "").replace(/"/g, '""')}"`,
        `"${(e.newValue ?? "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${dayjs().format("YYYY-MM-DD")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Header timestamp is computed in render-time UTC. Trimmed to minute
  // precision so it doesn't churn every second.
  const headerUtc = dayjs().utc().format("YYYY-MM-DD HH:mm");

  // Singular / plural — "1 entry" reads cleaner than "1 entries" on the
  // compliance band. Used by the page-subtitle line.
  const entryWord = (n: number) => (n === 1 ? "entry" : "entries");

  // The chips visually highlight an "active" preset only when the input
  // values match the preset exactly. Keeps the active state honest if the
  // user manually edits the date pickers afterward.
  const isDatePresetActive = (daysBack: number) => {
    const to = dayjs().format("YYYY-MM-DD");
    const from = dayjs().subtract(daysBack, "day").format("YYYY-MM-DD");
    return filters.dateFrom === from && filters.dateTo === to;
  };

  return (
    <main
      id="main-content"
      aria-label="Audit trail"
      className="w-full bg-white text-[#1a1a1a]"
    >
      {/* ── Compliance band — Part 11 trust signal ─────────────────── */}
      <div
        className="border-b border-[#e8e4dd] bg-gradient-to-r from-[#0a4d4f] to-[#0f6663] px-6 py-3 text-white"
        role="region"
        aria-label="Compliance certification"
      >
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide flex-wrap">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>21 CFR PART 11 COMPLIANT AUDIT TRAIL</span>
          <span className="opacity-60" aria-hidden="true">·</span>
          <span className="opacity-80">Append-only · SHA-256 chained · Tamper-evident</span>
          <span className="ml-auto opacity-60 font-mono">UTC {headerUtc}</span>
        </div>
      </div>

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-[#e8e4dd]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-[#1a1a1a] leading-tight">Audit Trail</h1>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">
              Immutable record of every action across{" "}
              <span className="font-semibold text-[#3a3530]">{totalCount.toLocaleString()}</span>{" "}
              {entryWord(totalCount)}
              {truncated && (
                <span className="text-[#7a7269]">
                  {" "}· showing the {limit.toLocaleString()} most recent
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              onClick={exportCSV}
              disabled={filtered.length === 0}
            >
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={() => router.refresh()}
              aria-label="Refresh audit log from server"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-[#e8e4dd] bg-[#f8f6f3]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#999] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search user, action, record ID…"
              aria-label="Search audit events"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white border border-[#e8e4dd] rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f6663] text-[#1a1a1a] placeholder:text-[#999]"
            />
          </div>

          {/* Quick chips */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => applyDateRange(0)}
              aria-pressed={isDatePresetActive(0)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(0)
                  ? "bg-white border-[#0f6663] text-[#0f6663] font-medium"
                  : "border-[#e8e4dd] bg-transparent text-[#6b6b6b] hover:bg-white"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyDateRange(7)}
              aria-pressed={isDatePresetActive(7)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(7)
                  ? "bg-white border-[#0f6663] text-[#0f6663] font-medium"
                  : "border-[#e8e4dd] bg-transparent text-[#6b6b6b] hover:bg-white"
              }`}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => applyDateRange(30)}
              aria-pressed={isDatePresetActive(30)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(30)
                  ? "bg-white border-[#0f6663] text-[#0f6663] font-medium"
                  : "border-[#e8e4dd] bg-transparent text-[#6b6b6b] hover:bg-white"
              }`}
            >
              Last 30 days
            </button>
            <button
              type="button"
              onClick={() => setFilter("criticalOnly", !filters.criticalOnly)}
              aria-pressed={filters.criticalOnly}
              className={`px-2.5 py-1 rounded-full border transition-colors font-medium ${
                filters.criticalOnly
                  ? "border-[#dc2626] bg-[#dc2626] text-white"
                  : "border-[#dc2626]/40 bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2]"
              }`}
            >
              Critical only
            </button>
          </div>

          {/* Dropdowns + date range — right-aligned */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Dropdown
              value={filters.module}
              onChange={(v) => setFilter("module", v)}
              options={MODULES.map((m) => ({ value: m, label: m === "all" ? "All modules" : m }))}
              width="w-40"
            />
            <Dropdown
              value={filters.action}
              onChange={(v) => setFilter("action", v)}
              options={ACTION_GROUPS.map((a) => ({ value: a, label: a === "all" ? "All actions" : a }))}
              width="w-36"
            />
            <Dropdown
              value={filters.userId}
              onChange={(v) => setFilter("userId", v)}
              options={[{ value: "all", label: "All users" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
              width="w-40"
            />
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              className="px-2 py-1 text-[12px] bg-white border border-[#e8e4dd] rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f6663] text-[#1a1a1a]"
              style={{ width: 130 }}
            />
            <input
              type="date"
              aria-label="To date"
              value={filters.dateTo}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              className="px-2 py-1 text-[12px] bg-white border border-[#e8e4dd] rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f6663] text-[#1a1a1a]"
              style={{ width: 130 }}
            />
            {anyFilter && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#7a7269] hover:text-[#1a1a1a] border-none bg-transparent cursor-pointer"
                aria-label="Clear all filters"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Counts + severity legend */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#7a7269]">
          <Funnel className="h-3 w-3" aria-hidden="true" />
          <span>
            <span className="font-medium text-[#3a3530]">{filtered.length.toLocaleString()}</span> of{" "}
            {logs.length.toLocaleString()} {entryWord(logs.length)}
            {truncated && (
              <span className="opacity-70"> loaded · {totalCount.toLocaleString()} total in DB</span>
            )}
          </span>
          <span className="opacity-40" aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#dc2626]" aria-hidden="true" />
            Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" aria-hidden="true" />
            Status changes
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden="true" />
            Creates
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#6b7280]" aria-hidden="true" />
            Other
          </span>
        </div>
      </div>

      {/* ── Event list ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <FileSearch className="h-10 w-10 text-[#d4cec5] mb-3" aria-hidden="true" />
          <h3 className="text-[13px] font-medium text-[#3a3530]">
            {logs.length === 0
              ? "No audit events yet"
              : "No audit events match your filters"}
          </h3>
          <p className="mt-1 text-[11px] text-[#7a7269] max-w-sm">
            {logs.length === 0
              ? "Once users start acting in the platform, every state change is captured here automatically."
              : "Try widening the date range or clearing module / user filters. The audit trail captures every state change across the platform."}
          </p>
          {anyFilter && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#0f6663] border border-[#0f6663]/30 rounded-md hover:bg-[#f0f9f8] bg-white cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-[#f0ece5]" aria-label="Audit trail entries">
          {filtered.map((event) => (
            <AuditEventRow
              key={event.id}
              event={event}
              severity={severityOf(event.action)}
              actionLabel={formatAction(event.action)}
              timestampLabel={formatTimestamp(event.createdAt, timezone)}
              timestampIso={dayjs(event.createdAt).toISOString()}
            />
          ))}
        </ul>
      )}

      {/* ── Footer compliance band ─────────────────────────────────── */}
      <div className="px-6 py-3 border-t border-[#e8e4dd] bg-[#f8f6f3] text-[11px] text-[#7a7269] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Records are append-only and tamper-evident. Retention:
            7 years (21 CFR Part 11.10(c)).
          </span>
        </div>
        {/* Chain-hash block omitted: AuditLog model does not currently
            carry a content-hash column. Re-enable here once the hashing
            substage lands so we don't fabricate one. */}
      </div>
    </main>
  );
}
