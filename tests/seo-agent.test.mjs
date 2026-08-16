import test from "node:test";
import assert from "node:assert/strict";

import {
  dutchTwinBrief,
  floorCandidates,
  pendingBriefs,
  withDemand,
} from "../lib/seo/agent.ts";

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

// ---------- the daily floor ----------

// The failure this guards is a quiet one: the run exits 0, the log says
// "nothing written, which costs nothing", and the blog has a gap in it. That
// was correct while Search Console had no data. It is not correct now that an
// article a day is the standing rule, and the floor is what makes the
// difference — it only ever picks from what the demand gate HELD, so a day
// with real measured demand behaves exactly as it did before.
test("the floor falls back to held briefs when nothing has measured demand", () => {
  const held = [
    { brief: brief("enterprise-ai-chatbot-development-cost", "en", 42), why: "never measured" },
  ];
  const out = floorCandidates(held);
  assert.equal(out.length, 1, "a day with no measured demand still has something to publish");
});

test("the floor never reaches for a place-targeted brief", () => {
  // The geo hold refuses to auto-publish these however clean they read, so
  // spending the day's attempt on one leaves the day empty anyway — the
  // article gets written, held for a person, and nothing goes live.
  const held = [{ brief: brief("ai-consultant-barcelona", "nl", 51), why: "never measured" }];
  assert.deepEqual(floorCandidates(held), []);
});

test("the floor never reaches for a brief the discovery filter would reject today", () => {
  // Briefs outlive the filters that let them in. "ai speakers bureau" was
  // queued before OFF_BRAND knew the phrase, and the floor is precisely the
  // mechanism that would publish somebody else's speaker agency unattended.
  const held = [{ brief: brief("ai-speakers-bureau", "nl", 51), why: "never measured" }];
  assert.deepEqual(floorCandidates(held), []);
});

test("the floor prefers a buyer's question to a bigger cluster's score", () => {
  // Opportunity is guessed until Search Console has data, and the guess pays a
  // bonus for cluster size — so the alphabet-soup dumps outscore the real
  // questions. Without the tie-break the day goes to "ai consultant prompt".
  const held = [
    { brief: brief("ai-consultant-prompt", "nl", 51), why: "never measured" },
    { brief: brief("enterprise-ai-chatbot-development-cost", "en", 42), why: "never measured" },
  ];
  assert.equal(floorCandidates(held)[0].primaryKeyword, "enterprise ai chatbot development cost");
});
