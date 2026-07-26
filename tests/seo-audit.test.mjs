import test from "node:test";
import assert from "node:assert/strict";

import { checkPlacement, coversKeyword, parseHtml, scorePage } from "../lib/seo/audit.ts";
import { localeKeyword, validateMeta } from "../lib/seo/optimise.ts";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>AI Chatbot Development for Dutch Businesses</title>
  <meta name="description" content="AI chatbot development that handles support and qualifies leads, live in weeks rather than quarters, at a fixed price agreed up front.">
  <link rel="canonical" href="https://stride-ai.nl/services">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Stride AI"}</script>
</head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <h1>AI chatbot development that pays for itself</h1>
    <p>AI chatbot development is what we do most. ${"word ".repeat(400)}</p>
    <h2>How the build works</h2>
    <p>${"more ".repeat(200)}</p>
    <img src="/a.png" alt="A support queue dashboard">
    <img src="/b.png" alt="An invoice being matched automatically">
    <a href="/use-cases">Use cases</a>
    <a href="/contact">Contact</a>
    <a href="https://example.com">External</a>
  </main>
</body>
</html>`;

test("parseHtml reads the tags a crawler reads", () => {
  const p = parseHtml(HTML, "https://stride-ai.nl");
  assert.equal(p.title, "AI Chatbot Development for Dutch Businesses");
  assert.match(p.description, /AI chatbot development that handles support/);
  assert.equal(p.h1, "AI chatbot development that pays for itself");
  assert.equal(p.h1Count, 1);
  assert.equal(p.canonical, "https://stride-ai.nl/services");
  assert.deepEqual(p.schemaTypes, ["Organization"]);
  assert.equal(p.imageCount, 2);
  assert.equal(p.imagesMissingAlt, 0);
  assert.equal(p.externalLinks, 1);
});

test("parseHtml counts body copy only, so chrome cannot pad a thin page", () => {
  const withNav = parseHtml(
    `<html><body><nav>${"navword ".repeat(500)}</nav><main><p>Just this.</p></main></body></html>`,
    "https://stride-ai.nl",
  );
  assert.ok(withNav.wordCount < 20, `counted ${withNav.wordCount} words`);
});

test("parseHtml survives malformed JSON-LD without throwing", () => {
  const p = parseHtml(
    `<html><head><script type="application/ld+json">{not json,,}</script></head><body><main>hi</main></body></html>`,
    "https://stride-ai.nl",
  );
  assert.deepEqual(p.schemaTypes, []);
});

test("scorePage rewards a well-formed page", () => {
  const p = parseHtml(HTML, "https://stride-ai.nl");
  const { score, findings } = scorePage(p, {
    route: "/services",
    primaryKeyword: "ai chatbot development",
  });
  assert.ok(score >= 90, `expected a high score, got ${score}: ${findings.map((f) => f.rule).join(", ")}`);
});

test("scorePage flags a missing title as critical", () => {
  const p = parseHtml("<html><body><main><p>hello</p></main></body></html>", "https://stride-ai.nl");
  const { findings } = scorePage(p, { route: "/x" });
  const title = findings.find((f) => f.rule === "title.missing");
  assert.equal(title.severity, "critical");
  assert.equal(title.autoFixable, true, "the optimiser can write a title into pages.json");
});

test("scorePage marks structural problems as not auto-fixable", () => {
  const p = parseHtml("<html><body><main><p>hello</p></main></body></html>", "https://stride-ai.nl");
  const { findings } = scorePage(p, { route: "/x" });
  const h1 = findings.find((f) => f.rule === "h1.missing");
  assert.equal(h1.autoFixable, false, "an H1 lives in JSX, which the agent must not edit");
});

test("scorePage catches keyword stuffing", () => {
  const stuffed = `<html><body><main><h1>ai agents</h1><p>${"ai agents ".repeat(60)} filler</p></main></body></html>`;
  const p = parseHtml(stuffed, "https://stride-ai.nl");
  const { findings } = scorePage(p, { route: "/x", primaryKeyword: "ai agents" });
  assert.ok(findings.some((f) => f.rule === "keyword.stuffed"));
});

test("scorePage treats thin content on an article as critical", () => {
  const p = parseHtml("<html><body><main><p>short</p></main></body></html>", "https://stride-ai.nl");
  const article = scorePage(p, { route: "/blog/x", isArticle: true });
  const page = scorePage(p, { route: "/x", isArticle: false });
  assert.equal(article.findings.find((f) => f.rule === "content.thin").severity, "critical");
  assert.equal(page.findings.find((f) => f.rule === "content.thin").severity, "medium");
});

// ---------- placement ----------

test("checkPlacement reports each required slot", () => {
  const r = checkPlacement("ai chatbot development", {
    title: "AI Chatbot Development for Dutch Businesses",
    description: "We do ai chatbot development.",
    h1: "AI chatbot development that pays for itself",
    slug: "/services",
    text: "AI chatbot development is what we do most.",
    headings: ["How the build works"],
  });
  assert.equal(r.inTitle, true);
  assert.equal(r.inH1, true);
  assert.equal(r.inDescription, true);
  assert.equal(r.inFirstParagraph, true);
  assert.equal(r.inSlug, false);
  assert.equal(r.ok, true, "a missing slug alone must not fail the page");
});

test("checkPlacement does not demand a slug rename on a live URL", () => {
  const r = checkPlacement("workflow automation", {
    title: "Workflow automation for finance teams",
    description: "Workflow automation, explained.",
    h1: "Workflow automation",
    slug: "/services",
    text: "Workflow automation removes the copying.",
  });
  assert.ok(r.missing.includes("url slug"));
  assert.equal(r.ok, true);
});

test("checkPlacement fails when the keyword is absent from the copy that matters", () => {
  const r = checkPlacement("ai agents", {
    title: "Our services",
    description: "What we do.",
    h1: "Services",
    slug: "/services",
    text: "We build things for companies.",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ["first 100 words", "h1", "meta description", "title", "url slug"].sort());
});

// ---------- meta validation ----------

test("validateMeta accepts a clean title", () => {
  const v = validateMeta("AI chatbot development for Dutch businesses", "title", "ai chatbot development");
  assert.equal(v.ok, true, v.problems.join("; "));
});

test("validateMeta rejects a title that lost the keyword", () => {
  const v = validateMeta("Everything we build for ambitious companies", "title", "ai chatbot development");
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("primary keyword")));
});

test("validateMeta rejects an over-length title", () => {
  const v = validateMeta(
    "AI chatbot development for Dutch businesses of every conceivable size and shape",
    "title",
    "ai chatbot development",
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("over 60")));
});

test("validateMeta enforces the shared voice gate on search snippets", () => {
  const v = validateMeta(
    "Unlock seamless ai agents to leverage your business potential today now",
    "title",
    "ai agents",
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.startsWith("voice gate")), v.problems.join("; "));
});

test("validateMeta rejects em dashes, the most reliable machine tell", () => {
  const v = validateMeta(
    "AI chatbot development — built for Dutch businesses that need it",
    "title",
    "ai chatbot development",
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("em or en dash")));
});

test("validateMeta holds descriptions to the snippet width", () => {
  const short = validateMeta("We build ai agents.", "description", "ai agents");
  assert.equal(short.ok, false);
  const good = validateMeta(
    "We build ai agents that finish the task instead of describing it, wired into the systems your team already uses, live in weeks not quarters.",
    "description",
    "ai agents",
  );
  assert.equal(good.ok, true, good.problems.join("; "));
});

// ---------- regressions from the first live sweep ----------

test("validateMeta rejects a title that starts lowercase", () => {
  // The first live run produced exactly this, by pasting the stored keyword
  // in verbatim at the start of the sentence.
  const v = validateMeta(
    "hire an AI consultant and book your consultation",
    "title",
    "hire an ai consultant",
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("starts lowercase")), v.problems.join("; "));
});

test("validateMeta accepts a keyword bent into a real sentence", () => {
  const v = validateMeta(
    "An AI consultancy in the Netherlands, built by two engineers",
    "title",
    "ai consultancy netherlands",
  );
  assert.equal(v.ok, true, v.problems.join("; "));
});

test("coversKeyword matches the phrase or all of its significant words", () => {
  assert.equal(coversKeyword("AI consultancy Netherlands", "ai consultancy netherlands"), true);
  assert.equal(coversKeyword("An AI consultancy in the Netherlands", "ai consultancy netherlands"), true);
  assert.equal(coversKeyword("A consultancy in the Netherlands", "ai consultancy netherlands"), false);
});

test("localeKeyword lets a Dutch page target a Dutch phrase", () => {
  const page = {
    route: "/blog",
    primaryKeyword: "ai for business blog",
    secondaryKeywords: [],
    locales: {
      en: { title: "t", description: "d" },
      nl: { title: "t", description: "d", primaryKeyword: "ai voor bedrijven" },
    },
  };
  assert.equal(localeKeyword(page, "en"), "ai for business blog");
  assert.equal(
    localeKeyword(page, "nl"),
    "ai voor bedrijven",
    "without this the optimiser forces an English phrase into a Dutch title",
  );
});
