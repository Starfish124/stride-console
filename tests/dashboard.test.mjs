// The front page's five figures. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStats,
  compact,
  euros,
  medianEngagement,
  postsThisMonth,
} from "../lib/dashboard.ts";

const NOW = new Date("2026-07-28T10:00:00.000Z");

function client(overrides = {}) {
  return {
    id: "client_1",
    name: "Pieter",
    company: "Bakker",
    stage: "talking",
    touches: [],
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

function post(at, stats) {
  return { draftId: `d_${at}`, recipe: "tldr", destination: "page", who: "Jort", at, stats };
}

const BASE = {
  clients: [],
  postLog: [],
  owed: 0,
  queued: 0,
  running: 0,
  siteScore: null,
  pages: 0,
  drafts: 0,
  awaitingApproval: 0,
};

test("in play counts the open stages and never the won or lost ones", () => {
  const stats = buildStats(
    {
      ...BASE,
      clients: [
        client({ id: "a", stage: "lead", value: 1000 }),
        client({ id: "b", stage: "talking", value: 2000 }),
        client({ id: "c", stage: "proposal", value: 3000 }),
        client({ id: "d", stage: "client", value: 50_000 }),
        client({ id: "e", stage: "past", value: 90_000 }),
      ],
    },
    NOW,
  );
  assert.equal(stats[0].value, "€6,000");
});

test("an unreachable Linked Helper prints a dash, not a zero", () => {
  const stats = buildStats({ ...BASE, queued: null, running: null }, NOW);
  const lh = stats.find((s) => s.label === "Queued on LinkedIn");
  assert.equal(lh.value, "—");
  assert.match(lh.note, /out of reach/i);
});

test("a reachable Linked Helper with nothing queued really is zero", () => {
  const stats = buildStats({ ...BASE, queued: 0, running: 0 }, NOW);
  assert.equal(stats.find((s) => s.label === "Queued on LinkedIn").value, "0");
});

test("one running campaign is not one campaigns", () => {
  const one = buildStats({ ...BASE, queued: 5, running: 1 }, NOW);
  assert.equal(one.find((s) => s.label === "Queued on LinkedIn").note, "1 campaign running");
  const two = buildStats({ ...BASE, queued: 5, running: 2 }, NOW);
  assert.equal(two.find((s) => s.label === "Queued on LinkedIn").note, "2 campaigns running");
});

test("an unaudited site prints a dash rather than a score of zero", () => {
  const stats = buildStats({ ...BASE, siteScore: null }, NOW);
  assert.equal(stats.find((s) => s.label === "Site score").value, "—");
});

test("owed carries a tone and an icon, so the state is not colour alone", () => {
  const clear = buildStats({ ...BASE, owed: 0 }, NOW).find((s) => s.label === "Owed a reply");
  assert.equal(clear.tone, "good");
  assert.ok(clear.icon);

  const late = buildStats({ ...BASE, owed: 3 }, NOW).find((s) => s.label === "Owed a reply");
  assert.equal(late.tone, "warn");
  assert.ok(late.icon);
});

test("posts this month ignores last month and next month", () => {
  const log = [
    post("2026-06-30T10:00:00.000Z"),
    post("2026-07-01T10:00:00.000Z"),
    post("2026-07-28T10:00:00.000Z"),
    post("2026-08-01T10:00:00.000Z"),
  ];
  assert.equal(postsThisMonth(log, NOW), 2);
});

test("engagement needs three measured posts before it claims a rate", () => {
  const two = [
    post("2026-07-01T10:00:00.000Z", { impressions: 100, reactions: 10, comments: 0, saves: 0, recordedAt: "" }),
    post("2026-07-02T10:00:00.000Z", { impressions: 100, reactions: 20, comments: 0, saves: 0, recordedAt: "" }),
  ];
  assert.equal(medianEngagement(two), null);
});

test("engagement uses the median, so one runaway post does not set the rate", () => {
  const log = [
    post("2026-07-01T10:00:00.000Z", { impressions: 100, reactions: 2, comments: 0, saves: 0, recordedAt: "" }),
    post("2026-07-02T10:00:00.000Z", { impressions: 100, reactions: 3, comments: 0, saves: 0, recordedAt: "" }),
    post("2026-07-03T10:00:00.000Z", { impressions: 100, reactions: 91, comments: 0, saves: 0, recordedAt: "" }),
  ];
  // The mean would be 32%. The typical post is 3%.
  assert.equal(medianEngagement(log), 3);
});

test("a post with no impressions cannot divide by zero", () => {
  const log = [
    post("2026-07-01T10:00:00.000Z", { impressions: 0, reactions: 5, comments: 0, saves: 0, recordedAt: "" }),
    post("2026-07-02T10:00:00.000Z", { impressions: 100, reactions: 4, comments: 0, saves: 0, recordedAt: "" }),
    post("2026-07-03T10:00:00.000Z", { impressions: 100, reactions: 6, comments: 0, saves: 0, recordedAt: "" }),
  ];
  // Two measurable posts left, which is under the floor.
  assert.equal(medianEngagement(log), null);
});

test("big numbers compact and small ones do not", () => {
  assert.equal(compact(870), "870");
  assert.equal(compact(1284), "1,284");
  assert.equal(compact(12_900), "12.9k");
  assert.equal(compact(120_000), "120k");
  assert.equal(compact(2_400_000), "2.4m");
  assert.equal(euros(6000), "€6,000");
  assert.equal(euros(45_000), "€45k");
});

test("every tile links somewhere, because a number you cannot act on is decoration", () => {
  for (const stat of buildStats(BASE, NOW)) {
    assert.ok(stat.href.startsWith("/"), `${stat.label} has no destination`);
    assert.ok(stat.value.length > 0);
    assert.ok(stat.note.length > 0);
  }
});
