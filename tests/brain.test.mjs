// The Hermes brain: the pure parts pinned, and the store against a real
// temporary SQLite file — mocking the database is how you miss FTS syntax
// errors. No test here ever spawns the Claude CLI.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Brain } from "../lib/brain/store.ts";
import { diffSnapshots } from "../lib/brain/diff.ts";
import { parseMemories, MAX_MEMORIES } from "../lib/brain/distill.ts";
import { recallBlock, renderRecall } from "../lib/brain/recall.ts";

function tmpBrain() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-"));
  return new Brain(path.join(dir, "brain.db"));
}

// ---------- parseMemories ----------

test("parseMemories reads a clean array", () => {
  const out = parseMemories('[{"subject":"A","body":"B"}]');
  assert.deepEqual(out, [{ subject: "A", body: "B" }]);
});

test("parseMemories salvages an array buried in prose", () => {
  const out = parseMemories('Here you go:\n```json\n[{"subject":"A","body":"B"}]\n```');
  assert.equal(out.length, 1);
});

test("parseMemories returns nothing for garbage", () => {
  assert.deepEqual(parseMemories("no json here"), []);
  assert.deepEqual(parseMemories('{"subject":"not an array"}'), []);
});

test("parseMemories drops entries missing subject or body, and caps", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ subject: `S${i}`, body: "b" }));
  const out = parseMemories(JSON.stringify([{ subject: "", body: "x" }, { body: "x" }, ...many]));
  assert.equal(out.length, MAX_MEMORIES);
  assert.equal(out[0].subject, "S0");
});

// ---------- diffSnapshots ----------

const client = (id, stage, name = "Niek") => ({ id, name, company: "Acme", stage });

test("diffSnapshots sees a stage move", () => {
  const events = diffSnapshots("clients", [client("c1", "talking")], [client("c1", "proposal")]);
  assert.deepEqual(events, ["Niek at Acme moved talking → proposal."]);
});

test("diffSnapshots sees arrivals and departures", () => {
  const events = diffSnapshots("clients", [client("c1", "lead")], [client("c2", "lead", "Eva")]);
  assert.equal(events.length, 2);
  assert.match(events[0], /New in the pipeline: Eva/);
  assert.match(events[1], /Removed from the pipeline: Niek/);
});

test("diffSnapshots sees a note changing lanes", () => {
  const events = diffSnapshots(
    "notes",
    [{ id: "n1", text: "Host the deck", lane: "todo" }],
    [{ id: "n1", text: "Host the deck", lane: "done" }],
  );
  assert.deepEqual(events, ['Note moved todo → done: "Host the deck"']);
});

test("diffSnapshots is silent on no change and unknown stores", () => {
  const same = [client("c1", "lead")];
  assert.deepEqual(diffSnapshots("clients", same, same), []);
  assert.deepEqual(diffSnapshots("mystery", [{ id: "x" }], []), []);
});

// ---------- the store ----------

test("brain stores, searches and ranks", () => {
  const b = tmpBrain();
  b.add({ kind: "session", subject: "Kickstart after every build", body: "launchd serves a half-replaced .next otherwise.", sourceRef: "session:a.md" });
  b.add({ kind: "run", subject: "Durabo prefers Dutch copy", body: "English drafts were rejected twice.", sourceRef: "run:r1" });
  assert.equal(b.count(), 2);
  const hits = b.search("durabo dutch");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "run");
  // Punctuation-heavy founder input must not throw FTS syntax errors.
  assert.deepEqual(b.search('"(durabo* AND'), [hits[0]]);
  assert.deepEqual(b.search("!!!"), []);
  b.close();
});

test("the distilled ledger is idempotent", () => {
  const b = tmpBrain();
  assert.equal(b.isDistilled("session:a.md"), false);
  b.markDistilled("session:a.md");
  b.markDistilled("session:a.md");
  assert.equal(b.isDistilled("session:a.md"), true);
  b.close();
});

test("snapshots round-trip", () => {
  const b = tmpBrain();
  assert.equal(b.getSnapshot("clients"), undefined);
  b.putSnapshot("clients", [{ id: "c1" }]);
  assert.deepEqual(b.getSnapshot("clients"), [{ id: "c1" }]);
  b.close();
});

// ---------- recall ----------

test("recallBlock renders relevant memories and survives an empty brain", () => {
  const b = tmpBrain();
  assert.equal(recallBlock("anything", 5, b), "");
  b.add({ kind: "run", subject: "Acme deploys on Fridays only", body: "Their ops window.", sourceRef: "run:r1" });
  const block = recallBlock("acme", 5, b);
  assert.match(block, /WHAT THE CONSOLE REMEMBERS/);
  assert.match(block, /Acme deploys on Fridays only/);
  b.close();
});

test("renderRecall of nothing is an empty string", () => {
  assert.equal(renderRecall([]), "");
});
