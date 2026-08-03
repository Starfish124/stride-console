import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_POLICY,
  decideCap,
  earningCount,
  maturedArticles,
  pathForArticle,
} from "../lib/seo/governor.ts";

const NOW = new Date("2026-10-01T08:00:00.000Z");

function article(slug, locale, daysAgo, status = "published") {
  return {
    slug,
    locale,
    status,
    publishedAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function page(path, impressions) {
  return { page: `https://stride-ai.nl${path}`, impressions };
}

/** n published articles, all matured, the first `earning` of them with traffic. */
function fleet(n, earning) {
  const articles = Array.from({ length: n }, (_, i) => article(`piece-${i}`, "en", 40));
  const pages = Array.from({ length: earning }, (_, i) => page(`/blog/piece-${i}`, 200));
  return { articles, pages };
}

// ---------- the inputs ----------

test("an article is judged by its own URL, per locale", () => {
  assert.equal(pathForArticle("ai-agent-pricing", "en"), "/blog/ai-agent-pricing");
  assert.equal(pathForArticle("ai-agent-pricing", "nl"), "/nl/blog/ai-agent-pricing");
});

test("young articles are excluded, not counted as failures", () => {
  // Judging a three-day-old article judges Google's crawl schedule, not the
  // writing.
  const articles = [article("old", "en", 40), article("fresh", "en", 3)];
  const matured = maturedArticles(articles, NOW, DEFAULT_POLICY.maturityDays);
  assert.deepEqual(matured.map((a) => a.slug), ["old"]);
});

test("a draft is not a published article, however old", () => {
  const matured = maturedArticles([article("held", "en", 90, "drafted")], NOW, 21);
  assert.equal(matured.length, 0);
});

test("earning is measured against the impression floor, and a trailing slash is the same page", () => {
  const articles = [article("a", "en", 40), article("b", "nl", 40), article("c", "en", 40)];
  const pages = [
    page("/blog/a", 40),
    page("/nl/blog/b/", 12),
    page("/blog/c", 3), // seen three times: that is noise, not a result
  ];
  assert.equal(earningCount(articles, pages, 10), 2);
});

// ---------- the decision ----------

test("no Search Console data means hold, not a guess", () => {
  const d = decideCap({ current: 3, articles: [], pages: [], statsAvailable: false, now: NOW });
  assert.equal(d.changed, false);
  assert.match(d.reason, /no data yet/);
});

test("too little history means hold, and says how much is needed", () => {
  const { articles, pages } = fleet(2, 2);
  const d = decideCap({ current: 1, articles, pages, statsAvailable: true, now: NOW });
  assert.equal(d.changed, false);
  assert.match(d.reason, /Only 2 articles are older than 21 days/);
  assert.match(d.reason, /until there are 4/);
});

test("work that lands buys a faster pace, one step at a time", () => {
  const { articles, pages } = fleet(5, 4);
  const d = decideCap({ current: 2, articles, pages, statsAvailable: true, now: NOW });
  assert.equal(d.changed, true);
  assert.equal(d.to, 3, "one step, never a jump");
  assert.equal(d.evidence.earning, 4);
});

test("work that does not land costs it, immediately and without a cooldown", () => {
  // Asymmetric on purpose: publishing too little costs traffic, publishing too
  // much of what nobody reads costs the domain.
  const { articles, pages } = fleet(8, 1);
  const d = decideCap({
    current: 3,
    articles,
    pages,
    statsAvailable: true,
    lastRaisedAt: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(),
    now: NOW,
  });
  assert.equal(d.changed, true);
  assert.equal(d.to, 2);
});

test("one good fortnight cannot ramp to the ceiling", () => {
  const { articles, pages } = fleet(6, 6);
  const d = decideCap({
    current: 2,
    articles,
    pages,
    statsAvailable: true,
    lastRaisedAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
    now: NOW,
  });
  assert.equal(d.changed, false);
  assert.match(d.reason, /raised 3 days ago/);
});

test("the ceiling is a person's decision, and the governor stops there", () => {
  const { articles, pages } = fleet(10, 10);
  const d = decideCap({
    current: DEFAULT_POLICY.ceiling,
    articles,
    pages,
    statsAvailable: true,
    now: NOW,
  });
  assert.equal(d.changed, false);
  assert.match(d.reason, /ceiling of 5/);
});

test("the floor holds, and says what to do instead of writing more", () => {
  const { articles, pages } = fleet(8, 0);
  const d = decideCap({
    current: DEFAULT_POLICY.floor,
    articles,
    pages,
    statsAvailable: true,
    now: NOW,
  });
  assert.equal(d.changed, false);
  assert.match(d.reason, /already at the floor/);
  assert.match(d.reason, /reading the queue/);
});

test("a floor of zero lets a bad run stop publishing entirely", () => {
  const { articles, pages } = fleet(8, 0);
  const d = decideCap({
    current: 1,
    articles,
    pages,
    statsAvailable: true,
    now: NOW,
    policy: { floor: 0 },
  });
  assert.equal(d.to, 0);
  assert.equal(d.changed, true);
});

test("the middle band holds rather than fidgeting", () => {
  // 40% earning: not good enough to speed up, not bad enough to slow down.
  const { articles, pages } = fleet(10, 4);
  const d = decideCap({ current: 3, articles, pages, statsAvailable: true, now: NOW });
  assert.equal(d.changed, false);
  assert.match(d.reason, /neither good enough/);
});

test("every decision carries what it was made from", () => {
  const { articles, pages } = fleet(5, 4);
  const d = decideCap({ current: 2, articles, pages, statsAvailable: true, now: NOW });
  assert.equal(d.evidence.matured, 5);
  assert.equal(d.evidence.earning, 4);
  assert.equal(d.evidence.windowDays, 21);
  assert.ok(d.evidence.hitRate > 0.6);
});
