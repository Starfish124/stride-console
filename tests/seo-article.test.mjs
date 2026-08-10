import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArticle,
  buildArticlePrompt,
  filterSources,
  parseArticleJson,
} from "../lib/seo/article.ts";

const BRIEF = {
  id: "br_x",
  clusterId: "cl_en_ai-consultant",
  locale: "en",
  primaryKeyword: "ai consultant for small business",
  secondaryKeywords: ["affordable ai consultant"],
  intent: "commercial",
  template: "explainer",
  role: "spoke",
  wordCountTarget: 1200,
  internalLinks: [{ href: "/services", anchor: "our AI services" }],
  suggestedSlug: "ai-consultant-for-small-business",
  opportunity: 40,
  createdAt: "2026-07-26T00:00:00.000Z",
};

const ITEMS = [
  {
    title: "Real article",
    url: "https://example.com/real",
    source: "Example",
    tier: 1,
    score: 5,
    summary: "A summary.",
  },
];

// ---------- prompt ----------

test("the prompt names the language so a Dutch brief is not answered in English", () => {
  const nl = buildArticlePrompt({ ...BRIEF, locale: "nl" }, []);
  assert.match(nl, /LANGUAGE: Dutch/);
  assert.match(nl, /entire article.*in Dutch only/i);
});

test("the prompt forbids fabrication in its own section", () => {
  const p = buildArticlePrompt(BRIEF, []);
  assert.match(p, /FABRICATION IS THE ONE UNFORGIVABLE ERROR/);
  assert.match(p, /we have not given you any, so there are none to cite/);
});

test("the prompt carries the required internal links", () => {
  const p = buildArticlePrompt(BRIEF, []);
  assert.match(p, /\[our AI services\]\(\/services\)/);
});

test("with no source material the prompt says so instead of implying sources exist", () => {
  const p = buildArticlePrompt(BRIEF, []);
  assert.match(p, /No current source material was available/);
  assert.match(p, /Do not invent statistics/);
});

test("source material reaches the prompt with its url and full text", () => {
  const p = buildArticlePrompt(BRIEF, [{ ...ITEMS[0], content: "The full body text." }]);
  assert.match(p, /https:\/\/example\.com\/real/);
  assert.match(p, /The full body text\./);
});

// ---------- parsing ----------

test("parseArticleJson reads a well-formed reply", () => {
  const parsed = parseArticleJson(
    JSON.stringify({
      title: "A title",
      description: "A description.",
      body: "## Heading\n\nBody.",
      sources: [{ title: "S", url: "https://example.com/real" }],
    }),
  );
  assert.equal(parsed.title, "A title");
  assert.equal(parsed.sources.length, 1);
});

test("parseArticleJson survives prose wrapped around the JSON", () => {
  const parsed = parseArticleJson(
    'Here you go:\n\n{"title":"T","description":"D","body":"## H\\n\\nB"}\n\nHope that works.',
  );
  assert.equal(parsed.title, "T");
});

test("parseArticleJson returns undefined rather than a half-built article", () => {
  assert.equal(parseArticleJson("not json at all"), undefined);
  assert.equal(parseArticleJson('{"title":"T"}'), undefined, "a title with no body is not an article");
});

// ---------- fabricated citations ----------

test("filterSources drops a citation nobody supplied", () => {
  const { kept, dropped } = filterSources(
    [
      { title: "Real article", url: "https://example.com/real" },
      { title: "Invented study", url: "https://mckinsey.com/not-real" },
    ],
    ITEMS,
  );
  assert.equal(kept.length, 1);
  assert.deepEqual(dropped, ["https://mckinsey.com/not-real"]);
});

test("filterSources keeps everything when every citation was offered", () => {
  const { kept, dropped } = filterSources([{ title: "Real article", url: "https://example.com/real" }], ITEMS);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test("filterSources drops every citation when no sources were offered at all", () => {
  const { kept, dropped } = filterSources([{ title: "Ghost", url: "https://example.com/ghost" }], []);
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1, "an article written from no sources cannot cite one");
});

// ---------- citations ----------
//
// Four Dutch articles reached the live site citing nothing at all, and the
// voice gate passed every one of them at zero errors. It reads prose; it has
// no view on whether the prose is sourced.

const CLEAN_LINT = { violations: [], errors: 0, warns: 0, ok: true };
const PLACEMENT = {
  inTitle: true, inH1: true, inSlug: true, inDescription: true,
  inFirstParagraph: true, inAnyHeading: true, occurrences: 1, missing: [], ok: true,
};
const DRAFT = {
  title: "What an AI consultant for small business does",
  description: "What the job is, and what it costs.",
  body: "## What the job is\n\nThey watch how work moves, then automate two things.",
  sources: [],
};

test("an article that cites nothing is held for a person", () => {
  const built = buildArticle(
    BRIEF, DRAFT, [], CLEAN_LINT, PLACEMENT, new Date("2026-08-10T00:00:00Z"), [],
  );
  const uncited = built.lint.violations.find((v) => v.rule === "uncited");
  assert.ok(uncited, "no sources has to be an error, not a silent gap");
  assert.equal(uncited.severity, "error");
  assert.equal(built.lint.errors, 1, "and it must count, or publish still goes ahead");
});

test("a cited article is left alone", () => {
  const built = buildArticle(
    BRIEF, DRAFT,
    [{ title: "Real article", url: "https://example.com/real", publisher: "Example" }],
    CLEAN_LINT, PLACEMENT, new Date("2026-08-10T00:00:00Z"), [],
  );
  assert.equal(built.lint.violations.find((v) => v.rule === "uncited"), undefined);
  assert.equal(built.lint.errors, 0);
});
