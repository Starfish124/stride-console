// Interview notes: append into the repo, and take one back out. Run: npm test
//
// Own file on purpose: it points DURABO_DIR at a throwaway repo, and the test
// runner gives each file its own process, so the fixture can't leak into the
// real-repo tests in durabo.test.mjs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "durabo-notes-"));
  fs.mkdirSync(path.join(tmp, "Project-Status"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "employees", "test-person"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "Project-Status", "00-Roster.md"),
    `
| # | Name | Department | Status | Interview date | Email | Employee file |
|---|---|---|---|---|---|---|
| 1 | Test Person | QA | scheduled | 12 Aug 2026, 09:00 | t@durabo.nl | \`employees/test-person/test-person.md\` |
`,
  );
  process.env.DURABO_DIR = tmp;
});

after(() => {
  delete process.env.DURABO_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("a note can be appended and that exact note removed, others untouched", async () => {
  const { appendNote, readNotes, removeNoteBlock } = await import("../lib/durabo/io.ts");
  appendNote("test-person", "Eerste observatie.", "Sarvesh");
  appendNote("test-person", "Tweede observatie.", "Jort");

  const notes = readNotes("test-person");
  assert.ok(notes.includes("Eerste observatie."));
  assert.ok(notes.includes("Tweede observatie."));
  assert.ok(notes.startsWith("# Interviewnotities"));

  // Remove the first block the way the UI sends it: the block's exact text.
  const first = notes.split(/\n(?=\*\*)/).find((b) => b.includes("Eerste"));
  assert.ok(removeNoteBlock("test-person", first));

  const left = readNotes("test-person");
  assert.ok(!left.includes("Eerste observatie."));
  assert.ok(left.includes("Tweede observatie."));
  assert.ok(left.startsWith("# Interviewnotities"), "the title line survives");
});

test("removing text that is not there says no and changes nothing", async () => {
  const { readNotes, removeNoteBlock } = await import("../lib/durabo/io.ts");
  const beforeText = readNotes("test-person");
  assert.equal(removeNoteBlock("test-person", "nooit geschreven"), false);
  assert.equal(removeNoteBlock("test-person", "   "), false);
  assert.equal(readNotes("test-person"), beforeText);
});

test("an unknown slug throws rather than writing anywhere", async () => {
  const { removeNoteBlock } = await import("../lib/durabo/io.ts");
  assert.throws(() => removeNoteBlock("not-on-roster", "x"));
});
