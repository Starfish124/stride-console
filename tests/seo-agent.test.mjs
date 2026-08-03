import test from "node:test";
import assert from "node:assert/strict";

import { dutchTwinBrief, pendingBriefs } from "../lib/seo/agent.ts";

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

// ---- the Dutch twin ----
//
// Pure function on purpose. An earlier test called the article run directly and
// took 90 seconds, because it fired a real long-form Claude call.

test("the Dutch twin takes its keyword from the store, never a translation", () => {
  const en = brief("ai-agent-pricing", "en", 51);
  const twin = dutchTwinBrief(en, [
    { term: "ai agent kosten", opportunity: 44 },
    { term: "ai agent bouwen", opportunity: 60 },
    { term: "chatbot laten maken", opportunity: 80 },
  ]);
  // "chatbot laten maken" scores highest but shares no words with the brief, so
  // it would be a different article wearing this one's slug.
  assert.equal(twin.primaryKeyword, "ai agent bouwen");
  assert.equal(twin.locale, "nl");
  // Same slug: the article template pairs the two languages by slug.
  assert.equal(twin.suggestedSlug, en.suggestedSlug);
  assert.notEqual(twin.id, en.id);
  assert.ok(twin.secondaryKeywords.includes("ai agent kosten"));
});

test("no Dutch term in the store means no twin, rather than an invented one", () => {
  const en = brief("workflow-automation-software", "en", 49);
  assert.equal(dutchTwinBrief(en, [{ term: "ai consultant inhuren", opportunity: 70 }]), undefined);
  assert.equal(dutchTwinBrief(en, []), undefined);
});

test("a Dutch brief has no twin of its own", () => {
  assert.equal(
    dutchTwinBrief(brief("wat-is-ai-consultant", "nl", 57), [
      { term: "wat is ai consultant", opportunity: 57 },
    ]),
    undefined,
  );
});

test("the twin matcher keeps short words, because 'ai' is one of them", () => {
  // A length filter here would drop "ai" from every keyword this business owns.
  const twin = dutchTwinBrief(brief("ai-consultant", "en", 50), [
    { term: "ai consultant inhuren", opportunity: 66 },
  ]);
  assert.equal(twin.primaryKeyword, "ai consultant inhuren");
});

test("a shared bag of words is not a shared subject", () => {
  // The real pairing this rejects: two words in common, "ai" and "vs", and a
  // completely different article. Counting shared words accepted it.
  assert.equal(
    dutchTwinBrief(brief("workflow-automation-vs-agentic-ai", "en", 49), [
      { term: "ai consultant vs data scientist", opportunity: 70 },
    ]),
    undefined,
  );
  // The same brief with a Dutch term that shares an intact phrase does pair.
  assert.equal(
    dutchTwinBrief(brief("workflow-automation-vs-agentic-ai", "en", 49), [
      { term: "workflow automation uitbesteden", opportunity: 40 },
    ]).primaryKeyword,
    "workflow automation uitbesteden",
  );
});
