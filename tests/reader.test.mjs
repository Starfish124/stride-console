// Article enrichment: Jina Reader cleanup + best-effort attachment. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanArticle, enrichItems, readArticle } from "../lib/pipeline/reader.ts";
import { mergeSources } from "../lib/store.ts";

test("cleanArticle strips images, unwraps links, drops nav noise", () => {
  const md = [
    "# The headline",
    "",
    "![hero image](https://cdn.example.com/x.png)",
    "Subscribe to our newsletter",
    "The company [shipped a model](https://example.com/m) on Tuesday.",
    "---",
    "It costs $4 per million tokens.",
  ].join("\n");
  const out = cleanArticle(md);
  assert.ok(out.includes("shipped a model on Tuesday"));
  assert.ok(out.includes("$4 per million tokens"));
  assert.ok(!out.includes("cdn.example.com"));
  assert.ok(!out.includes("Subscribe"));
  assert.ok(!out.includes("---"));
});

test("cleanArticle caps length on a paragraph edge", () => {
  const para = "A sentence that repeats to build length. ".repeat(20).trim();
  const md = Array.from({ length: 30 }, () => para).join("\n\n");
  const out = cleanArticle(md, 2000);
  assert.ok(out.length <= 2000);
  assert.ok(out.endsWith("."), `ended mid-paragraph: …${out.slice(-30)}`);
});

test("enrichItems attaches content to top items and survives failures", async (t) => {
  const article = `${"Real article prose. ".repeat(40)}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("fails.example")) throw new Error("boom");
    return new Response(article, { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const items = [
    { title: "A", url: "https://ok.example/a", source: "s", tier: 1, score: 5 },
    { title: "B", url: "https://fails.example/b", source: "s", tier: 1, score: 4 },
    { title: "C", url: "https://ok.example/c", source: "s", tier: 2, score: 3 },
    { title: "D", url: "https://ok.example/d", source: "s", tier: 3, score: 2 },
  ];
  const report = await enrichItems(items, 3);
  assert.equal(report.attempted, 3);
  assert.equal(report.enriched, 2);
  assert.ok(items[0].content?.includes("Real article prose"));
  assert.equal(items[1].content, undefined);
  assert.ok(items[2].content);
  assert.equal(items[3].content, undefined, "item outside count untouched");
});

test("readArticle rejects thin responses (paywall stubs, error pages)", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Access denied.", { status: 200 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  assert.equal(await readArticle("https://example.com/x"), undefined);
});

test("mergeSources keeps user edits and appends only missing defaults", () => {
  const current = [
    { id: "openai", name: "OpenAI (renamed by user)", url: "https://u.example", kind: "rss", tier: 2 },
    { id: "custom", name: "My feed", url: "https://mine.example", kind: "rss", tier: 1 },
  ];
  const defaults = [
    { id: "openai", name: "OpenAI News", url: "https://openai.example", kind: "rss", tier: 1 },
    { id: "sifted", name: "Sifted", url: "https://sifted.example", kind: "rss", tier: 2 },
  ];
  const merged = mergeSources(current, defaults);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((s) => s.id === "openai").name, "OpenAI (renamed by user)");
  assert.ok(merged.find((s) => s.id === "sifted"));
  assert.ok(merged.find((s) => s.id === "custom"));
});
