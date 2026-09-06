// Where things live, and whether you can still ask for them.
//
// Two of these guard failures an audit found rather than a test: the manual
// queue was rendered at two URLs from the same data, and the console's only
// stop switch existed on exactly one page while two components linked to it by
// name. Neither is the kind of bug a unit test of a function catches — they are
// facts about which file renders what, so these read the source and assert on
// it. Crude on purpose, same as tests/deck.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchDestination, MENU } from "../lib/menu.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Every page file, so "rendered once" is a claim about all of them. */
function pageFiles(dir = "app", found = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(rel, found);
    else if (entry.name === "page.tsx") found.push(rel);
  }
  return found;
}

test("the outreach words all still lead somewhere", () => {
  // The menu collapsed five outreach entries into one, which took their labels
  // with them. matchDestination scores a hint at 40, exactly its own floor, so
  // every word that used to be a row has to be written into the surviving hint
  // or asking for it silently resolves to nothing — or worse, to another page.
  for (const phrase of ["lead book", "the queue", "replies", "the brake", "leads", "apollo"]) {
    const hit = matchDestination(phrase);
    assert.ok(hit, `"${phrase}" resolves to nothing`);
    assert.equal(hit.href, "/outreach", `"${phrase}" went to ${hit.href}`);
  }
  // And the section really did shrink.
  assert.equal(MENU.find((s) => s.id === "leadgen").items.length, 1);
});

test("clients are not leads any more", () => {
  // "Clients and leads" outscored the lead book on its own label, so anybody
  // asking for leads landed on the pipeline instead.
  assert.equal(matchDestination("clients")?.href, "/clients");
});

test("the queue is rendered on exactly one page", () => {
  const pages = pageFiles().filter((p) => read(p).includes("<ManualQueue"));
  assert.deepEqual(pages, ["app/outreach/page.tsx"],
    "the same cards and the same buttons at two URLs is how nobody knows which is real");
});

test("the brake is rendered on exactly one page, and things link to it", () => {
  const pages = pageFiles().filter((p) => read(p).includes("<SalesNavControls"));
  assert.deepEqual(pages, ["app/salesnav/page.tsx"]);
  // Two components send a founder there by name. If that page ever stops
  // rendering the control, stopping outreach from a phone becomes an SSH job.
  for (const file of ["components/EngineLight.tsx", "components/OutreachBand.tsx"]) {
    assert.ok(read(file).includes("/salesnav"), `${file} no longer points at the brake`);
  }
});

test("settling a step twice is answered, not refused", () => {
  // A response dropped over the tailnet reverts the optimistic removal, the
  // founder taps again, and the second write finds the step already settled.
  // Answering 400 to that reports a failure for something that worked.
  const route = read("app/api/salesnav/manual/route.ts");
  assert.match(route, /findManualStep/, "the route must look for an already settled step");
  assert.match(route, /already: true/, "and answer it rather than erroring");
});

test("the queue card never traps somebody on one message", () => {
  // One card at a time means a step that cannot be settled — a server error, a
  // step the runner expired between render and tap — has to be passable, or the
  // whole queue is stuck behind it.
  const queue = read("components/ManualQueue.tsx");
  assert.match(queue, /Leave this one/, "there must be a way past the top card");
  // And a reply is never optimistic: it withdraws the whole enrolment, so a
  // lost write there keeps messaging somebody who already answered.
  assert.match(queue, /if \(action !== "replied"\) settle\(key\)/);
});
