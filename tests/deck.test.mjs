// The deck must not become a client component. Run: npm test
//
// Crude on purpose: this reads source rather than rendering anything. It is
// the only cheap check for a regression that is invisible in the UI until it
// is in front of a founder — the moment the deck or a slide goes "use client",
// the LinkedIn panel is pulled into the client bundle with it, the page stops
// streaming, and the front page waits on Linked Helper for forty seconds
// before it paints at all.
//
// Reads files, never data/, so no sandbox is needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(path) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

/** The directive itself, at the top of the file. Prose about it does not count. */
const USE_CLIENT = /^\s*["']use client["']/m;

const DECK = source("components/PanelDeck.tsx");
const PAGE = source("app/page.tsx");

test("the deck is a server component", () => {
  assert.equal(USE_CLIENT.test(DECK), false);
});

test("the deck never reads the bridge itself", () => {
  // Every slide arrives as JSX from the page. If the deck starts fetching, it
  // blocks the whole rail instead of one panel.
  assert.equal(DECK.includes("lib/channels/attention"), false);
  assert.equal(DECK.includes("@/lib/store"), false);
});

test("the LinkedIn panel is still behind a Suspense boundary", () => {
  const boundary = PAGE.match(/<Suspense[\s\S]{0,120}?<LhPulsePanel\s*\/>[\s\S]{0,40}?<\/Suspense>/);
  assert.ok(boundary, "LhPulsePanel is no longer inside a Suspense boundary");
});

test("the panels the deck carries are server components too", () => {
  for (const file of [
    "components/Panel.tsx",
    "components/PipelinePanel.tsx",
    "components/CalendarPanel.tsx",
    "components/ContentPanel.tsx",
    "components/LhPulsePanel.tsx",
  ]) {
    assert.equal(USE_CLIENT.test(source(file)), false, `${file} went client-side`);
  }
});
