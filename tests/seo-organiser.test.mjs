import test from "node:test";
import assert from "node:assert/strict";

import { classifyIntent, isTargetableTerm, normalizeTerm } from "../lib/seo/expand.ts";
import { buildKeywordSet, clusterKeywords, scoreKeyword, similarity, tokens } from "../lib/seo/cluster.ts";
import {
  assignKeywords,
  buildBriefs,
  findCannibalisation,
  slugify,
} from "../lib/seo/organiser.ts";

// ---------- normalisation ----------

test("normalizeTerm collapses case, spacing and leading articles", () => {
  assert.equal(normalizeTerm("  The  Best AI Agency "), "best ai agency");
  assert.equal(normalizeTerm("Een AI Consultant"), "ai consultant");
});

// ---------- intent ----------

test("classifyIntent separates buying intent from research", () => {
  assert.equal(classifyIntent("ai chatbot laten maken"), "transactional");
  assert.equal(classifyIntent("ai consultant kosten"), "transactional");
  assert.equal(classifyIntent("best ai agency netherlands"), "commercial");
  assert.equal(classifyIntent("what is an ai agent"), "informational");
});

test("classifyIntent treats brand searches as navigational so they are never targeted", () => {
  assert.equal(classifyIntent("stride ai login"), "navigational");
});

// ---------- clustering ----------

test("clusterKeywords builds hub and spoke around the broadest term", () => {
  const input = [
    { id: "a", term: "ai consultant", locale: "en", intent: "commercial" },
    { id: "b", term: "ai consultant for small business", locale: "en", intent: "commercial" },
    { id: "c", term: "ai consultant for law firms", locale: "en", intent: "commercial" },
    { id: "d", term: "workflow automation tools", locale: "en", intent: "commercial" },
  ];
  const { clusters, assignment } = clusterKeywords(input);

  assert.equal(assignment.get("a"), assignment.get("b"), "spoke joins its pillar");
  assert.equal(assignment.get("a"), assignment.get("c"));
  assert.notEqual(assignment.get("a"), assignment.get("d"), "unrelated term gets its own cluster");

  const pillar = clusters.find((c) => c.id === assignment.get("a"));
  assert.equal(pillar.pillarTerm, "ai consultant", "shortest term becomes the pillar");
});

test("clusterKeywords excludes navigational keywords entirely", () => {
  const { clusters } = clusterKeywords([
    { id: "n", term: "stride ai login", locale: "en", intent: "navigational" },
  ]);
  assert.equal(clusters.length, 0);
});

test("clusterKeywords never mixes locales", () => {
  const { assignment } = clusterKeywords([
    { id: "en", term: "ai consultant", locale: "en", intent: "commercial" },
    { id: "nl", term: "ai consultant bedrijven", locale: "nl", intent: "commercial" },
  ]);
  assert.notEqual(assignment.get("en"), assignment.get("nl"));
});

test("clustering is stable across runs", () => {
  const input = [
    { id: "a", term: "ai agent", locale: "en", intent: "informational" },
    { id: "b", term: "ai agent examples", locale: "en", intent: "informational" },
  ];
  const first = clusterKeywords(input).clusters.map((c) => c.id);
  const second = clusterKeywords(input).clusters.map((c) => c.id);
  assert.deepEqual(first, second);
});

// ---------- scoring ----------

test("scoreKeyword ranks striking distance above an unmeasured term", () => {
  const striking = scoreKeyword({
    term: "ai consultant netherlands",
    intent: "commercial",
    locale: "en",
    stats: { clicks: 2, impressions: 180, ctr: 0.011, position: 11.4 },
  });
  const cold = scoreKeyword({
    term: "ai consultant netherlands",
    intent: "commercial",
    locale: "en",
  });
  assert.ok(
    striking.opportunity > cold.opportunity,
    "a term already ranking on page two is the cheaper win",
  );
});

test("scoreKeyword demotes terms already in the top three", () => {
  const won = scoreKeyword({
    term: "stride ai consultancy",
    intent: "commercial",
    locale: "en",
    stats: { clicks: 40, impressions: 200, ctr: 0.2, position: 1.8 },
  });
  const striking = scoreKeyword({
    term: "stride ai consultancy",
    intent: "commercial",
    locale: "en",
    stats: { clicks: 1, impressions: 200, ctr: 0.005, position: 12 },
  });
  assert.ok(won.opportunity < striking.opportunity);
});

test("scoreKeyword says so when it has no measurements, rather than inventing a number", () => {
  const cold = scoreKeyword({ term: "ai agent uitleg", intent: "informational", locale: "nl" });
  assert.match(cold.reasoning, /no Search Console data/);
});

test("scoreKeyword prefers transactional over informational intent", () => {
  const buy = scoreKeyword({ term: "ai chatbot laten maken", intent: "transactional", locale: "nl" });
  const learn = scoreKeyword({ term: "wat is een ai chatbot", intent: "informational", locale: "nl" });
  assert.ok(buy.opportunity > learn.opportunity);
});

// ---------- assignment ----------

const ROUTES = [
  {
    route: "/services",
    locale: "en",
    title: "AI Services | Chatbots, Agents & Automation",
    description: "Custom AI chatbots and workflow automation.",
    primaryKeyword: "ai chatbot development",
    secondaryKeywords: ["custom ai agents", "workflow automation ai"],
    kind: "page",
  },
  {
    route: "/about",
    locale: "en",
    title: "About | Who We Are",
    description: "Two AI specialists.",
    primaryKeyword: "ai consultancy netherlands",
    secondaryKeywords: ["ai specialists"],
    kind: "page",
  },
];

test("assignKeywords sends a keyword to the page that already speaks about it", () => {
  const keywords = buildKeywordSet([
    { term: "custom ai agents for business", intent: "commercial", locale: "en", via: "autocomplete" },
  ]);
  const { assignments } = assignKeywords(keywords, ROUTES);
  assert.equal(assignments[0].route, "/services");
});

test("assignKeywords leaves an unrelated keyword unassigned so it becomes a gap", () => {
  const keywords = buildKeywordSet([
    { term: "gdpr fines for retailers", intent: "informational", locale: "en", via: "autocomplete" },
  ]);
  const { assignments, unassigned } = assignKeywords(keywords, ROUTES);
  assert.equal(assignments.length, 0);
  assert.equal(unassigned.length, 1, "an unserved keyword must surface, not be forced onto a page");
});

test("assignKeywords marks exactly one primary keyword per route", () => {
  const keywords = buildKeywordSet([
    { term: "ai chatbot development", intent: "commercial", locale: "en", via: "seed" },
    { term: "ai chatbot development cost", intent: "transactional", locale: "en", via: "autocomplete" },
    { term: "custom ai agents pricing", intent: "transactional", locale: "en", via: "autocomplete" },
  ]);
  const { assignments } = assignKeywords(keywords, ROUTES);
  const primaries = assignments.filter((a) => a.route === "/services" && a.primary);
  assert.equal(primaries.length, 1);
});

// ---------- cannibalisation ----------

test("findCannibalisation catches two routes chasing one term", () => {
  const warnings = findCannibalisation([
    { ...ROUTES[0], route: "/services" },
    { ...ROUTES[0], route: "/blog/ai-chatbot-development" },
  ]);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0].routes, ["/services", "/blog/ai-chatbot-development"]);
});

test("findCannibalisation stays quiet when every route owns its own term", () => {
  assert.deepEqual(findCannibalisation(ROUTES), []);
});

// ---------- briefs ----------

test("buildBriefs only proposes articles for clusters nothing serves", () => {
  const keywords = buildKeywordSet([
    { term: "ai chatbot development", intent: "commercial", locale: "en", via: "seed" },
    { term: "ai chatbot development guide", intent: "informational", locale: "en", via: "autocomplete" },
    { term: "gdpr fines for retailers", intent: "informational", locale: "en", via: "autocomplete" },
    { term: "gdpr fines for retailers 2026", intent: "informational", locale: "en", via: "autocomplete" },
  ]);
  const { clusters, assignment } = clusterKeywords(
    keywords.map((k) => ({ id: k.id, term: k.term, locale: k.locale, intent: k.intent })),
  );
  for (const k of keywords) k.clusterId = assignment.get(k.id);

  const { assignments } = assignKeywords(keywords, ROUTES);
  const briefs = buildBriefs(clusters, keywords, assignments, ROUTES);

  const terms = briefs.map((b) => b.primaryKeyword);
  assert.ok(
    terms.some((t) => t.startsWith("gdpr")),
    "the uncovered cluster becomes a brief",
  );
  assert.ok(
    !terms.some((t) => t.includes("chatbot development")),
    "the cluster /services already serves must not be duplicated",
  );
});

test("buildBriefs picks the template from the phrasing", () => {
  const keywords = buildKeywordSet([
    { term: "how to automate invoice processing", intent: "informational", locale: "en", via: "autocomplete" },
    { term: "how to automate invoice processing free", intent: "informational", locale: "en", via: "autocomplete" },
  ]);
  const { clusters, assignment } = clusterKeywords(
    keywords.map((k) => ({ id: k.id, term: k.term, locale: k.locale, intent: k.intent })),
  );
  for (const k of keywords) k.clusterId = assignment.get(k.id);
  const briefs = buildBriefs(clusters, keywords, [], ROUTES);
  assert.equal(briefs[0].template, "how-to");
});

test("buildBriefs gives a pillar a bigger word target than a spoke", () => {
  const many = buildKeywordSet(
    ["a", "b", "c", "d", "e"].map((s) => ({
      term: `invoice automation ${s} for finance teams`,
      intent: "informational",
      locale: "en",
      via: "autocomplete",
    })),
  );
  const { clusters, assignment } = clusterKeywords(
    many.map((k) => ({ id: k.id, term: k.term, locale: k.locale, intent: k.intent })),
  );
  for (const k of many) k.clusterId = assignment.get(k.id);
  const briefs = buildBriefs(clusters, many, [], ROUTES);
  assert.equal(briefs[0].role, "pillar");
  assert.equal(briefs[0].wordCountTarget, 2500);
});

test("every brief carries at least one internal link, so no article ships orphaned", () => {
  const keywords = buildKeywordSet([
    { term: "gdpr fines for retailers", intent: "informational", locale: "en", via: "autocomplete" },
  ]);
  const { clusters, assignment } = clusterKeywords(
    keywords.map((k) => ({ id: k.id, term: k.term, locale: k.locale, intent: k.intent })),
  );
  for (const k of keywords) k.clusterId = assignment.get(k.id);
  const briefs = buildBriefs(clusters, keywords, [], ROUTES);
  assert.ok(briefs[0].internalLinks.length >= 1);
});

// ---------- slugs ----------

test("slugify produces clean lowercase url segments", () => {
  assert.equal(slugify("Wat is een AI-agent?"), "wat-is-een-ai-agent");
  assert.equal(slugify("AI consultant  for  SMEs"), "ai-consultant-for-smes");
});

// ---------- similarity ----------

test("similarity ignores stopwords so shape does not beat meaning", () => {
  const a = tokens("what is an ai agent", "en");
  const b = tokens("ai agent", "en");
  assert.equal(similarity(a, b), 1, "the stopwords are all that differ");
});

// ---------- audience filter ----------

test("isTargetableTerm rejects the job-seeker traffic autocomplete is full of", () => {
  for (const term of [
    "ai consultant salary",
    "ai business consultant salary",
    "how to become an ai consultant",
    "ai consultant job description",
    "ai consultant certification",
    "ai cursus voor beginners",
    "ai consultant vacatures",
  ]) {
    assert.equal(isTargetableTerm(term), false, `should reject "${term}"`);
  }
});

test("isTargetableTerm keeps buyers who are sizing a budget", () => {
  for (const term of [
    "ai consultant hourly rate",
    "ai chatbot development cost",
    "ai chatbot laten maken kosten",
    "ai agency pricing",
  ]) {
    assert.equal(isTargetableTerm(term), true, `should keep "${term}"`);
  }
});

test("isTargetableTerm drops suggestions that drifted off the subject", () => {
  assert.equal(isTargetableTerm("best restaurants rotterdam"), false);
  assert.equal(isTargetableTerm("custom ai agents for business"), true);
});

test("isTargetableTerm drops markets we do not sell into but keeps our own", () => {
  assert.equal(isTargetableTerm("best ai consulting companies in india"), false);
  assert.equal(isTargetableTerm("ai agency new york"), false);
  assert.equal(isTargetableTerm("ai consultant netherlands"), true);
  assert.equal(isTargetableTerm("ai bureau amsterdam"), true);
});

test("isTargetableTerm drops advice written for consultants rather than buyers", () => {
  assert.equal(isTargetableTerm("how to be a good business consultant"), false);
  assert.equal(isTargetableTerm("how to start an ai agency"), false);
  assert.equal(isTargetableTerm("how to automate invoice processing with ai"), true);
});
