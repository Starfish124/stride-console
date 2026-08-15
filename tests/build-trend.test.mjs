// The trend reader: newest feed wins, top five parse, and a missing engine
// yields nulls rather than a throw — the em-dash rule at the data layer.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTrendStatus } from "../lib/build/trend.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "trend");

test("reads the newest feed and the insights head", () => {
  process.env.TREND_DIR = FIXTURE;
  const s = readTrendStatus();
  assert.ok(s.freshAt, "mtime of the newest feed");
  assert.equal(s.top.length, 5, "capped at five");
  assert.equal(s.top[0].title, "smiski", "newest feed, not the old one");
  assert.equal(s.top[0].growth, 5675.14);
  assert.ok(s.insights.includes("labubu"));
  assert.equal(s.hasClusters, false);
});

test("a missing engine is nulls, never a throw", () => {
  process.env.TREND_DIR = path.join(FIXTURE, "does-not-exist");
  const s = readTrendStatus();
  assert.equal(s.freshAt, null);
  assert.deepEqual(s.top, []);
  assert.equal(s.insights, null);
  assert.equal(s.hasClusters, false);
});
