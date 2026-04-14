import clsx from "clsx";
import {
  FileWarning,
  Clock,
  AlertCircle,
  ClipboardList,
  Plus,
  ChevronRight,
  X,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  FDA483Event,
  EventType,
  EventStatus,
} from "@/store/fda483.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function eventTypeBadge(t: EventType) {
  const m: Record<EventType, "red" | "amber" | "blue"> = {
    "FDA 483": "red",
    "Warning Letter": "red",
    "EMA Inspection": "amber",
    "MHRA Inspection": "amber",
    "WHO Inspection": "blue",
  };
  return <Badge variant={m[t]}>{t}</Badge>;
}

function eventStatusBadge(s: EventStatus) {
  const m: Record<EventStatus, "blue" | "red" | "amber" | "green"> = {
    Open: "blue",
    "Response Due": "red",
    "Response Submitted": "amber",
    Closed: "green",
  };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
}

interface Site {
  id: string;
  name: string;
}

export interface EventsTabProps {
  events: FDA483Event[];
  filteredEvents: FDA483Event[];
  selectedEvent: FDA483Event | null;
  openCount: number;
  dueCount: number;
  closedCount: number;
  typeFilter: string;
  statusFilter: string;
  siteFilter: string;
  anyFilter: boolean;
  sites: Site[];
  timezone: string;
  dateFormat: string;
  isDark: boolean;
  role: string;
  onTypeFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onSiteFilterChange: (v: string) => void;
  onClearFilters: () => void;
  onSelectEvent: (e: FDA483Event | null) => void;
  onAddEvent: () => void;
  computeReadiness: (e: FDA483Event) => number;
}

export function EventsTab({
  events,
  filteredEvents,
  selectedEvent,
  openCount,
  dueCount,
  closedCount,
  typeFilter,
  statusFilter,
  siteFilter,
  anyFilter,
  sites,
  timezone,
  dateFormat,
  isDark,
  role,
  onTypeFilterChange,
  onStatusFilterChange,
  onSiteFilterChange,
  onClearFilters,
  onSelectEvent,
  onAddEvent,
  computeReadiness,
}: EventsTabProps) {
  return (
    <>
      {/* Tiles */}
      <section
        aria-label="Event statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <div className="stat-card" role="region" aria-label="Total events">
          <div className="flex items-center gap-2 mb-2">
            <FileWarning
              className="w-5 h-5 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total events</span>
          </div>
          <div className="stat-value">{events.length}</div>
          <div className="stat-sub">
            {events.length === 0
              ? "Log first event"
              : `${closedCount} closed`}
          </div>
        </div>
        <div className="stat-card" role="region" aria-label="Open events">
          <div className="flex items-center gap-2 mb-2">
            <Clock
              className="w-5 h-5"
              style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Open</span>
          </div>
          <div
            className="stat-value"
            style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
          >
            {openCount}
          </div>
          <div className="stat-sub">Require action</div>
        </div>
        <div className="stat-card" role="region" aria-label="Response due">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle
              className="w-5 h-5"
              style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Response due</span>
          </div>
          <div
            className="stat-value"
            style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
          >
            {dueCount}
          </div>
          <div className="stat-sub">
            {dueCount > 0 ? "15-day FDA deadline" : "No overdue"}
          </div>
        </div>
        <div
          className="stat-card"
          role="region"
          aria-label="Total observations"
        >
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList
              className="w-5 h-5 text-[#6366f1]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total observations</span>
          </div>
          <div className="stat-value text-[#6366f1]">
            {events.reduce((s, e) => s + e.observations.length, 0)}
          </div>
          <div className="stat-sub">Across all events</div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown
          placeholder="All types"
          value={typeFilter}
          onChange={onTypeFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All types" },
            ...[
              "FDA 483",
              "Warning Letter",
              "EMA Inspection",
              "MHRA Inspection",
              "WHO Inspection",
            ].map((t) => ({ value: t, label: t })),
          ]}
        />
        <Dropdown
          placeholder="All statuses"
          value={statusFilter}
          onChange={onStatusFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All statuses" },
            ...["Open", "Response Due", "Response Submitted", "Closed"].map(
              (s) => ({ value: s, label: s }),
            ),
          ]}
        />
        <Dropdown
          placeholder="All sites"
          value={siteFilter}
          onChange={onSiteFilterChange}
          width="w-36"
          options={[
            { value: "", label: "All sites" },
            ...sites.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Event cards */}
      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <FileWarning
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "#334155" }}
            aria-hidden="true"
          />
          <p
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No regulatory events logged yet
          </p>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Log FDA 483 observations, Warning Letters and EMA/MHRA inspection
            findings to track responses and commitments.
          </p>
          {role !== "viewer" && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={onAddEvent}
            >
              Log first event
            </Button>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p
            className="text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            No events match the current filters
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((ev) => {
            const days = daysLeft(ev.responseDeadline);
            const isOverdue = days < 0;
            const isUrgent = days >= 0 && days <= 5;
            return (
              <div
                key={ev.id}
                className={clsx(
                  "card cursor-pointer transition-all duration-150 hover:border-[#0ea5e9]",
                  selectedEvent?.id === ev.id &&
                    (isDark
                      ? "border-[#0ea5e9] bg-[#071e38]"
                      : "border-[#0ea5e9] bg-[#eff6ff]"),
                )}
                onClick={() => onSelectEvent(ev)}
                role="button"
                aria-expanded={selectedEvent?.id === ev.id}
                aria-label={`${ev.type} ${ev.referenceNumber}`}
              >
                <div className="card-body">
                  {/* Top */}
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {eventTypeBadge(ev.type)}
                      {eventStatusBadge(getEffectiveStatus(ev))}
                      <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">
                        {ev.referenceNumber}
                      </span>
                    </div>
                    <div
                      className={clsx(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium",
                        isOverdue
                          ? "bg-[rgba(239,68,68,0.12)] text-[#ef4444]"
                          : isUrgent
                            ? "bg-[rgba(245,158,11,0.12)] text-[#f59e0b]"
                            : "bg-[rgba(16,185,129,0.12)] text-[#10b981]",
                      )}
                    >
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {isOverdue
                        ? `${Math.abs(days)} days overdue`
                        : days === 0
                          ? "Due today"
                          : `${days} days remaining`}
                    </div>
                  </div>
                  {/* Info row */}
                  <div
                    className="flex items-center gap-4 mt-2 flex-wrap text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>
                      {sites.find((s) => s.id === ev.siteId)?.name ??
                        "\u2014"}
                    </span>
                    <span>{ev.agency}</span>
                    <span>
                      {dayjs
                        .utc(ev.inspectionDate)
                        .tz(timezone)
                        .format(dateFormat)}
                    </span>
                  </div>

                  {/* Response readiness progress */}
                  {(() => {
                    const readiness = computeReadiness(ev);
                    const col = readiness >= 100 ? "#10b981" : readiness >= 80 ? "#f59e0b" : readiness >= 41 ? "#f59e0b" : "#ef4444";
                    return (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>Readiness</span>
                        <div className={clsx("h-1.5 flex-1 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${readiness}%`, background: col }} />
                        </div>
                        <span className="text-[11px] font-bold shrink-0" style={{ color: col }}>{readiness}%</span>
                      </div>
                    );
                  })()}
                  {/* Open / Close action */}
                  <div className="flex justify-end gap-2 mt-3">
                    {selectedEvent?.id === ev.id ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={X}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(null);
                        }}
                        aria-label="Deselect event"
                      >
                        Deselect
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={ChevronRight}
                        iconPosition="right"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                      >
                        Open event
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
