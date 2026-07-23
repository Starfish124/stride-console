// Dedupe similarity checks. Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { titleSimilarity, isDuplicate, normalizeTitle } from "../lib/store.ts";

test("same story with slightly different titles reads as a duplicate", () => {
  const a = "OpenAI cuts GPT-5 API prices by 40 percent for batch workloads";
  const b = "OpenAI cuts GPT-5 API prices by 40% for batch workloads";
  assert.ok(titleSimilarity(a, b) > 0.8, `similarity was ${titleSimilarity(a, b)}`);
});

test("unrelated titles are not duplicates", () => {
  const a = "OpenAI cuts GPT-5 API prices by 40 percent for batch workloads";
  const b = "EU publishes final guidance on AI Act compliance for small firms";
  assert.ok(titleSimilarity(a, b) < 0.5, `similarity was ${titleSimilarity(a, b)}`);
});

test("identical URL is a duplicate regardless of title", () => {
  const seen = [
    { url: "https://example.com/story", title: normalizeTitle("Some headline"), seenAt: "2026-07-20T00:00:00.000Z" },
  ];
  assert.ok(
    isDuplicate({ url: "https://example.com/story", title: "A completely different headline" }, seen),
  );
});

test(">80% similar title is a duplicate even with a new URL", () => {
  const seen = [
    {
      url: "https://example.com/original",
      title: normalizeTitle("Anthropic ships file-search tool for Claude, cutting agent setup time"),
      seenAt: "2026-07-20T00:00:00.000Z",
    },
  ];
  assert.ok(
    isDuplicate(
      {
        url: "https://mirror.example.com/repost",
        title: "Anthropic ships file search tool for Claude, cutting agent setup time",
      },
      seen,
    ),
  );
});

test("fresh story against an empty cache is not a duplicate", () => {
  assert.equal(isDuplicate({ url: "https://example.com/new", title: "Brand new story" }, []), false);
});

test("normalizeTitle strips punctuation and case", () => {
  assert.equal(normalizeTitle("  GPT-5: The 40% Cut!  "), "gpt 5 the 40 cut");
});
