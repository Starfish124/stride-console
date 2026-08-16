import test from "node:test";
import assert from "node:assert/strict";

import { isDue } from "../scripts/agents.mjs";

// 07:40 on a Sunday, inside every catch-up window in the file.
const NOW = new Date("2026-08-16T07:45:00");
const TODAY = "2026-08-16";

const articles = {
  name: "articles",
  hour: 7,
  minute: 40,
  days: [0, 1, 2, 3, 4, 5, 6],
  catchUpUntilHour: 22,
  retries: 2,
};
const sweep = {
  name: "sweep",
  hour: 3,
  minute: 15,
  days: [0, 1, 2, 3, 4, 5, 6],
  catchUpUntilHour: 12,
};

test("a job that has not run today is due", () => {
  assert.equal(isDue(articles, NOW, {}), true);
  assert.equal(isDue(articles, NOW, { articles: { lastRunDay: "2026-08-15" } }), true);
});

test("a job that succeeded today is done", () => {
  const state = { articles: { lastRunDay: TODAY, lastExitCode: 0, attempts: 1 } };
  assert.equal(isDue(articles, NOW, state), false);
});

// The hole this closes: tick() recorded lastRunDay whatever the exit code, so a
// crashed writer — or a day where the voice gate held every draft — booked
// itself as complete and the blog simply skipped a day. An article a day is not
// a thing a failed run gets to decide.
test("a job that failed today is tried again", () => {
  const state = { articles: { lastRunDay: TODAY, lastExitCode: 1, attempts: 1 } };
  assert.equal(isDue(articles, NOW, state), true);
});

test("retries are capped, so a fault a retry cannot fix stops costing money", () => {
  const spent = { articles: { lastRunDay: TODAY, lastExitCode: 1, attempts: 3 } };
  assert.equal(isDue(articles, NOW, spent), false, "one run plus two retries is the budget");
});

test("only a job with a standing daily obligation retries", () => {
  // The sweep has no floor to meet. A failed sweep waits for tomorrow rather
  // than hammering Google's autocomplete endpoint every minute until noon.
  const state = { sweep: { lastRunDay: TODAY, lastExitCode: 1, attempts: 1 } };
  assert.equal(isDue(sweep, NOW, state), false);
});

test("the catch-up window still closes on a retry", () => {
  const late = new Date("2026-08-16T23:00:00");
  const state = { articles: { lastRunDay: TODAY, lastExitCode: 1, attempts: 1 } };
  assert.equal(isDue(articles, late, state), false);
});
