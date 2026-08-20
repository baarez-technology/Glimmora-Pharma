import test from "node:test";
import assert from "node:assert/strict";
import {
  isTrainingOverdue,
  trainingDisplayStatus,
  isSelfAcknowledgement,
  isTrainingStatus,
} from "./training";

const NOW = new Date("2026-06-15T12:00:00.000Z");

test("past due and not complete is overdue", () => {
  assert.equal(isTrainingOverdue({ dueDate: "2026-06-01", status: "pending" }, NOW), true);
  assert.equal(isTrainingOverdue({ dueDate: new Date("2026-06-01"), status: "in_progress" }, NOW), true);
});

test("a completed record is never overdue, even when completed late", () => {
  // Lateness is recoverable from completedAt vs dueDate. Flagging a finished
  // record as outstanding would misstate the training position to an inspector.
  assert.equal(isTrainingOverdue({ dueDate: "2026-01-01", status: "completed" }, NOW), false);
});

test("no due date means never overdue", () => {
  assert.equal(isTrainingOverdue({ dueDate: null, status: "pending" }, NOW), false);
  assert.equal(isTrainingOverdue({ dueDate: undefined, status: "pending" }, NOW), false);
});

test("a future due date is not overdue", () => {
  assert.equal(isTrainingOverdue({ dueDate: "2026-12-31", status: "pending" }, NOW), false);
});

test("an unparseable due date does not report overdue", () => {
  // Fail open rather than flagging a data problem as a compliance lapse.
  assert.equal(isTrainingOverdue({ dueDate: "garbage", status: "pending" }, NOW), false);
});

test("extending the due date clears overdue — the reason it is derived", () => {
  const record = { dueDate: "2026-06-01", status: "pending" };
  assert.equal(isTrainingOverdue(record, NOW), true);
  assert.equal(isTrainingOverdue({ ...record, dueDate: "2026-09-01" }, NOW), false);
});

test("display status surfaces the derived Overdue over the stored one", () => {
  assert.equal(trainingDisplayStatus({ dueDate: "2026-06-01", status: "pending" }, NOW), "Overdue");
  assert.equal(trainingDisplayStatus({ dueDate: "2026-12-01", status: "pending" }, NOW), "Assigned");
  assert.equal(trainingDisplayStatus({ dueDate: null, status: "in_progress" }, NOW), "In Progress");
  assert.equal(trainingDisplayStatus({ dueDate: null, status: "completed" }, NOW), "Completed");
});

test("overdue is not a storable status", () => {
  // Storing it would let it go stale the moment a due date moves.
  assert.equal(isTrainingStatus("overdue"), false);
  assert.equal(isTrainingStatus("pending"), true);
  assert.equal(isTrainingStatus("in_progress"), true);
  assert.equal(isTrainingStatus("completed"), true);
});

test("only the trainee's own completion counts as acknowledgement", () => {
  assert.equal(isSelfAcknowledgement("u1", "u1"), true);
  // QA completing on someone's behalf is a completion record, not an attestation.
  assert.equal(isSelfAcknowledgement("qa-head", "u1"), false);
});

test("an unresolved actor is never an acknowledgement", () => {
  // resolveUserFk can hand back a null userId for admin identities; that must
  // never silently satisfy the trainee's own attestation.
  assert.equal(isSelfAcknowledgement(null, "u1"), false);
  assert.equal(isSelfAcknowledgement(undefined, "u1"), false);
  assert.equal(isSelfAcknowledgement("", ""), false);
});
