// Voice navigation: the deterministic half. No model, no network — just the
// verb-then-target parse and the destination scorer it hands off to.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNavigation } from "../lib/ask/navigate.ts";
import { matchDestination, matchDestinations } from "../lib/menu.ts";

const CLIENTS = [
  { id: "c1", label: "Durabo" },
  { id: "c2", label: "Acme B.V." },
];

test("an ordinary question never navigates", () => {
  assert.equal(detectNavigation("what needs me today"), undefined);
  assert.equal(detectNavigation("is anything late"), undefined);
  assert.equal(detectNavigation("team meeting notes from last week"), undefined);
});

test("open/go to/show me all trigger, case-insensitively", () => {
  assert.ok(detectNavigation("open invoices"));
  assert.ok(detectNavigation("Go to invoices"));
  assert.ok(detectNavigation("SHOW ME invoices"));
  assert.ok(detectNavigation("take me to invoices"));
  assert.ok(detectNavigation("pull up invoices"));
});

test("a named client outranks a menu-label guess", () => {
  const hit = detectNavigation("open Durabo", CLIENTS);
  assert.deepEqual(hit, { href: "/clients/c1", label: "Durabo" });
});

test("client match is case-insensitive and tolerates extra words", () => {
  assert.equal(detectNavigation("go to durabo please", CLIENTS)?.href, "/clients/c1");
  assert.equal(detectNavigation("show me the acme b.v. page", CLIENTS)?.href, "/clients/c2");
});

test("falls through to a menu match when no client fits", () => {
  const hit = detectNavigation("open the blueprints", CLIENTS);
  assert.equal(hit?.href, "/blueprints");
});

test("a verb with no confident match navigates nowhere", () => {
  assert.equal(detectNavigation("open the pod bay doors", CLIENTS), undefined);
});

test("the wake-word prefix and a please do not block the verb match", () => {
  assert.equal(detectNavigation("hey stride, open invoices")?.href, "/invoices");
  assert.equal(detectNavigation("please open invoices")?.href, "/invoices");
});

// ---------- the scorer underneath ----------

test("exact label beats a prefix beats a substring", () => {
  const hits = matchDestinations("invoices");
  assert.equal(hits[0]?.href, "/invoices");
});

test("matchDestination respects its confidence floor", () => {
  assert.equal(matchDestination("xyxyxyxyxy"), undefined);
  assert.ok(matchDestination("invoices"));
});

test("matchDestinations on empty input returns nothing", () => {
  assert.deepEqual(matchDestinations(""), []);
  assert.deepEqual(matchDestinations("   "), []);
});
