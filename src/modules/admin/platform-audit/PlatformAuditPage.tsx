"use client";

import { useState, useMemo } from "react";
import { Search, X, ScrollText } from "lucide-react";
import type { AuditLog } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/shared/EmptyState";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { PlatformAuditTable, categoryOf } from "./_components/PlatformAuditTable";

interface PlatformAuditPageProps {
  logs: AuditLog[];
  totalCount: number;
  truncated: boolean;
  limit: number;
  tenantMap: Record<string, { code: string | null; name: string }>;
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All events" },
  { value: "Account", label: "Account" },
  { value: "Plan", label: "Plan" },
  { value: "Security", label: "Security" },
  { value: "Other", label: "Other" },
];

export function PlatformAuditPage({ logs, totalCount, truncated, limit, tenantMap }: PlatformAuditPageProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = useMemo(() => {
    const tenantOf = (e: AuditLog): string => {
      const t = e.recordId ? tenantMap[e.recordId] : undefined;
      return t?.code ?? t?.name ?? e.recordTitle ?? "—";
    };
    let r = logs;
    if (category !== "all") r = r.filter((e) => categoryOf(e.action) === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (e) =>
          e.userName.toLowerCase().includes(q) ||
          auditEventLabel(e.action).toLowerCase().includes(q) ||
          tenantOf(e).toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q),
      );
    }
    return r;
  }, [logs, search, category, tenantMap]);

  return (
    <div className="w-full max-w-[1100px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>Platform Audit</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Platform-level events — account, plan, and security changes
        </p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="No platform events yet"
            description="Account, plan, and MFA changes you make from the console will appear here."
          />
        </Card>
      ) : (
        <>
          {/* Filters — search + event-category dropdown */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search events…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg py-2 pl-9 pr-3 text-[13px] outline-none transition-all"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Dropdown value={category} onChange={setCategory} options={CATEGORY_OPTIONS} width="w-44" />
          </div>

          {truncated && (
            <div role="status" className="mb-3 px-3 py-2 rounded-lg text-[12px]" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning)" }}>
              Showing the most recent {limit} of {totalCount} events.
            </div>
          )}

          <Card
            padding="none"
            header={
              <>
                <span className="card-title">Events</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {filtered.length} of {logs.length}
                </span>
              </>
            }
          >
            <PlatformAuditTable rows={filtered} tenantMap={tenantMap} />
          </Card>
        </>
      )}
    </div>
  );
}
