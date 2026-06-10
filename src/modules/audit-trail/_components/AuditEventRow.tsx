"use client";

import { useState } from "react";
import { UserCircle, Hash, Copy, ChevronRight, ChevronDown, Check } from "lucide-react";
import type { AuditLog } from "@prisma/client";
import { roleLabel } from "@/lib/labels/roles";

export type Severity = "critical" | "status_change" | "create" | "other";

interface Props {
  event: AuditLog;
  severity: Severity;
  /** Pre-formatted action label, e.g. "CAPA Closed". The label-formatting
   *  rules live in the parent so all the acronym fixups (CAPA, FDA, RCA…)
   *  stay in one place rather than getting duplicated per row. */
  actionLabel: string;
  /** Pre-formatted relative-or-absolute timestamp ("3m ago" / "12 May 2026 09:31"). */
  timestampLabel: string;
  /** Full ISO timestamp for the <time dateTime=…> attribute. */
  timestampIso: string;
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical:      "bg-(--status-blocked)",
  status_change: "bg-(--status-waiting)",
  create:        "bg-(--status-done)",
  other:         "bg-(--status-pending)",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical:      "Critical",
  status_change: "Status change",
  create:        "Create",
  other:         "Other event",
};

/** "qa_head" → "QA Head", "regulatory_affairs" → "Regulatory Affairs".
 *  Short tokens (≤3 chars) get fully-uppercased because they're acronyms
 *  more often than not in this product (QA, QC, IT, CDO, RA). */
function truncateMiddle(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 1) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
}

export function AuditEventRow({ event, severity, actionLabel, timestampLabel, timestampIso }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasDiff = !!(event.oldValue || event.newValue);

  const copyRecordId = async () => {
    if (!event.recordId) return;
    try {
      await navigator.clipboard.writeText(event.recordId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently skip; the id is also visible inline */
    }
  };

  return (
    <li className="px-6 py-3 hover:bg-(--bg-hover) group transition-colors">
      <div className="flex items-start gap-3">
        {/* Severity dot — visual + screen-reader accessible. The dot alone is
            colour-only, so the visually-hidden span carries the same signal
            for SR users. */}
        <div className="mt-1.5 flex flex-col items-center">
          <span
            className={`h-2.5 w-2.5 rounded-full ring-2 ring-(--card) shadow-sm shrink-0 ${SEVERITY_DOT[severity]}`}
            aria-hidden="true"
          />
          <span className="sr-only">{SEVERITY_LABEL[severity]}</span>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: module · action  +  timestamp on the right */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-medium text-[13px] text-(--text-primary) leading-tight">
              <span className="font-mono text-[12px] text-(--brand)">{event.module}</span>
              <span className="mx-1.5 text-(--text-muted)" aria-hidden="true">·</span>
              <span>{actionLabel}</span>
            </div>
            <time
              dateTime={timestampIso}
              className="text-[11px] font-mono text-(--text-muted) shrink-0 leading-tight"
              title={timestampIso}
            >
              {timestampLabel}
            </time>
          </div>

          {/* Bottom row: who · record · expand toggle */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--text-secondary) leading-tight">
            <span className="inline-flex items-center gap-1.5">
              <UserCircle className="h-3.5 w-3.5 text-(--text-muted)" aria-hidden="true" />
              <span className="font-medium text-(--text-primary)">{event.userName}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-(--bg-elevated) text-(--text-secondary)">
                {event.userRole ? roleLabel(event.userRole) : "—"}
              </span>
            </span>

            {event.recordId && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-(--text-muted)" title={event.recordId}>
                <Hash className="h-3 w-3" aria-hidden="true" />
                <span>{truncateMiddle(event.recordId, 8, 4)}</span>
                <button
                  type="button"
                  onClick={copyRecordId}
                  aria-label={copied ? "Record ID copied" : "Copy record ID to clipboard"}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity border-none bg-transparent cursor-pointer p-0.5 -my-0.5 text-(--text-muted) hover:text-(--brand)"
                >
                  {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                </button>
              </span>
            )}

            {event.recordTitle && (
              <span className="truncate max-w-[280px] text-(--text-muted)" title={event.recordTitle}>
                {event.recordTitle}
              </span>
            )}

            {hasDiff && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={`audit-diff-${event.id}`}
                className="inline-flex items-center gap-1 text-(--brand) hover:underline border-none bg-transparent cursor-pointer p-0 font-medium"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                )}
                {expanded ? "Hide change" : "View change"}
              </button>
            )}
          </div>

          {/* Expanded value diff — collapsed by default. Renders side-by-side
              before/after so the regulator can scan the delta without
              hunting through two rows. Empty side gets a "—" rather than a
              blank pane. */}
          {expanded && hasDiff && (
            <div
              id={`audit-diff-${event.id}`}
              className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5 rounded-md bg-(--bg-elevated) border border-(--card-border) text-[11px]"
            >
              <div>
                <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">Before</div>
                <pre className="font-mono text-(--danger) whitespace-pre-wrap break-all m-0">
                  {event.oldValue ?? "—"}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">After</div>
                <pre className="font-mono text-(--success) whitespace-pre-wrap break-all m-0">
                  {event.newValue ?? "—"}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
