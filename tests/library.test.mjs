// Library aggregation: drafts joined with the post log. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLibrary,
  librarySummary,
  monthLabel,
  matchesQuery,
  matchesFilters,
} from "../lib/library.ts";

function draft(id, overrides = {}) {
  return {
    id,
    recipe: "tldr",
    createdAt: "2026-07-20T09:00:00.000Z",
    status: "draft",
    needsPolish: false,
    variants: { page: "Body text.", founderA: "", founderB: "" },
    hashtags: ["#AI"],
    imageHeadline: "Headline.",
    items: [],
    weekNumber: 30,
    lint: {},
    renders: { images: [] },
    posted: [],
    sourceReport: [],
    ...overrides,
  };
}

function logEntry(draftId, overrides = {}) {
  return {
    draftId,
    recipe: "tldr",
    destination: "page",
    who: "Jort",
    at: "2026-07-21T10:00:00.000Z",
    ...overrides,
  };
}

test("buildLibrary joins postings and sums recorded stats per draft", () => {
  const drafts = [draft("d1", { status: "posted" }), draft("d2")];
  const log = [
    logEntry("d1", {
      stats: { impressions: 900, reactions: 30, comments: 4, saves: 2, recordedAt: "x" },
    }),
    logEntry("d1", {
      destination: "founderA",
      stats: { impressions: 100, reactions: 10, comments: 1, saves: 0, recordedAt: "x" },
    }),
  ];
  const lib = buildLibrary(drafts, log);
  const d1 = lib.find((e) => e.draft.id === "d1");
  assert.equal(d1.postings.length, 2);
  assert.equal(d1.impressions, 1000);
  assert.equal(d1.reactions, 40);
  const d2 = lib.find((e) => e.draft.id === "d2");
  assert.equal(d2.postings.length, 0);
  assert.equal(d2.impressions, undefined);
});

test("buildLibrary sorts newest first", () => {
  const lib = buildLibrary(
    [
      draft("old", { createdAt: "2026-06-01T00:00:00.000Z" }),
      draft("new", { createdAt: "2026-07-01T00:00:00.000Z" }),
    ],
    [],
  );
  assert.deepEqual(
    lib.map((e) => e.draft.id),
    ["new", "old"],
  );
});

test("posting without stats leaves impressions undefined, not zero", () => {
  const lib = buildLibrary([draft("d1", { status: "posted" })], [logEntry("d1")]);
  assert.equal(lib[0].postings.length, 1);
  assert.equal(lib[0].impressions, undefined);
});

test("librarySummary counts statuses and finds the best performer", () => {
  const lib = buildLibrary(
    [
      draft("a", { status: "posted" }),
      draft("b", { status: "posted" }),
      draft("c", { status: "approved" }),
      draft("d"),
    ],
    [
      logEntry("a", {
        stats: { impressions: 500, reactions: 5, comments: 0, saves: 0, recordedAt: "x" },
      }),
      logEntry("b", {
        stats: { impressions: 2100, reactions: 50, comments: 9, saves: 3, recordedAt: "x" },
      }),
    ],
  );
  const s = librarySummary(lib);
  assert.equal(s.total, 4);
  assert.equal(s.posted, 2);
  assert.equal(s.approved, 1);
  assert.equal(s.impressions, 2600);
  assert.equal(s.bestDraftId, "b");
  assert.equal(s.bestImpressions, 2100);
});

test("librarySummary with no stats reports zero impressions and no best", () => {
  const s = librarySummary(buildLibrary([draft("a")], []));
  assert.equal(s.impressions, 0);
  assert.equal(s.bestDraftId, undefined);
});

test("monthLabel shelves by month", () => {
  assert.equal(monthLabel("2026-07-23T12:00:00.000Z"), "July 2026");
  assert.equal(monthLabel("2026-01-02T00:00:00.000Z"), "January 2026");
});

test("matchesQuery searches text, hashtags, and recipe label", () => {
  const [entry] = buildLibrary(
    [draft("d1", { variants: { page: "Agents are eating SaaS.", founderA: "", founderB: "" } })],
    [],
  );
  assert.ok(matchesQuery(entry, "eating saas"));
  assert.ok(matchesQuery(entry, "#ai"));
  assert.ok(matchesQuery(entry, "TLDR"));
  assert.ok(matchesQuery(entry, ""));
  assert.ok(!matchesQuery(entry, "quantum"));
});

test("matchesFilters narrows by recipe and status", () => {
  const [entry] = buildLibrary([draft("d1", { status: "approved" })], []);
  assert.ok(matchesFilters(entry, "all", "all"));
  assert.ok(matchesFilters(entry, "tldr", "approved"));
  assert.ok(!matchesFilters(entry, "news", "all"));
  assert.ok(!matchesFilters(entry, "all", "posted"));
});

test("the events filter folds all four event recipes into one chip", () => {
  const lib = buildLibrary(
    [draft("a", { recipe: "eventAnnounce" }), draft("b", { recipe: "eventRecap" }), draft("c")],
    [],
  );
  const eventIds = lib
    .filter((e) => matchesFilters(e, "events", "all"))
    .map((e) => e.draft.id)
    .sort();
  assert.deepEqual(eventIds, ["a", "b"]);
});
