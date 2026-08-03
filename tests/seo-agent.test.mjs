import test from "node:test";
import assert from "node:assert/strict";

import { dutchTwinBrief, pendingBriefs, withDemand } from "../lib/seo/agent.ts";

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

// ---- the demand gate ----
//
// Why this exists: after the good briefs are written, the top of the queue
// fills with leftovers that score well and mean nothing — "bureau ai company",
// "yuvi ai consultant" (a person's name), "ai bureau eu". All three were about
// to be written and auto-published to the live site on the morning of a client
// demo, because opportunity is guessed until Search Console has data.

function keyword(term, locale, extra = {}) {
  return {
    id: `kw_${term}`,
    term,
    locale,
    intent: "commercial",
    discoveredVia: "autocomplete",
    discoveredAt: "2026-08-01T00:00:00.000Z",
    opportunity: 50,
    ...extra,
  };
}

test("a term nobody has been measured searching is not evidence", () => {
  const b = brief("yuvi-ai-consultant", "nl", 57);
  const { writable, held } = withDemand([b], [keyword("yuvi ai consultant", "nl")]);
  assert.equal(writable.length, 0);
  assert.match(held[0].why, /never measured/);
});

test("measured impressions are evidence", () => {
  const b = brief("ai-agent-pricing", "en", 51);
  const kw = keyword("ai agent pricing", "en", {
    stats: { clicks: 0, impressions: 40, ctr: 0, position: 14, measuredAt: "2026-08-05T00:00:00.000Z" },
  });
  assert.equal(withDemand([b], [kw]).writable.length, 1);
});

test("a handful of impressions is not enough to spend a writer run on", () => {
  const b = brief("ai-agent-pricing", "en", 51);
  const kw = keyword("ai agent pricing", "en", {
    stats: { clicks: 0, impressions: 2, ctr: 0, position: 60, measuredAt: "2026-08-05T00:00:00.000Z" },
  });
  const { writable, held } = withDemand([b], [kw]);
  assert.equal(writable.length, 0);
  assert.match(held[0].why, /only 2 impressions/);
  // The floor is a judgement, so it is adjustable rather than baked in.
  assert.equal(withDemand([b], [kw], { minImpressions: 1 }).writable.length, 1);
});

test("a term Search Console itself reported is evidence, with or without numbers", () => {
  // Somebody typed it to reach the site. That is the strongest signal there is.
  const b = brief("ai-bureau-utrecht", "nl", 40);
  const kw = keyword("ai bureau utrecht", "nl", { discoveredVia: "search-console" });
  assert.equal(withDemand([b], [kw]).writable.length, 1);
});

test("evidence is per locale, because a Dutch measurement is not an English one", () => {
  const en = brief("ai-consultant", "en", 50);
  const nlKeyword = keyword("ai consultant", "nl", {
    stats: { clicks: 5, impressions: 500, ctr: 0.01, position: 8, measuredAt: "2026-08-05T00:00:00.000Z" },
  });
  assert.equal(withDemand([en], [nlKeyword]).writable.length, 0);
});
