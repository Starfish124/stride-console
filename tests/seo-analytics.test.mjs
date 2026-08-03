import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalytics,
  byLocale,
  delta,
  strikingDistance,
  untrackedQueries,
} from "../lib/seo/analytics.ts";
import { sparkPoints } from "../lib/seo/spark.ts";

function q(query, clicks, impressions, position) {
  return { query, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

function stats(overrides = {}) {
  return {
    available: true,
    from: "2026-07-06",
    to: "2026-08-03",
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    queries: [],
    pages: [],
    ...overrides,
  };
}

// ---------- deltas ----------

test("no previous data is not growth", () => {
  // "0 to 4 clicks" and "never measured to 4 clicks" are different sentences,
  // and a brand new property spends its first month in the second one. Printing
  // a percentage there would be the dashboard's first invented number.
  const cold = delta(0, 0);
  assert.equal(cold.unmeasured, true);
  assert.equal(cold.ratio, undefined);
  assert.equal(cold.better, undefined);

  const first = delta(4, 0);
  assert.equal(first.change, 4);
  assert.equal(first.ratio, undefined, "no denominator, so no percentage");
  assert.equal(first.better, true);
});

test("a falling average position is an improvement", () => {
  const climbed = delta(6.2, 11.4, "down-good");
  assert.ok(climbed.change < 0);
  assert.equal(climbed.better, true, "position 6 beats position 11");

  const slipped = delta(14, 9, "down-good");
  assert.equal(slipped.better, false);
});

test("an unchanged number has no direction at all", () => {
  assert.equal(delta(120, 120).better, undefined);
});

// ---------- striking distance ----------

test("striking distance ranks by impressions, not by rank", () => {
  const rows = strikingDistance([
    q("ai consultant nederland", 0, 900, 14),
    q("ai chatbot laten maken", 1, 9, 5),
    q("ai agency", 40, 2000, 1.8),
    q("workflow automation", 0, 300, 26),
    q("ai agent kosten", 2, 400, 7.5),
  ]);

  assert.deepEqual(
    rows.map((r) => r.query),
    ["ai consultant nederland", "ai agent kosten"],
    "position 1.8 is already won and 26 is not in reach; the 9-impression term is noise",
  );
  // Rank 14 with 900 impressions outranks rank 7 with 400, because the work is
  // worth more where people are already looking.
  assert.equal(rows[0].gap, 11, "eleven places to reach the third result");
});

test("the impression floor keeps single sightings out of the worklist", () => {
  const noisy = [q("odd long tail phrase", 0, 2, 8)];
  assert.equal(strikingDistance(noisy).length, 0);
  assert.equal(strikingDistance(noisy, { minImpressions: 1 }).length, 1);
});

// ---------- untracked queries ----------

test("queries Google reports that the store has never heard of", () => {
  const rows = untrackedQueries(
    [
      q("ai bureau utrecht", 1, 50, 12),
      q("ai consultant", 0, 40, 18),
      q("one off typo", 0, 1, 60),
    ],
    ["AI Consultant", "ai agent pricing"],
  );

  assert.deepEqual(rows.map((r) => r.query), ["ai bureau utrecht"]);
});

// ---------- locale split ----------

test("the locale split comes from the URL, because a query has no language", () => {
  const split = byLocale([
    { page: "https://stride-ai.nl/services", clicks: 5, impressions: 100, ctr: 0.05, position: 8 },
    { page: "https://stride-ai.nl/nl/blog/wat-is-ai-consultant", clicks: 3, impressions: 300, ctr: 0.01, position: 12 },
    { page: "https://stride-ai.nl/nl/services", clicks: 1, impressions: 50, ctr: 0.02, position: 9 },
  ]);

  assert.deepEqual(split.map((s) => s.locale), ["nl", "en"], "ordered by impressions");
  assert.equal(split[0].impressions, 350);
  assert.equal(split[0].pages, 2);
  assert.equal(split[1].clicks, 5);
});

// ---------- sparkline geometry ----------

test("a flat series sits on the baseline instead of dividing by zero", () => {
  const points = sparkPoints([7, 7, 7]);
  assert.deepEqual(points.map((p) => p.y), [1, 1, 1]);
});

test("sparkline y is flipped for SVG, where the top is zero", () => {
  const points = sparkPoints([0, 10]);
  assert.equal(points[0].y, 1, "the low value sits at the bottom");
  assert.equal(points[1].y, 0, "the high value sits at the top");
  assert.equal(points[1].x, 1);
});

test("one day is one point, not a two-point trend", () => {
  assert.deepEqual(sparkPoints([5]), [{ x: 0.5, y: 1 }]);
  assert.deepEqual(sparkPoints([]), []);
});

// ---------- assembly ----------

test("a connected property with an empty window is awaiting data, not failing", () => {
  // Exactly the state stride-ai.nl is in: verified 2 Aug, Search Console lags
  // about two days and does not backfill.
  const view = buildAnalytics(stats(), stats(), [], []);
  assert.equal(view.available, true);
  assert.equal(view.awaitingData, true);
  assert.equal(view.striking.length, 0);
  assert.equal(view.deltas.clicks.unmeasured, true);
});

test("an unconfigured property is not awaiting data, it is disconnected", () => {
  const view = buildAnalytics(
    stats({ available: false, reason: "no key found" }),
    stats({ available: false }),
    [],
    [],
  );
  assert.equal(view.available, false);
  assert.equal(view.awaitingData, false, "these two states must not collapse into one");
  assert.equal(view.reason, "no key found");
});

test("assembly wires every list off the current window", () => {
  const current = stats({
    totals: { clicks: 12, impressions: 1400, ctr: 12 / 1400, position: 11.2 },
    queries: [q("ai consultant nederland", 6, 900, 12), q("ai agency", 6, 500, 4.4)],
    pages: [
      { page: "https://stride-ai.nl/nl/services", clicks: 6, impressions: 900, ctr: 0.006, position: 12 },
    ],
  });
  const previous = stats({ totals: { clicks: 4, impressions: 600, ctr: 4 / 600, position: 15.9 } });

  const view = buildAnalytics(current, previous, [{ date: "2026-08-01", clicks: 2, impressions: 90 }], ["ai agency"]);

  assert.equal(view.awaitingData, false);
  assert.equal(view.deltas.clicks.change, 8);
  assert.equal(view.deltas.position.better, true, "15.9 to 11.2 is a climb");
  assert.equal(view.striking.length, 2);
  assert.deepEqual(view.untracked.map((r) => r.query), ["ai consultant nederland"]);
  assert.deepEqual(view.locales.map((l) => l.locale), ["nl"]);
  assert.equal(view.daily.length, 1);
});
