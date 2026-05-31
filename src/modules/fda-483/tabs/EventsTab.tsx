import clsx from "clsx";
import {
  FileWarning,
  Inbox,
  CircleDot,
  Clock,
  AlertCircle,
  ClipboardList,
  Plus,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { FDA483Event, EventStatus } from "@/types/fda483";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  daysUntil,
  getEffectiveEventStatus,
} from "../_shared";

/* ── Helpers ── */

// Thin wrappers around the central _shared helpers so existing call
// sites in this file don't need rewriting.
function daysLeft(d: string): number {
  return daysUntil(d) ?? 0;
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  return getEffectiveEventStatus(e.status, e.responseDeadline);
}

// Blue accent for the "Open" state — there is no blue design token in the
// palette (the warm-neutral token set covers amber/green/red only), so this
// one semantic colour is a literal. Everything else uses tokens.
const OPEN_BLUE = "#1f4e8c";

interface Site {
  id: string;
  name: string;
}

export interface EventsTabProps {
  events: FDA483Event[];
  filteredEvents: FDA483Event[];
  openCount: number;
  dueCount: number;
  closedCount: number;
  typeFilter: string;
  agencyFilter: string;
  statusFilter: string;
  siteFilter: string;
  anyFilter: boolean;
  sites: Site[];
  timezone: string;
  dateFormat: string;
  role: string;
  onTypeFilterChange: (v: string) => void;
  onAgencyFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onSiteFilterChange: (v: string) => void;
  onClearFilters: () => void;
  onOpenEvent: (e: FDA483Event) => void;
  onAddEvent: () => void;
  computeReadiness: (e: FDA483Event) => number;
}

/* ── Stat tile (local, list-view only) ─────────────────────────────── */

function StatTile({
  icon: Icon,
  iconColor,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: typeof Inbox;
  iconColor: string;
  label: string;
  value: number;
  valueColor: string;
  sub: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex flex-col rounded-xl border p-6 shadow-sm"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--bg-border)",
      }}
    >
      <Icon className="w-5 h-5" strokeWidth={2} style={{ color: iconColor }} aria-hidden="true" />
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.05em] mt-2"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-[32px] font-semibold leading-none mt-3"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <span className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
        {sub}
      </span>
    </div>
  );
}

export function EventsTab({
  events,
  filteredEvents,
  openCount,
  dueCount,
  closedCount,
  typeFilter,
  agencyFilter,
  statusFilter,
  siteFilter,
  anyFilter,
  sites,
  timezone,
  dateFormat,
  role,
  onTypeFilterChange,
  onAgencyFilterChange,
  onStatusFilterChange,
  onSiteFilterChange,
  onClearFilters,
  onOpenEvent,
  onAddEvent,
  computeReadiness,
}: EventsTabProps) {
  const totalObs = events.reduce((s, e) => s + e.observations.length, 0);

  return (
    <>
      {/* ── PART A — Stat tile strip ── */}
      <section
        aria-label="Event statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 auto-rows-fr"
      >
        <StatTile
          icon={Inbox}
          iconColor="var(--text-secondary)"
          label="Total events"
          value={events.length}
          valueColor="var(--text-primary)"
          sub={events.length === 0 ? "Log first event" : `${closedCount} closed`}
        />
        <StatTile
          icon={CircleDot}
          iconColor={openCount > 0 ? OPEN_BLUE : "var(--text-muted)"}
          label="Open"
          value={openCount}
          valueColor={openCount > 0 ? OPEN_BLUE : "var(--text-muted)"}
          sub={openCount > 0 ? "Require action" : "All clear"}
        />
        <StatTile
          icon={AlertCircle}
          iconColor={dueCount > 0 ? "var(--danger)" : "var(--text-muted)"}
          label="Response due"
          value={dueCount}
          valueColor={dueCount > 0 ? "var(--danger)" : "var(--text-muted)"}
          sub={dueCount > 0 ? "15-day deadline" : "Nothing pending"}
        />
        <StatTile
          icon={ClipboardList}
          iconColor="var(--brand)"
          label="Total observations"
          value={totalObs}
          valueColor="var(--brand)"
          sub="Across all events"
        />
      </section>

      {/* ── PART B — Filter zone ── */}
      <div
        className="rounded-xl border px-5 py-4 mb-4"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="text-[13px] font-medium shrink-0"
            style={{ color: "var(--text-secondary)" }}
          >
            Filter by:
          </span>
          <Dropdown
            placeholder="All types"
            value={typeFilter}
            onChange={onTypeFilterChange}
            width="w-40"
            className={clsx(typeFilter && "rounded-lg ring-1 ring-(--brand)")}
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
            placeholder="All agencies"
            value={agencyFilter}
            onChange={onAgencyFilterChange}
            width="w-36"
            className={clsx(agencyFilter && "rounded-lg ring-1 ring-(--brand)")}
            options={[
              { value: "", label: "All agencies" },
              ...["FDA", "EMA", "MHRA", "WHO"].map((a) => ({ value: a, label: a })),
            ]}
          />
          <Dropdown
            placeholder="All statuses"
            value={statusFilter}
            onChange={onStatusFilterChange}
            width="w-40"
            className={clsx(statusFilter && "rounded-lg ring-1 ring-(--brand)")}
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
            className={clsx(siteFilter && "rounded-lg ring-1 ring-(--brand)")}
            options={[
              { value: "", label: "All sites" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              showing {filteredEvents.length} of {events.length} results
            </span>
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── PART C — Event cards ── */}
      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <FileWarning
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            No regulatory events logged yet
          </p>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            Log FDA 483 observations, Warning Letters and EMA/MHRA inspection
            findings to track responses and commitments.
          </p>
          {role !== "viewer" && (
            <Button variant="primary" size="sm" icon={Plus} onClick={onAddEvent}>
              Log first event
            </Button>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No events match the current filters
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((ev) => {
            const days = daysLeft(ev.responseDeadline);
            const effectiveStatus = getEffectiveStatus(ev);
            const isClosed =
              effectiveStatus === "Closed" || effectiveStatus === "Response Submitted";
            const obsCount = ev.observations.length;
            const rcaDone = ev.observations.filter((o) => !!o.rootCause?.trim()).length;
            const readiness = computeReadiness(ev);
            const siteName = sites.find((s) => s.id === ev.siteId)?.name ?? "—";

            // Days chip tone (Zone 1, right).
            let chipColor = "var(--text-secondary)";
            let chipWeight = 400;
            if (!isClosed) {
              if (days < 0) {
                chipColor = "var(--danger)";
                chipWeight = 600;
              } else if (days <= 5) {
                chipColor = "var(--danger)";
                chipWeight = 500;
              } else if (days <= 15) {
                chipColor = "var(--brand)";
                chipWeight = 500;
              }
            }
            const chipLabel =
              days < 0
                ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
                : days === 0
                  ? "Due today"
                  : `${days} day${days === 1 ? "" : "s"}`;

            // Status dot (Zone 2, left).
            let dotSymbol = "◐";
            let dotColor = "var(--brand)";
            if (
              effectiveStatus === "Response Submitted" ||
              effectiveStatus === "FDA Acknowledged" ||
              effectiveStatus === "Closed"
            ) {
              dotSymbol = "●";
              dotColor = "var(--success)";
            } else if (effectiveStatus === "Open") {
              dotSymbol = "○";
              dotColor = OPEN_BLUE;
            }

            // Stage cells (Zone 3).
            const respCell =
              ev.status === "Response Submitted" ||
              ev.status === "FDA Acknowledged" ||
              ev.status === "Closed"
                ? { text: "Submitted", color: "var(--success)" }
                : ev.status === "Response Drafted" ||
                    ev.status === "Pending QA Sign-off" ||
                    !!ev.responseDraft?.trim()
                  ? { text: "Drafted", color: "var(--brand)" }
                  : { text: "—", color: "var(--text-muted)" };
            const cells: { label: string; text: string; color: string }[] = [
              { label: "Event", text: "✓", color: "var(--success)" },
              obsCount === 0
                ? { label: "Observations", text: "—", color: "var(--text-muted)" }
                : { label: "Observations", text: `${obsCount}`, color: "var(--success)" },
              obsCount === 0
                ? { label: "RCA", text: "—", color: "var(--text-muted)" }
                : rcaDone === obsCount
                  ? { label: "RCA", text: `${rcaDone}/${obsCount} ✓`, color: "var(--success)" }
                  : rcaDone > 0
                    ? { label: "RCA", text: `${rcaDone}/${obsCount}`, color: "var(--brand)" }
                    : { label: "RCA", text: `0/${obsCount}`, color: "var(--text-muted)" },
              { label: "Response", text: respCell.text, color: respCell.color },
            ];

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpenEvent(ev)}
                aria-label={`Open ${ev.type} ${ev.referenceNumber}`}
                className={clsx(
                  "group w-full text-left rounded-xl border p-6 shadow-sm",
                  "transition-all duration-150 cursor-pointer",
                  "hover:shadow-md hover:-translate-y-px",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)",
                )}
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--bg-border)",
                }}
              >
                <div className="flex flex-col gap-4">
                  {/* Zone 1 — identity */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p
                        className="text-[18px] font-semibold tabular-nums tracking-[-0.01em]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {ev.referenceNumber}
                      </p>
                      <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {ev.type} · {siteName}
                      </p>
                    </div>
                    {isClosed ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0"
                        style={{ color: "var(--success)" }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Submitted
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[13px] shrink-0"
                        style={{ color: chipColor, fontWeight: chipWeight }}
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        {chipLabel}
                      </span>
                    )}
                  </div>

                  {/* Zone 2 — status + progress */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                        style={{ color: dotColor }}
                      >
                        <span aria-hidden="true">{dotSymbol}</span>
                        {effectiveStatus}
                      </span>
                      <span className="text-[12px]" style={{ color: "var(--brand)" }}>
                        {readiness}% complete
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${readiness}%`,
                          background:
                            "linear-gradient(90deg, var(--brand), var(--brand-hover))",
                        }}
                      />
                    </div>
                  </div>

                  {/* Zone 3 — stage cell grid */}
                  <div
                    className="rounded-lg overflow-hidden border"
                    style={{ borderColor: "var(--bg-border)" }}
                  >
                    <div
                      className="grid grid-cols-2 sm:grid-cols-4 gap-px"
                      style={{ background: "var(--bg-border)" }}
                    >
                      {cells.map((c) => (
                        <div
                          key={c.label}
                          className="p-3 text-center"
                          style={{ background: "var(--bg-elevated)" }}
                        >
                          <p
                            className="text-[11px] font-semibold uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {c.label}
                          </p>
                          <p
                            className="text-[14px] font-medium mt-0.5"
                            style={{ color: c.color }}
                          >
                            {c.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Zone 4 — footer */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Inspection{" "}
                      {dayjs.utc(ev.inspectionDate).tz(timezone).format(dateFormat)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-[14px] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Open
                      <ArrowRight
                        className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
