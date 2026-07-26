import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { formatArticleViolations, isTitleCase, lintArticle } from "../lib/seo/lint.ts";

// A genuinely human-voiced article, written by hand. This is the most
// important test in the file: a gate that fails honest writing is worse than
// no gate at all, because it trains the writer to produce whatever the gate
// happens to accept.
const SEED_ARTICLE = path.join(
  process.env.HOME,
  "ai-agency-website/content/blog/what-is-an-ai-agent.en.md",
);

test("the hand-written seed article passes with zero errors", { skip: !fs.existsSync(SEED_ARTICLE) }, () => {
  const raw = fs.readFileSync(SEED_ARTICLE, "utf8");
  const body = raw.replace(/^---[\s\S]*?---\n/, "");
  const result = lintArticle(body);
  assert.equal(
    result.errors,
    0,
    `honest human writing must pass:\n${formatArticleViolations(result)}`,
  );
});

// ---------- shared vocabulary ----------

const GOOD = `We rebuilt the invoice flow last March.

## How the matching works

The system reads the supplier email, pulls the order lines out, and writes them
to the ledger. When it cannot match a line it stops and asks a person. That
happens on roughly 1 in 12 invoices, usually because the supplier changed their
reference format without telling anyone.

## What it cost

Six weeks of build time and about 40 hours of the finance lead's attention. She
now spends around 20 minutes a week on the queue, against most of a day before.

## What we would skip

The dashboard. Nobody opened it after the second week, and the weekly summary
email did the same job for a fraction of the effort.`;

test("clean prose produces no errors", () => {
  const result = lintArticle(GOOD, { minWords: 50 });
  assert.equal(result.errors, 0, formatArticleViolations(result));
});

test("banned vocabulary is caught, from the same list the post gate uses", () => {
  const r = lintArticle(`${GOOD}\n\nWe leverage a robust and seamless approach.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "bannedWords"));
});

test("copula avoidance is caught", () => {
  const r = lintArticle(`${GOOD}\n\nThe ledger serves as the record of truth.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "ceremonyVerbs"));
});

test("phantom sources are caught", () => {
  const r = lintArticle(`${GOOD}\n\nStudies show that automation helps.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "phantomSources"));
});

// ---------- long-form specific ----------

test("signposting is caught", () => {
  const r = lintArticle(`${GOOD}\n\nLet's dive into how the matching works.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "signposting"));
});

test("aphorism formulas are caught", () => {
  const r = lintArticle(`${GOOD}\n\nTrust is the currency of automation.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "aphorism" || v.rule === "falseDepth"));
});

test("chatbot correspondence pasted as content is caught", () => {
  const r = lintArticle(`${GOOD}\n\nI hope this helps. Let me know if you want more.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "chatArtifacts"));
});

test("empty upbeat conclusions are caught", () => {
  const r = lintArticle(`${GOOD}\n\nThe future looks bright for finance teams.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "emptyConclusion"));
});

test("speculative gap-filling is caught", () => {
  const r = lintArticle(`${GOOD}\n\nWhile specific details are limited, it probably started in 2019.`, {
    minWords: 50,
  });
  assert.ok(r.violations.some((v) => v.rule === "gapFilling"));
});

test("a formulaic Challenges section is caught", () => {
  const r = lintArticle(`${GOOD}\n\n## Challenges and future prospects\n\nThere are some.`, {
    minWords: 50,
  });
  assert.ok(r.violations.some((v) => v.rule === "formulaicSection"));
});

test("a Conclusion heading is caught", () => {
  const r = lintArticle(`${GOOD}\n\n## Conclusion\n\nThat is the summary of it all.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "formulaicSection"));
});

// ---------- headings ----------

test("isTitleCase spots a chatbot heading", () => {
  assert.equal(isTitleCase("Strategic Negotiations And Global Partnerships"), true);
  assert.equal(isTitleCase("Understanding The Business Value"), true);
});

test("isTitleCase leaves sentence case and proper nouns alone", () => {
  assert.equal(isTitleCase("Strategic negotiations and global partnerships"), false);
  assert.equal(isTitleCase("What we learned in Amsterdam"), false);
  assert.equal(isTitleCase("How AI agents handle GDPR"), false);
  assert.equal(isTitleCase("What it cost"), false);
});

test("an H1 in the body is caught, because the page renders one already", () => {
  const r = lintArticle(`# A title\n\n${GOOD}`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "h1InBody"));
});

test("a heading followed by a one-line restatement is flagged", () => {
  const r = lintArticle(`${GOOD}\n\n## Performance\n\nSpeed matters.\n\nWhen a page is slow they leave.`, {
    minWords: 50,
  });
  assert.ok(r.violations.some((v) => v.rule === "fragmentedHeader"));
});

// ---------- formatting ----------

test("em dashes are an error at any count", () => {
  const r = lintArticle(`${GOOD}\n\nThe policy — announced quietly — changed things.`, { minWords: 50 });
  const v = r.violations.find((x) => x.rule === "emDash");
  assert.equal(v.severity, "error");
});

test("inline-header bullet lists are caught", () => {
  const list = `${GOOD}

- **Performance:** it got faster.
- **Security:** it got safer.
- **Cost:** it got cheaper.`;
  assert.ok(lintArticle(list, { minWords: 50 }).violations.some((v) => v.rule === "inlineHeaderList"));
});

test("emoji are an error", () => {
  const r = lintArticle(`${GOOD}\n\nShipped it.`.replace("Shipped", "🚀 Shipped"), { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "emoji"));
});

test("code blocks are never linted as prose", () => {
  const withCode = `${GOOD}

\`\`\`js
// we leverage a robust seamless paradigm here
const x = 1;
\`\`\``;
  const r = lintArticle(withCode, { minWords: 50 });
  assert.equal(r.violations.filter((v) => v.rule === "bannedWords").length, 0);
});

// ---------- rhythm and substance ----------

test("a run of three clipped sentences is caught", () => {
  const r = lintArticle(`${GOOD}\n\nThen it changed. No warning came. Nothing worked.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "staccatoRun"));
});

test("boosters without a number are caught", () => {
  const r = lintArticle(`${GOOD}\n\nThroughput improved significantly across the board.`, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "unanchoredBoosters"));
});

test("a booster with a real number beside it is allowed", () => {
  const r = lintArticle(`${GOOD}\n\nThroughput improved significantly, by 40 percent.`, { minWords: 50 });
  assert.equal(r.violations.filter((v) => v.rule === "unanchoredBoosters").length, 0);
});

test("flat sentence rhythm is warned about, not blocked", () => {
  const even = Array.from(
    { length: 16 },
    (_, i) => `The team reviewed the ${i} queue again during the weekly session today.`,
  ).join(" ");
  const r = lintArticle(even, { minWords: 50 });
  const v = r.violations.find((x) => x.rule === "flatRhythm");
  assert.ok(v, "an even cadence across a whole article is the durable tell");
  assert.equal(v.severity, "warn");
});

test("thin content is an error", () => {
  const r = lintArticle("Too short to rank for anything at all.");
  assert.ok(r.violations.some((v) => v.rule === "length" && v.severity === "error"));
});

test("an article with no numbers is warned about", () => {
  const noDigits = GOOD.replace(/\d+/g, "several");
  const r = lintArticle(noDigits, { minWords: 50 });
  assert.ok(r.violations.some((v) => v.rule === "needsNumber"));
});

test("falseRange matches the post gate, as a warning not a block", () => {
  const r = lintArticle(`${GOOD}\n\nWe work from strategy to execution for clients.`, { minWords: 50 });
  const v = r.violations.find((x) => x.rule === "falseRange");
  assert.ok(v, "the long-form gate must catch what the post gate catches");
  assert.equal(v.severity, "warn");
});

test("falseRange leaves a real numeric range alone", () => {
  const r = lintArticle(`${GOOD}\n\nBuilds run from 3 to 6 weeks.`, { minWords: 50 });
  assert.equal(r.violations.filter((x) => x.rule === "falseRange").length, 0);
});
