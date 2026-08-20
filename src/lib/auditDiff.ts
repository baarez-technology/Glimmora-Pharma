/**
 * Shared field-level diff helper for audit writes (ALCOA+ / 21 CFR Part 11
 * §11.10(e): "record changes shall not obscure previously recorded
 * information").
 *
 * An audit row that says only "Deviation updated" does not satisfy §11.10(e) —
 * the previously recorded value has to survive the change. This module computes
 * the before/after pairs an update action should attach to its AuditLog row.
 *
 * Extracted from the pattern already proven in src/actions/findings.ts
 * (DIFF_FIELDS + normalizeForDiff + the `changes` flatMap). That call site keeps
 * its own FindingEdit append-only trail — this helper only covers the AuditLog
 * side, which is the part every other module was missing.
 *
 * Pure — no Prisma, no React, no server-only imports — so it is safe to pull
 * into a "use server" action file and into a unit test alike. Matches the
 * plain-TS convention of src/lib/reference.ts (no deps).
 */

/** One field's before/after pair, as serialised into AuditLog.newValue. */
export interface AuditFieldChange {
  /** Human label ("Due date"), NOT the column name — this is read by an auditor. */
  field: string;
  oldValue: string;
  newValue: string;
}

/** A field to diff: the record key plus the label an auditor should see. */
export interface AuditDiffField<K extends string = string> {
  key: K;
  label: string;
  /** Optional per-field formatter; defaults to `defaultNormalize`. */
  normalize?: (value: unknown) => string;
}

/**
 * Default value → string coercion for diffing.
 *
 * null/undefined both collapse to "" so that "unset → unset" is not reported as
 * a change, and Dates render as YYYY-MM-DD (a Date object and the ISO string the
 * form submits must compare equal, or every save would report a spurious date
 * change).
 */
export function defaultNormalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Date-only normaliser for columns whose incoming form value is an ISO string. */
export function normalizeDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Compute the before/after pairs for an update.
 *
 * Only fields PRESENT in `updates` are considered — a partial (PATCH-shaped)
 * update must not report every absent field as "changed to empty". A field whose
 * normalised old and new values are equal is dropped, so a no-op save produces an
 * empty array rather than noise in the trail.
 *
 * Long values are truncated to `maxValueLength` (default 500) with an ellipsis:
 * a 50KB description edit must not write a 100KB audit row. The truncation is
 * visible in the value itself so a reader can tell the trail is abbreviated and
 * go to the record for the full text.
 */
export function computeAuditDiff(
  before: Record<string, unknown>,
  updates: Record<string, unknown>,
  fields: readonly AuditDiffField[],
  maxValueLength = 500,
): AuditFieldChange[] {
  const clip = (s: string) =>
    s.length > maxValueLength ? `${s.slice(0, maxValueLength)}…[truncated]` : s;

  return fields.flatMap(({ key, label, normalize }) => {
    if (!(key in updates) || updates[key] === undefined) return [];
    const fn = normalize ?? defaultNormalize;
    const oldValue = fn(before[key]);
    const newValue = fn(updates[key]);
    if (oldValue === newValue) return [];
    return [{ field: label, oldValue: clip(oldValue), newValue: clip(newValue) }];
  });
}

/**
 * Build the `{ oldValue, newValue }` pair to spread onto an AuditLog.create
 * `data` block.
 *
 * AuditLog has two dedicated columns (oldValue / newValue) AND callers that
 * stringify a JSON payload into newValue. This keeps both readable: the columns
 * carry a compact "Field: a → b; Field2: c → d" summary that renders directly in
 * the Audit Trail table, and `extra` is merged into the structured newValue JSON
 * for callers that already carry a payload (reason-for-change, access basis).
 *
 * Returns `null` when nothing changed, so a caller can decide whether to write a
 * row at all.
 */
export function auditDiffPayload(
  changes: AuditFieldChange[],
  extra?: Record<string, unknown>,
): { oldValue: string; newValue: string } | null {
  if (changes.length === 0 && !extra) return null;
  return {
    oldValue: changes.map((c) => `${c.field}: ${c.oldValue || "—"}`).join("; "),
    newValue: JSON.stringify({
      ...(extra ?? {}),
      changedFields: changes.map((c) => c.field),
      changes,
    }),
  };
}
