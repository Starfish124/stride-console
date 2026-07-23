// Feedback memory: the log becomes lessons only when the data is real.
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { samplesFrom, lessonsFromSamples } from "../lib/pipeline/memory.ts";

function draftStub(id, recipe, hook, length) {
  const body = `${hook}\n\n${"x".repeat(Math.max(0, length - hook.length - 2))}`;
  return {
    id,
    recipe,
    variants: { page: body, founderA: body, founderB: body },
  };
}

function logEntry(draftId, recipe, destination, stats) {
  return {
    draftId,
    recipe,
    destination,
    who: "Founder A",
    at: "2026-07-20T09:00:00.000Z",
    stats: { comments: 0, saves: 0, recordedAt: "2026-07-22T09:00:00.000Z", ...stats },
  };
}

test("entries without stats or without a draft are ignored", () => {
  const drafts = [draftStub("d1", "tldr", "Week 29 in 7 lines.", 1400)];
  const log = [
    { draftId: "d1", recipe: "tldr", destination: "page", who: "A", at: "" },
    logEntry("missing", "news", "page", { impressions: 900, reactions: 10 }),
    logEntry("d1", "tldr", "page", { impressions: 500, reactions: 5 }),
  ];
  const samples = samplesFrom(log, drafts);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].impressions, 500);
  assert.equal(samples[0].hook, "Week 29 in 7 lines.");
});

test("too little data means no lessons, honestly", () => {
  const drafts = [draftStub("d1", "tldr", "Week 29 in 7 lines.", 1400)];
  const log = [logEntry("d1", "tldr", "page", { impressions: 900, reactions: 12 })];
  assert.deepEqual(lessonsFromSamples(samplesFrom(log, drafts)), []);
});

test("hooks with a number outperforming produces that lesson", () => {
  const drafts = [
    draftStub("d1", "tldr", "Week 29 in 7 lines.", 1400),
    draftStub("d2", "tldr", "Week 30 in 6 lines.", 1400),
    draftStub("d3", "tldr", "The quiet release worth your attention.", 1400),
    draftStub("d4", "tldr", "What operators missed this week.", 1400),
  ];
  const log = [
    logEntry("d1", "tldr", "page", { impressions: 2000, reactions: 30 }),
    logEntry("d2", "tldr", "page", { impressions: 1800, reactions: 25 }),
    logEntry("d3", "tldr", "page", { impressions: 700, reactions: 8 }),
    logEntry("d4", "tldr", "page", { impressions: 650, reactions: 9 }),
  ];
  const lessons = lessonsFromSamples(samplesFrom(log, drafts));
  assert.ok(
    lessons.some((l) => l.includes("Hooks with a number")),
    `lessons were: ${JSON.stringify(lessons)}`,
  );
});

test("a gap under 25 percent stays silent", () => {
  const drafts = [
    draftStub("d1", "tldr", "Week 29 in 7 lines.", 1400),
    draftStub("d2", "tldr", "Week 30 in 6 lines.", 1400),
    draftStub("d3", "tldr", "The quiet release worth your attention.", 1400),
    draftStub("d4", "tldr", "What operators missed this week.", 1400),
  ];
  const log = [
    logEntry("d1", "tldr", "page", { impressions: 1000, reactions: 10 }),
    logEntry("d2", "tldr", "page", { impressions: 1050, reactions: 10 }),
    logEntry("d3", "tldr", "page", { impressions: 1000, reactions: 10 }),
    logEntry("d4", "tldr", "page", { impressions: 980, reactions: 10 }),
  ];
  const lessons = lessonsFromSamples(samplesFrom(log, drafts));
  assert.equal(
    lessons.some((l) => l.includes("Hooks")),
    false,
    `lessons were: ${JSON.stringify(lessons)}`,
  );
});

test("never more than 5 lessons", () => {
  const drafts = [];
  const log = [];
  const recipes = ["tldr", "news", "myth"];
  for (let i = 0; i < 12; i++) {
    const recipe = recipes[i % 3];
    const hook = i % 2 === 0 ? `Result ${i}: 6 hours back.` : "The week that mattered.";
    const dest = i % 2 === 0 ? "founderA" : "page";
    const length = i % 2 === 0 ? 1300 : 1900;
    drafts.push(draftStub(`d${i}`, recipe, hook, length));
    log.push(
      logEntry(`d${i}`, recipe, dest, {
        impressions: i % 2 === 0 ? 3000 + i * 100 : 500 + i * 10,
        reactions: 10,
        saves: recipe === "myth" ? 8 : 1,
      }),
    );
  }
  const lessons = lessonsFromSamples(samplesFrom(log, drafts));
  assert.ok(lessons.length <= 5, `got ${lessons.length}`);
  assert.ok(lessons.length >= 3, `got ${lessons.length}: ${JSON.stringify(lessons)}`);
});
