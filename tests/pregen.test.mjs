// Pregen scheduling decisions. Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { recipeForDay, hasDraftForWeek } from "../lib/pipeline/pregen.ts";
import { isoWeek } from "../lib/pipeline/source.ts";

// 2026-07-20 is a Monday, 2026-07-22 a Wednesday, 2026-07-23 a Thursday.
const MONDAY = new Date("2026-07-20T07:30:00");
const WEDNESDAY = new Date("2026-07-22T07:30:00");
const THURSDAY = new Date("2026-07-23T07:30:00");

function draftStub(recipe, createdAt, weekNumber) {
  return { id: `draft_${recipe}`, recipe, createdAt, weekNumber };
}

test("Monday runs the TLDR, Wednesday the news, other days nothing", () => {
  assert.equal(recipeForDay(MONDAY), "tldr");
  assert.equal(recipeForDay(WEDNESDAY), "news");
  assert.equal(recipeForDay(THURSDAY), undefined);
});

test("a draft from the same ISO week blocks a second run", () => {
  const drafts = [
    draftStub("tldr", MONDAY.toISOString(), isoWeek(MONDAY)),
  ];
  assert.ok(hasDraftForWeek(drafts, "tldr", WEDNESDAY));
});

test("a different recipe in the same week does not block", () => {
  const drafts = [
    draftStub("tldr", MONDAY.toISOString(), isoWeek(MONDAY)),
  ];
  assert.equal(hasDraftForWeek(drafts, "news", WEDNESDAY), false);
});

test("last week's draft does not block this week", () => {
  const lastMonday = new Date("2026-07-13T07:30:00");
  const drafts = [
    draftStub("tldr", lastMonday.toISOString(), isoWeek(lastMonday)),
  ];
  assert.equal(hasDraftForWeek(drafts, "tldr", MONDAY), false);
});

test("the same week number a year earlier does not block", () => {
  const yearAgo = new Date("2025-07-21T07:30:00");
  const drafts = [
    draftStub("tldr", yearAgo.toISOString(), isoWeek(MONDAY)),
  ];
  assert.equal(hasDraftForWeek(drafts, "tldr", MONDAY), false);
});
