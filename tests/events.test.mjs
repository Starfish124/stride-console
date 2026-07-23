// Event engine: checklist generation, rate limiting, and the four event
// templates staying lint-clean. Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist } from "../lib/store.ts";
import { allowRequest, resetRateLimit } from "../lib/rateLimit.ts";
import { templateWrite } from "../lib/pipeline/write.ts";
import { lint, formatViolations } from "../lib/pipeline/lint.ts";
import { assembleVariant } from "../lib/pipeline/run.ts";

const EVENT = {
  title: "1 Min AI Pitch",
  date: "2026-09-17",
  venue: "De Loods, Amsterdam",
  capacity: 80,
  signups: [
    { name: "A", startup: "Fleetline", idea: "route planning for small hauliers that reacts to live loads" },
    { name: "B", startup: "Klaarbot", idea: "invoice chasing that sounds like you wrote it yourself" },
    { name: "C", startup: "Warmstart", idea: "onboarding flows for trade companies hiring their first office staff" },
  ],
};

test("the checklist covers the T-6-weeks plan with due dates before the event", () => {
  const checklist = buildChecklist("2026-09-17");
  assert.equal(checklist.length, 6);
  const labels = checklist.map((i) => i.label.toLowerCase()).join(" ");
  for (const needed of ["venue", "invites", "speakers", "investors", "catering", "photographer"]) {
    assert.ok(labels.includes(needed), `missing ${needed}`);
  }
  // Venue is the T-6-weeks item: 42 days before September 17 is August 6.
  assert.equal(checklist[0].due, "2026-08-06");
  for (const item of checklist) {
    assert.ok(item.due < "2026-09-17", `${item.label} due after the event`);
    assert.equal(item.done, false);
  }
});

test("the rate limiter allows 5 per hour per IP, then blocks", () => {
  resetRateLimit();
  const now = Date.parse("2026-07-23T12:00:00Z");
  for (let i = 0; i < 5; i++) {
    assert.ok(allowRequest("1.2.3.4", now + i), `request ${i + 1} should pass`);
  }
  assert.equal(allowRequest("1.2.3.4", now + 10), false);
  // A different IP is unaffected, and the window slides.
  assert.ok(allowRequest("5.6.7.8", now));
  assert.ok(allowRequest("1.2.3.4", now + 61 * 60 * 1000));
  resetRateLimit();
});

for (const recipe of ["eventAnnounce", "eventLineup", "eventReminder", "eventRecap"]) {
  test(`the ${recipe} template passes the voice gate, with and without signups`, () => {
    for (const event of [EVENT, { ...EVENT, signups: [] }]) {
      const out = templateWrite(recipe, { items: [], event, weekNumber: 38 });
      const text = assembleVariant(out.body, out.hashtags);
      const result = lint(text);
      assert.equal(
        result.errors,
        0,
        `${recipe} (${event.signups.length} signups):\n${formatViolations(result)}`,
      );
      assert.ok(out.imageHeadline.length > 0);
    }
  });
}
