// One grid derived from six stores. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendar,
  byDay,
  day,
  monthGrid,
  overdue,
  upcoming,
} from "../lib/calendar.ts";

const TODAY = "2026-07-28";

function client(overrides = {}) {
  return {
    id: "client_1",
    name: "Pieter Bakker",
    company: "Bakker Logistiek",
    stage: "talking",
    touches: [],
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

test("a client's next step becomes an actionable entry", () => {
  const entries = buildCalendar(
    { clients: [client({ nextStep: "2026-08-04", nextStepNote: "Send the proposal" })] },
    TODAY,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "followUp");
  assert.equal(entries[0].date, "2026-08-04");
  assert.equal(entries[0].title, "Send the proposal");
  assert.equal(entries[0].actionable, true);
  assert.equal(entries[0].href, "/clients/client_1");
});

test("a past client stops nagging even with a next step still set", () => {
  const entries = buildCalendar(
    { clients: [client({ stage: "past", nextStep: "2026-08-04" })] },
    TODAY,
  );
  assert.equal(entries.filter((e) => e.kind === "followUp").length, 0);
});

test("history is on the grid but never actionable", () => {
  const entries = buildCalendar(
    {
      clients: [
        client({
          touches: [{ id: "touch_1", at: "2026-07-20T14:00:00.000Z", note: "Called them" }],
        }),
      ],
    },
    TODAY,
  );
  assert.equal(entries[0].kind, "touch");
  assert.equal(entries[0].date, "2026-07-20");
  assert.equal(entries[0].actionable, false);
});

test("an unticked prep item is owed, a ticked one is not", () => {
  const entries = buildCalendar(
    {
      events: [
        {
          id: "event_1",
          title: "1 Min AI Pitch",
          date: "2026-09-10",
          venue: "Amsterdam",
          capacity: 60,
          createdAt: "2026-07-01T09:00:00.000Z",
          checklist: [
            { id: "item_1", label: "Venue confirmed.", due: "2026-07-20", done: true },
            { id: "item_2", label: "Invites out.", due: "2026-07-25", done: false },
          ],
        },
      ],
    },
    TODAY,
  );
  const prep = entries.filter((e) => e.kind === "prep");
  assert.deepEqual(
    prep.map((p) => p.actionable),
    [false, true],
  );
  // The one still owed is the one that is both actionable and behind us.
  assert.deepEqual(
    overdue(entries, TODAY).map((e) => e.title),
    ["Invites out."],
  );
});

test("an event that has already happened is no longer actionable", () => {
  const past = buildCalendar(
    {
      events: [
        {
          id: "event_1",
          title: "Old night",
          date: "2026-07-01",
          venue: "Utrecht",
          capacity: 40,
          createdAt: "2026-06-01T09:00:00.000Z",
          checklist: [],
        },
      ],
    },
    TODAY,
  );
  assert.equal(past.find((e) => e.kind === "event").actionable, false);
});

test("the licence lapse lands on the grid as a deadline", () => {
  const entries = buildCalendar({ licenceExpiry: "2026-08-09" }, TODAY);
  assert.equal(entries[0].kind, "deadline");
  assert.equal(entries[0].actionable, true);
});

test("entries come back oldest first, whatever order the stores were in", () => {
  const entries = buildCalendar(
    {
      clients: [client({ nextStep: "2026-09-01" })],
      licenceExpiry: "2026-08-09",
      signups: [
        { id: "signup_1", name: "Ana", startup: "Bureau", idea: "Routing", at: "2026-07-02T10:00:00.000Z" },
      ],
    },
    TODAY,
  );
  assert.deepEqual(
    entries.map((e) => e.date),
    ["2026-07-02", "2026-08-09", "2026-09-01"],
  );
});

test("a yyyy-mm-dd date is not shifted by a timezone", () => {
  // The date inputs write plain days and the store writes ISO timestamps.
  // Both have to land on the same square.
  assert.equal(day("2026-08-04"), "2026-08-04");
  assert.equal(day("2026-08-04T23:30:00.000Z"), "2026-08-04");
  assert.equal(day(undefined), "");
  assert.equal(day("not a date"), "");
});

test("the month grid starts on a Monday and covers the whole month", () => {
  // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
  const squares = monthGrid(2026, 7);
  assert.equal(squares[0], "2026-07-27");
  assert.equal(squares.length % 7, 0);
  assert.ok(squares.includes("2026-08-01"));
  assert.ok(squares.includes("2026-08-31"));
});

test("upcoming starts at today and includes it", () => {
  const entries = buildCalendar(
    {
      clients: [
        client({ id: "client_1", nextStep: TODAY }),
        client({ id: "client_2", nextStep: "2026-07-01" }),
      ],
    },
    TODAY,
  );
  const ahead = upcoming(entries, TODAY);
  assert.deepEqual(
    ahead.map((e) => e.date),
    [TODAY],
  );
});

test("byDay groups every entry that shares a square", () => {
  const entries = buildCalendar(
    {
      clients: [
        client({ id: "client_1", nextStep: "2026-08-04" }),
        client({ id: "client_2", nextStep: "2026-08-04" }),
      ],
    },
    TODAY,
  );
  assert.equal(byDay(entries).get("2026-08-04").length, 2);
});
