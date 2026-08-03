import test from "node:test";
import assert from "node:assert/strict";

import {
  asQuestion,
  buildPrompt,
  mergeEntry,
  parseAnswers,
  nextRouteToAnswer,
  questionsForRoute,
} from "../lib/seo/faq.ts";

function keyword(term, locale, extra = {}) {
  return {
    id: `kw_${term}`,
    term,
    locale,
    intent: "informational",
    discoveredVia: "autocomplete",
    discoveredAt: "2026-08-01T00:00:00.000Z",
    opportunity: 40,
    ...extra,
  };
}

// ---------- question shape ----------

test("a keyword becomes a question without being title-cased into a slide deck", () => {
  assert.equal(asQuestion("what is an ai agent"), "What is an AI agent?");
  assert.equal(asQuestion("wat kost een ai chatbot"), "Wat kost een AI chatbot?");
  // Acronyms this business lives on stay upper, everything else stays as typed.
  assert.equal(asQuestion("hoe werkt rpa voor mkb"), "Hoe werkt RPA voor MKB?");
  // An existing question mark is not doubled.
  assert.equal(asQuestion("what is an ai agent?"), "What is an AI agent?");
});

test("Dutch questions have no auxiliary at the front, so interrogatives carry them", () => {
  const seen = { clicks: 0, impressions: 20, ctr: 0, position: 15, measuredAt: "x" };
  const keywords = [
    keyword("wat kost een ai chatbot", "nl", { stats: seen }),
    keyword("ai chatbot laten maken", "nl", { stats: seen }),
    keyword("hoe werkt een ai agent", "nl", { stats: seen }),
  ];
  const picked = questionsForRoute(keywords.map((k) => ({ ...k, assignedRoute: "/services" })), "/services", "nl");
  assert.deepEqual(picked.map((q) => q.term), ["wat kost een ai chatbot", "hoe werkt een ai agent"]);
});

test("questions only come from the page the organiser gave them to", () => {
  // Answering "what does an AI consultant cost" on the portfolio page puts the
  // answer where nobody asked it.
  const seen = { clicks: 0, impressions: 20, ctr: 0, position: 15, measuredAt: "x" };
  const keywords = [
    keyword("what does an ai consultant cost", "en", { assignedRoute: "/contact", stats: seen }),
    keyword("what is an ai agent", "en", { assignedRoute: "/services", stats: seen }),
  ];
  const picked = questionsForRoute(keywords, "/services", "en");
  assert.deepEqual(picked.map((q) => q.term), ["what is an ai agent"]);
});

test("the most asked question leads the block, not the highest scoring one", () => {
  const keywords = [
    keyword("what is an ai agent", "en", {
      assignedRoute: "/services",
      opportunity: 90,
      stats: { clicks: 0, impressions: 12, ctr: 0, position: 30, measuredAt: "x" },
    }),
    keyword("how much does an ai chatbot cost", "en", {
      assignedRoute: "/services",
      opportunity: 20,
      stats: { clicks: 1, impressions: 300, ctr: 0.003, position: 12, measuredAt: "x" },
    }),
  ];
  const picked = questionsForRoute(keywords, "/services", "en");
  assert.equal(picked[0].term, "how much does an ai chatbot cost", "300 impressions beats a high guess");
  assert.equal(picked[0].impressions, 300);
  assert.equal(picked.length, 2);
});

// ---------- the prompt ----------

test("the prompt forbids inventing a figure, in the language of the page", () => {
  const prompt = buildPrompt([{ question: "Wat kost een AI chatbot?", term: "x", locale: "nl" }], "nl");
  assert.match(prompt, /Dutch/);
  assert.match(prompt, /NEVER invent a price/);
  assert.match(prompt, /Wat kost een AI chatbot\?/);
});

// ---------- what is allowed through ----------

const ASKED = [
  { question: "What is an AI agent?", term: "what is an ai agent", locale: "en" },
  { question: "How much does an AI chatbot cost?", term: "how much does an ai chatbot cost", locale: "en" },
];

test("a clean pair of answers goes through", () => {
  const raw = JSON.stringify([
    { question: "What is an AI agent?", answer: "An AI agent is software that carries out a task end to end, deciding its own next step rather than following a fixed script. It reads context, calls tools and reports what it did." },
    { question: "How much does an AI chatbot cost?", answer: "It depends on how many systems it has to reach and how much oversight the work needs. We quote per project once the scope is clear." },
  ]);
  const { items, rejected } = parseAnswers(raw, ASKED);
  assert.equal(items.length, 2);
  assert.deepEqual(rejected, []);
});

test("an invented figure is refused, because a price on a live site is a promise", () => {
  // The failure mode that matters. A model asked what something costs will name
  // a number if nothing stops it, and somebody then has to honour it on a call.
  const raw = JSON.stringify([
    { question: "How much does an AI chatbot cost?", answer: "Most projects start from €2,500 and take four weeks." },
    { question: "What is an AI agent?", answer: "Agents cut handling time by 40% in most teams." },
  ]);
  const { items, rejected } = parseAnswers(raw, ASKED);
  assert.equal(items.length, 0);
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every((r) => r.includes("names a figure")));
});

test("a question nobody asked does not get published", () => {
  const raw = JSON.stringify([
    { question: "Why is Stride AI the best agency in Europe?", answer: "Because we say so." },
  ]);
  const { items, rejected } = parseAnswers(raw, ASKED);
  assert.equal(items.length, 0);
  assert.match(rejected[0], /not asked/);
});

test("house vocabulary is refused, using the same list every other gate reads", () => {
  const raw = JSON.stringify([
    { question: "What is an AI agent?", answer: "It is a cutting-edge way to unlock seamless value." },
  ]);
  const { items, rejected } = parseAnswers(raw, ASKED);
  assert.equal(items.length, 0);
  assert.equal(rejected.length, 1);
});

test("an essay instead of an answer is refused", () => {
  const raw = JSON.stringify([
    { question: "What is an AI agent?", answer: "word ".repeat(120) },
  ]);
  assert.equal(parseAnswers(raw, ASKED).items.length, 0);
});

test("JSON is salvaged from a model that explains itself first", () => {
  const raw = `Sure! Here are the answers:\n\n[{"question":"What is an AI agent?","answer":"Software that completes a task end to end and decides its own next step."}]\n\nLet me know if you want changes.`;
  const { items } = parseAnswers(raw, ASKED);
  assert.equal(items.length, 1);
});

test("prose with no JSON at all is a rejection, not a crash", () => {
  const { items, rejected } = parseAnswers("I cannot help with that.", ASKED);
  assert.equal(items.length, 0);
  assert.match(rejected[0], /not JSON/);
});

// ---------- the file ----------

test("re-answering a route replaces its block rather than duplicating it", () => {
  const first = mergeEntry(
    { updatedAt: "", entries: [] },
    { route: "/services", locale: "en", items: [{ question: "Q?", answer: "A" }], updatedAt: "2026-08-04T00:00:00.000Z" },
  );
  const second = mergeEntry(first, {
    route: "/services",
    locale: "en",
    items: [{ question: "Q?", answer: "A better" }],
    updatedAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].items[0].answer, "A better");

  // The same route in the other language is a different block and both are kept.
  const both = mergeEntry(second, {
    route: "/services",
    locale: "nl",
    items: [{ question: "V?", answer: "A" }],
    updatedAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(both.entries.length, 2);
});

test("one route a night: never-answered first, then the stalest, then nothing", () => {
  const now = new Date("2026-09-01T03:15:00.000Z");
  const candidates = [
    { route: "/services", locale: "en", questions: 6 },
    { route: "/use-cases", locale: "en", questions: 4 },
    { route: "/contact", locale: "en", questions: 2 },
  ];
  const file = {
    updatedAt: "",
    entries: [
      { route: "/services", locale: "en", items: [], updatedAt: "2026-08-30T00:00:00.000Z" },
    ],
  };

  // /contact has only two questions, which is not a block worth a call.
  assert.deepEqual(nextRouteToAnswer(candidates, file, now), { route: "/use-cases", locale: "en" });

  // Once everything recent is answered, there is nothing to do and no call made.
  const answered = {
    updatedAt: "",
    entries: candidates.map((c) => ({ ...c, items: [], updatedAt: "2026-08-30T00:00:00.000Z" })),
  };
  assert.equal(nextRouteToAnswer(candidates, answered, now), undefined);

  // A block older than the window comes back round.
  const stale = {
    updatedAt: "",
    entries: [{ route: "/services", locale: "en", items: [], updatedAt: "2026-06-01T00:00:00.000Z" }],
  };
  assert.deepEqual(nextRouteToAnswer([candidates[0]], stale, now), { route: "/services", locale: "en" });
});

test("an unmeasured question is not a question, however question-shaped", () => {
  // The correction. Pointed at the real store, the first version proposed
  // "What is AI agency?", "How to AI agency?" and "How to start AI agency?" for
  // the homepage: a fragment, a non-sentence, and the practitioner audience.
  // Autocomplete fragments read as questions without being questions.
  const guessed = keyword("what is ai agency", "en", { assignedRoute: "/", opportunity: 80 });
  assert.equal(questionsForRoute([guessed], "/", "en").length, 0);

  const measured = keyword("what is an ai agent", "en", {
    assignedRoute: "/",
    stats: { clicks: 0, impressions: 25, ctr: 0, position: 14, measuredAt: "x" },
  });
  assert.equal(questionsForRoute([measured], "/", "en").length, 1);

  // A term Search Console itself reported counts, measured or not: somebody
  // typed it to get here.
  const reported = keyword("hoe werkt een ai agent", "nl", {
    assignedRoute: "/",
    discoveredVia: "search-console",
  });
  assert.equal(questionsForRoute([reported], "/", "nl").length, 1);

  // The gate is a judgement, so it is overridable for a human who has read them.
  assert.equal(questionsForRoute([guessed], "/", "en", 6, { requireMeasured: false }).length, 1);
});

test("the practitioner audience cannot reach a FAQ block either", async () => {
  const { isTargetableTerm } = await import("../lib/seo/expand.ts");
  // Autocomplete's own phrasing, with no article, which is how it leaked.
  assert.equal(isTargetableTerm("how to start ai agency"), false);
  assert.equal(isTargetableTerm("how to build an ai agency"), false);
  assert.equal(isTargetableTerm("how to grow ai consultancy"), false);
  // A buyer asking how to do the work is still ours.
  assert.equal(isTargetableTerm("how to automate invoice processing with ai"), true);
});
