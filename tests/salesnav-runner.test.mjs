// The sequencer's clock, as pure functions.
//
// Nothing here touches data/. These are the rules that decide whether an email
// leaves at all, and every one of them is a local-time judgement that is wrong
// in UTC, so they are worth pinning separately from the machinery around them.

import test from "node:test";
import assert from "node:assert/strict";

import { isTooLate, nextDueAt, sendWindow, withinWindow } from "../lib/salesnav/config.ts";
import { dueEnrolments } from "../lib/salesnav/runner.ts";

/** A local-time Date, since every rule under test is local by design. */
function at(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// 2026-08-03 is a Monday, 2026-08-08 a Saturday.
const WINDOW = { startMinutes: 8 * 60, endMinutes: 17 * 60 + 30, days: [1, 2, 3, 4, 5], label: "08:00-17:30" };

test("the window opens on the minute and closes on the minute", () => {
  assert.equal(withinWindow(at(2026, 8, 3, 7, 59), WINDOW), false, "one minute early is early");
  assert.equal(withinWindow(at(2026, 8, 3, 8, 0), WINDOW), true, "08:00 is open");
  assert.equal(withinWindow(at(2026, 8, 3, 17, 29), WINDOW), true);
  assert.equal(withinWindow(at(2026, 8, 3, 17, 30), WINDOW), false, "17:30 is shut");
});

test("a Saturday inside the hours is still shut", () => {
  assert.equal(withinWindow(at(2026, 8, 8, 11, 0), WINDOW), false);
  assert.equal(withinWindow(at(2026, 8, 9, 11, 0), WINDOW), false, "and so is a Sunday");
});

test("a broken SALESNAV_WINDOW falls back rather than sending at all hours", (t) => {
  const before = process.env.SALESNAV_WINDOW;
  process.env.SALESNAV_WINDOW = "whenever";
  t.after(() => {
    if (before === undefined) delete process.env.SALESNAV_WINDOW;
    else process.env.SALESNAV_WINDOW = before;
  });
  const w = sendWindow();
  assert.equal(w.startMinutes, 8 * 60);
  assert.equal(w.endMinutes, 17 * 60 + 30);
});

test("three days late is still relevant, four is not", () => {
  const due = at(2026, 8, 3, 9, 0).toISOString();
  assert.equal(isTooLate(due, at(2026, 8, 6, 8, 59), 3), false, "just inside three days");
  assert.equal(isTooLate(due, at(2026, 8, 7, 9, 1), 3), true, "four days after a wake is stale");
});

test("the jitter stays inside its band and never runs backwards", () => {
  const from = at(2026, 8, 3, 9, 0);
  const floor = nextDueAt(from, 2, () => 0);
  const ceiling = nextDueAt(from, 2, () => 0.999999);
  const twoDays = from.getTime() + 2 * 86_400_000;
  assert.equal(new Date(floor).getTime(), twoDays, "no jitter means exactly the wait");
  const added = (new Date(ceiling).getTime() - twoDays) / 60_000;
  assert.ok(added > 0 && added <= 37, `jitter was ${added} minutes`);
});

test("due enrolments come out oldest first, and only the active ones", () => {
  const all = [
    { id: "b", state: "active", dueAt: "2026-08-03T09:00:00.000Z" },
    { id: "a", state: "active", dueAt: "2026-08-01T09:00:00.000Z" },
    { id: "paused", state: "paused", dueAt: "2026-07-01T09:00:00.000Z" },
    { id: "later", state: "active", dueAt: "2026-09-01T09:00:00.000Z" },
  ];
  const due = dueEnrolments(new Date("2026-08-04T00:00:00.000Z"), all);
  assert.deepEqual(due.map((e) => e.id), ["a", "b"], "a backlog drains in the order it built up");
});
