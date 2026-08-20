"use client";

/**
 * Per-record audit trail — one collapsible panel, reusable across modules.
 *
 * Modelled on CAPA's CapaAuditTrailBar (a collapsed <details> pinned under the
 * record) but generalised, so Deviation, CSV/CSA and anything after them get the
 * surface without a third hand-rolled variant. FDA 483 keeps its own full-width
 * Audit TAB — that module's spec calls for day-grouping and its own export menu,
 * and downgrading it to this panel would be a regression.
 *
 * Read-only by construction: it renders rows and offers no mutation. The
 * authoritative, tenant-wide, exportable trail remains the Audit Trail module —
 * this answers "what happened to THIS record" without making a user filter a
 * tenant-wide log they may not even have access to.
 *
 * Renders the previously-recorded value when the writer captured one. That is
 * the point of the §11.10(e) work behind this: a trail that shows only "Updated"
 * is not a trail of what changed.
 */

import { History } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import type { RecordAuditRow } from "@/lib/queries/recordAudit";

/** One before/after pair as serialised by src/lib/auditDiff.ts. */
interface ParsedChange {
  field: string;
  oldValue: string;
  newValue: string;
}

/**
 * Pull the structured payload out of AuditLog.newValue.
 *
 * newValue is a free string: some writers store JSON, others a bare value like
 * "Critical". Both must render — so a parse failure is a normal outcome, not an
 * error, and falls back to showing the raw string.
 */
function parsePayload(newValue: string | null): { changes: ParsedChange[]; reason: string | null; summary: string | null } {
  if (!newValue) return { changes: [], reason: null, summary: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(newValue);
  } catch {
    // Not JSON — a bare value like "Critical". Show it as-is.
    return { changes: [], reason: null, summary: newValue };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { changes: [], reason: null, summary: String(parsed) };
  }
  const obj = parsed as Record<string, unknown>;
  const changes = Array.isArray(obj.changes) ? (obj.changes as ParsedChange[]) : [];
  const reason = typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : null;

  // Structured payloads that are NOT field diffs (a reassignment, a decision,
  // a signature) still carry facts worth showing. Rather than dumping raw JSON
  // at an auditor, render the scalar keys that are not already displayed
  // elsewhere on the row. Objects/arrays are skipped — they belong in the full
  // Audit Trail export, not in a summary line.
  const SKIP = new Set(["reason", "changes", "changedFields"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue;
    // camelCase key -> "Camel case" so the line reads as text, not as code.
    const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
    parts.push(`${label}: ${String(v)}`);
  }
  return { changes, reason, summary: parts.length > 0 ? parts.join(" · ") : null };
}

export function RecordAuditTrail({
  rows,
  timezone,
  dateFormat = "DD MMM YYYY",
  title = "Audit trail",
  defaultOpen = false,
}: {
  rows: RecordAuditRow[];
  timezone: string;
  dateFormat?: string;
  title?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="mt-5 rounded-lg border"
      style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
    >
      <summary
        className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        <History className="w-3.5 h-3.5" aria-hidden="true" />
        {title} ({rows.length})
      </summary>
      <div className="px-3 pb-2 max-h-80 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-[11px] italic py-2" style={{ color: "var(--text-muted)" }}>
            No audit entries yet.
          </p>
        ) : (
          <ul className="list-none p-0 m-0">
            {rows.map((r) => {
              const { changes, reason, summary } = parsePayload(r.newValue);
              return (
                <li
                  key={r.id}
                  className="py-1.5 border-b last:border-b-0"
                  style={{ borderColor: "var(--bg-border)" }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {dayjs.utc(r.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}
                    </span>
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {auditEventLabel(r.action)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {r.userName}
                      {r.userRole ? ` (${roleLabel(r.userRole)})` : ""}
                    </span>
                  </div>

                  {/* Before → after. The whole reason the diff work exists. */}
                  {changes.length > 0 && (
                    <ul className="list-none p-0 m-0 mt-0.5 pl-3">
                      {changes.map((c, i) => (
                        <li key={`${r.id}-${i}`} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--text-muted)" }}>{c.field}:</span>{" "}
                          {/* An empty previous value is shown as an em dash, not
                              as nothing — "was blank" and "we didn't capture it"
                              must not look the same. */}
                          <s style={{ color: "var(--text-muted)" }}>{c.oldValue || "—"}</s>{" "}
                          <span aria-hidden="true">→</span> {c.newValue || "—"}
                        </li>
                      ))}
                    </ul>
                  )}

                  {reason && (
                    <p className="text-[11px] mt-0.5 pl-3 italic" style={{ color: "var(--text-secondary)" }}>
                      Reason: {reason}
                    </p>
                  )}

                  {/* Everything else the writer recorded: a bare value, or the
                      scalar facts of a structured payload that is not a diff. */}
                  {summary && changes.length === 0 && (
                    <p className="text-[11px] mt-0.5 pl-3" style={{ color: "var(--text-secondary)" }}>
                      {r.oldValue ? `${r.oldValue} → ` : ""}
                      {summary}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
