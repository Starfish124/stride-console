import test from "node:test";
import assert from "node:assert/strict";

import { pendingBriefs } from "../lib/seo/agent.ts";

function brief(suggestedSlug, locale, opportunity) {
  return {
    id: `br_${suggestedSlug}_${locale}`,
    clusterId: "cl_1",
    locale,
    primaryKeyword: suggestedSlug.replace(/-/g, " "),
    secondaryKeywords: [],
    intent: "informational",
    template: "explainer",
    role: "spoke",
    wordCountTarget: 1200,
    internalLinks: [],
    suggestedSlug,
    opportunity,
    createdAt: "2026-07-26T00:00:00.000Z",
  };
}

// The expensive failure this guards: writeArticle is a long-form Claude CLI
// call with a 12-minute budget. Rewriting a brief that already has a draft
// costs that much again and lands a duplicate, because saveArticle keys on id
// and every run mints a new one.
test("a brief whose article already exists is not written again", () => {
  const out = pendingBriefs(
    [brief("wat-is-ai-consultant", "nl", 57)],
    new Set(["wat-is-ai-consultant:nl"]),
    3,
  );

  assert.deepEqual(out, [], "the writer must not run for an already-written brief");
});

test("the same slug in another locale is still a gap worth writing", () => {
  // Keywords are per-locale, so a Dutch article existing says nothing about
  // whether the English one does.
  const out = pendingBriefs(
    [brief("wat-is-ai-consultant", "en", 57)],
    new Set(["wat-is-ai-consultant:nl"]),
    3,
  );

  assert.equal(out.length, 1);
  assert.equal(out[0].locale, "en");
});

test("written briefs do not eat the limit", () => {
  // Filtering before the slice is what makes the Monday run write three NEW
  // articles rather than three slots mostly spent on finished work.
  const out = pendingBriefs(
    [
      brief("done-one", "nl", 90),
      brief("done-two", "nl", 80),
      brief("fresh-one", "nl", 70),
      brief("fresh-two", "nl", 60),
    ],
    new Set(["done-one:nl", "done-two:nl"]),
    2,
  );

  assert.deepEqual(
    out.map((b) => b.suggestedSlug),
    ["fresh-one", "fresh-two"],
  );
});

test("the queue stays ordered by opportunity", () => {
  const out = pendingBriefs(
    [brief("low", "nl", 10), brief("high", "nl", 90), brief("mid", "nl", 50)],
    new Set(),
    3,
  );

  assert.deepEqual(
    out.map((b) => b.suggestedSlug),
    ["high", "mid", "low"],
  );
});
