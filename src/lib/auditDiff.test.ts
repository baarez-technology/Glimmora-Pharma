import test from "node:test";
import assert from "node:assert/strict";
import { computeAuditDiff, auditDiffPayload, defaultNormalize, normalizeDate } from "./auditDiff";

const FIELDS = [
  { key: "title", label: "Title" },
  { key: "dueDate", label: "Due date", normalize: normalizeDate },
  { key: "owner", label: "Owner" },
] as const;

test("reports only fields present in the update", () => {
  // A partial update must not report absent fields as "changed to empty" — that
  // is the whole difference between a PATCH and a PUT, and getting it wrong
  // would fill the trail with changes nobody made.
  const changes = computeAuditDiff(
    { title: "Old", owner: "alice", dueDate: new Date("2026-01-01") },
    { title: "New" },
    FIELDS,
  );
  assert.deepEqual(changes, [{ field: "Title", oldValue: "Old", newValue: "New" }]);
});

test("drops no-op edits", () => {
  const changes = computeAuditDiff({ title: "Same" }, { title: "Same" }, FIELDS);
  assert.deepEqual(changes, []);
});

test("a Date pre-image and an ISO-string update compare equal", () => {
  // The DB hands back a Date; the form submits a string. Without a shared
  // normaliser every save would report a spurious due-date change.
  const changes = computeAuditDiff(
    { dueDate: new Date("2026-03-04T00:00:00.000Z") },
    { dueDate: "2026-03-04" },
    FIELDS,
  );
  assert.deepEqual(changes, []);
});

test("null and undefined both read as empty, not as a change", () => {
  const changes = computeAuditDiff({ owner: null }, { owner: "" }, FIELDS);
  assert.deepEqual(changes, []);
  assert.equal(defaultNormalize(null), "");
  assert.equal(defaultNormalize(undefined), "");
});

test("setting a previously-empty field IS a change, with an empty old value", () => {
  const changes = computeAuditDiff({ owner: null }, { owner: "bob" }, FIELDS);
  assert.deepEqual(changes, [{ field: "Owner", oldValue: "", newValue: "bob" }]);
});

test("long values are truncated so one edit cannot write a huge audit row", () => {
  const long = "x".repeat(900);
  const changes = computeAuditDiff({ title: "short" }, { title: long }, FIELDS, 100);
  assert.equal(changes.length, 1);
  assert.ok(changes[0].newValue.endsWith("…[truncated]"));
  // The marker must be visible, so a reader knows to go to the record itself.
  assert.ok(changes[0].newValue.length < 200);
});

test("an invalid date normalises to empty rather than 'Invalid Date'", () => {
  assert.equal(normalizeDate("not-a-date"), "");
  assert.equal(normalizeDate(""), "");
});

test("payload carries a readable old value and the structured changes", () => {
  const changes = computeAuditDiff({ title: "A", owner: "x" }, { title: "B", owner: "y" }, FIELDS);
  const payload = auditDiffPayload(changes, { reason: "typo" });
  assert.ok(payload);
  assert.equal(payload.oldValue, "Title: A; Owner: x");
  const parsed = JSON.parse(payload.newValue);
  assert.equal(parsed.reason, "typo");
  assert.deepEqual(parsed.changedFields, ["Title", "Owner"]);
  assert.equal(parsed.changes.length, 2);
});

test("an empty old value renders as an em dash in the summary column", () => {
  const changes = computeAuditDiff({ owner: null }, { owner: "bob" }, FIELDS);
  const payload = auditDiffPayload(changes);
  assert.ok(payload);
  // "was blank" must not look identical to "we captured nothing".
  assert.equal(payload.oldValue, "Owner: —");
});

test("no changes and no extra means no payload — the caller can skip the row", () => {
  assert.equal(auditDiffPayload([]), null);
});

test("a reason with no field changes still produces a payload", () => {
  // A reason-only save changes no field but must still be recorded.
  const payload = auditDiffPayload([], { reason: "clarified scope" });
  assert.ok(payload);
  assert.deepEqual(JSON.parse(payload.newValue).changedFields, []);
});
