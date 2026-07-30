// The front page's five figures. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildQuickMenu,
  buildStats,
  campaignsTile,
  linkedInStat,
  compact,
  euros,
  medianEngagement,
  pipelineStages,
  postsThisMonth,
  sparkPoints,
  weeklyPosts,
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
  const lh = linkedInStat(null, null);
  assert.equal(lh.value, "—");
  assert.match(lh.note, /out of reach/i);
});

test("a reachable Linked Helper with nothing queued really is zero", () => {
  assert.equal(linkedInStat(0, 0).value, "0");
});

test("one running campaign is not one campaigns", () => {
  assert.equal(linkedInStat(5, 1).note, "1 campaign running");
  assert.equal(linkedInStat(5, 2).note, "2 campaigns running");
});

test("the streamed tiles are not in the band or the menu the page renders first", () => {
  // They cost a round trip to the bridge, so the page must be able to paint
  // without them. If either reappears here, the dashboard blocks again.
  assert.equal(
    buildStats(BASE, NOW).find((s) => s.label === "Queued on LinkedIn"),
    undefined,
  );
  assert.equal(
    buildQuickMenu(QUIET).find((t) => t.label === "Campaigns"),
    undefined,
  );
});

test("an unaudited site prints a dash rather than a score of zero", () => {
  const stats = buildStats({ ...BASE, siteScore: null }, NOW);
  assert.equal(stats.find((s) => s.label === "Site score").value, "—");
});

test("won counts only the paying stage, and in play never overlaps it", () => {
  // The band reports measures; what needs a person lives in the quick menu,
  // so no figure is asked to do both jobs.
  const stats = buildStats(
    {
      ...BASE,
      clients: [
        client({ id: "a", stage: "proposal", value: 3000 }),
        client({ id: "b", stage: "client", value: 20_000 }),
        client({ id: "c", stage: "client", value: 5000 }),
        client({ id: "d", stage: "past", value: 90_000 }),
      ],
    },
    NOW,
  );
  const won = stats.find((s) => s.label === "Won");
  assert.equal(won.value, "€25k");
  assert.equal(won.note, "2 paying");
  assert.equal(stats.find((s) => s.label === "In play").value, "€3,000");
});

test("a book nobody has quoted on shows a dash, not nothing owed", () => {
  // Deal size is optional, because it is only known once somebody has said it
  // out loud. Summing an unpriced book gives 0, and "€0 in play" reads as "we
  // have no work on" — the opposite of four clients nobody has quoted yet.
  const stats = buildStats(
    {
      ...BASE,
      clients: [
        client({ id: "a", stage: "proposal" }),
        client({ id: "b", stage: "client" }),
      ],
    },
    NOW,
  );

  assert.equal(stats.find((s) => s.label === "In play").value, "—");
  assert.equal(stats.find((s) => s.label === "Won").value, "—");
  assert.equal(stats.find((s) => s.label === "Won").note, "1 paying");
});

test("one quoted client is enough for the tile to show money again", () => {
  const stats = buildStats(
    {
      ...BASE,
      clients: [
        client({ id: "a", stage: "proposal", value: 4000 }),
        client({ id: "b", stage: "proposal" }),
      ],
    },
    NOW,
  );

  assert.equal(stats.find((s) => s.label === "In play").value, "€4,000");
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

// ---------- the quick menu ----------

const QUIET = {
  replies: 0,
  clients: 0,
  late: 0,
  draftsWaiting: 0,
  seoFindings: 0,
  toBuild: 0,
};

test("every quick tile is a real destination", () => {
  for (const tile of buildQuickMenu(QUIET)) {
    assert.ok(tile.href.startsWith("/"), `${tile.label} goes nowhere`);
    assert.ok(tile.icon, `${tile.label} has no glyph`);
    assert.ok(tile.note.length > 0, `${tile.label} says nothing`);
  }
});

test("an unreachable Linked Helper leaves the campaigns tile unknown", () => {
  const tile = campaignsTile(null);
  assert.equal(tile.count, null);
  assert.match(tile.note, /out of reach/i);
  assert.equal(campaignsTile(2).count, 2);
});

test("warn is reserved for counts a person is holding up", () => {
  // A queue with things in it is work, not a problem. An unanswered reply is.
  const busy = buildQuickMenu({
    ...QUIET,
    clients: 40,
    draftsWaiting: 6,
    seoFindings: 12,
    toBuild: 9,
    replies: 2,
    late: 1,
  });
  const toned = busy.filter((t) => t.tone === "warn").map((t) => t.label);
  assert.deepEqual(toned.sort(), ["Calendar", "Replies"]);
});

test("a clear calendar reads as good, a late one as warn", () => {
  assert.equal(
    buildQuickMenu(QUIET).find((t) => t.label === "Calendar").tone,
    "good",
  );
  assert.equal(
    buildQuickMenu({ ...QUIET, late: 2 }).find((t) => t.label === "Calendar").tone,
    "warn",
  );
});

test("Ask Stride carries no count, because it is a tool and not a queue", () => {
  const ask = buildQuickMenu(QUIET).find((t) => t.label === "Ask Stride");
  assert.equal(ask.count, undefined);
  // Undefined and null mean different things here: no queue versus a queue
  // whose length cannot be read. Only the second one prints a dash.
  assert.notEqual(ask.count, null);
});

test("a tile that carries a tone always carries the words that explain it", () => {
  // The quick menu only prints a note where the tone is set, so a toned tile
  // with an empty note would be a number with nothing saying what it counts.
  const busy = buildQuickMenu({ ...QUIET, replies: 3, late: 2 });
  for (const tile of busy.filter((t) => t.tone)) {
    assert.ok(tile.note.length > 0, `${tile.label} is toned but says nothing`);
  }
});

// ---------- the deck ----------

test("the pipeline leaves out past clients, because past is not a stage", () => {
  const stages = pipelineStages([
    client({ id: "a", stage: "lead", value: 1000 }),
    client({ id: "b", stage: "past", value: 90_000 }),
  ]);
  assert.deepEqual(
    stages.map((s) => s.stage),
    ["lead", "talking", "proposal", "client"],
  );
  assert.equal(stages[0].count, 1);
  assert.equal(stages[0].value, "€1,000");
});

test("a stage nobody has quoted on prints a dash, not nothing owed", () => {
  const stages = pipelineStages([client({ id: "a", stage: "talking" })]);
  const talking = stages.find((s) => s.stage === "talking");
  assert.equal(talking.count, 1);
  assert.equal(talking.value, "—");
  // And an empty stage is the same story: no money has been named.
  assert.equal(stages.find((s) => s.stage === "client").value, "—");
});

test("weekly posts land in the right bucket, newest last", () => {
  const log = [
    post("2026-07-27T10:00:00.000Z"), // this week
    post("2026-07-21T10:00:00.000Z"), // last week
    post("2026-07-20T10:00:00.000Z"), // last week
  ];
  const weeks = weeklyPosts(log, 4, NOW);
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks, [0, 0, 2, 1]);
});

test("an empty log is twelve real zeros, not twelve unknowns", () => {
  const weeks = weeklyPosts([], 12, NOW);
  assert.equal(weeks.length, 12);
  assert.equal(
    weeks.every((n) => n === 0),
    true,
  );
});

test("posts outside the window are not counted anywhere", () => {
  const log = [
    post("2026-01-01T10:00:00.000Z"), // long before
    post("2027-01-01T10:00:00.000Z"), // in the future
    post("not a date"),
  ];
  assert.deepEqual(weeklyPosts(log, 4, NOW), [0, 0, 0, 0]);
});

test("a flat series draws down the middle rather than dividing by zero", () => {
  assert.equal(sparkPoints([2, 2, 2], 48, 12), "0,6 24,6 48,6");
  assert.equal(sparkPoints([], 48, 12), "");
  // A single reading has nowhere to travel, so it sits at the left.
  assert.equal(sparkPoints([5], 48, 12), "0,6");
});

test("a real series runs from the floor to the ceiling of the box", () => {
  const points = sparkPoints([0, 1, 2], 48, 12).split(" ");
  assert.equal(points[0], "0,12");
  assert.equal(points[2], "48,0");
});
