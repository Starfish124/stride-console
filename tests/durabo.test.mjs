// The two parsers over the Durabo discovery repo's markdown. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mdToHtml, parseEmployeeDoc, parseFieldCard, parseRoster } from "../lib/durabo/parse.ts";

const ROSTER = `
| # | Name | Department | Status | Interview date | Email | Employee file |
|---|---|---|---|---|---|---|
| 1 | Ben Coes | Supply Chain & Logistics (Head of Logistics) | excluded (op vakantie) | — *(not scheduled)* | b.coes@durabo.nl | \`employees/ben-coes/ben-coes.md\` |
| 9 | Destiny van der Greft | Sales & Customer Support (Sales Support Manager) | scheduled | 12 Aug 2026, 09:00 (moved from 16:00 — Jort) | des@durabo.nl | \`employees/destiny-van-der-greft/destiny-van-der-greft.md\` |
| 20 | Bianca Ebbelaar | Leadership (General Manager) | scheduled | 13 Aug 2026, 16:00 | b.ebbelaar@durabo.nl | \`employees/bianca-ebbelaar/bianca-ebbelaar.md\` |
`;

test("roster rows parse: slot, slug, interviewer annotation", () => {
  const rows = parseRoster(ROSTER);
  assert.equal(rows.length, 3);
  const [ben, destiny, bianca] = rows;
  assert.equal(ben.status, "excluded");
  assert.equal(ben.date, undefined);
  assert.equal(destiny.slug, "destiny-van-der-greft");
  assert.equal(destiny.date, "2026-08-12");
  assert.equal(destiny.time, "09:00");
  assert.equal(destiny.interviewer, "Jort");
  assert.equal(bianca.date, "2026-08-13");
  assert.equal(bianca.interviewer, undefined);
});

const CARD = `# FIELD CARD

Preamble that is not a step.

## Voor je begint

Not numbered, not a step.

## 1 · Kader + opname (2 min) — NOOIT overslaan

Zeg dit.

> - Punt een.
> - Punt twee.

## 2 · Rondleiding (4 min)

**Vraag:** loop je dag door.

---
`;

test("field card: numbered steps with cumulative time marks, preamble dropped", () => {
  const steps = parseFieldCard(CARD);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].num, 1);
  assert.equal(steps[0].minutes, 2);
  assert.equal(steps[0].flag, "NOOIT overslaan");
  assert.equal(steps[0].endsBy, 2);
  assert.equal(steps[1].endsBy, 6);
  assert.equal(steps[1].flag, "");
  assert.ok(steps[0].html.includes("<blockquote>"));
  assert.ok(steps[1].html.includes("<strong>Vraag:</strong>"));
});

test("the real field card parses to 18 steps", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const file = path.join(
    process.env.DURABO_DIR ?? path.join(os.homedir(), "ai-discovery-durabo"),
    "Prompts",
    "10-Field-Card-45min-NL.md",
  );
  if (!fs.existsSync(file)) return; // repo not on this machine; parser is covered above
  const steps = parseFieldCard(fs.readFileSync(file, "utf8"));
  assert.equal(steps.length, 18);
  assert.equal(steps.at(-1).num, 18);
});

test("employee doc: frontmatter to meta, MAP-DATA stripped, body rendered", () => {
  const doc = parseEmployeeDoc(`---
name: Abel Kleefstra
status: scheduled
---

<!-- MAP-DATA:START -->
secret json block
<!-- MAP-DATA:END -->

# Abel

**Module: Supply Chain.**
`);
  assert.equal(doc.meta.name, "Abel Kleefstra");
  assert.ok(!doc.html.includes("secret json"));
  assert.ok(doc.html.includes("<strong>Module: Supply Chain.</strong>"));
});

test("markdown renderer escapes html", () => {
  assert.ok(!mdToHtml("Hello <script>alert(1)</script>").includes("<script>"));
});

test("front-page tile: only while slots fall today or tomorrow", async () => {
  const { buildQuickMenu } = await import("../lib/dashboard.ts");
  const QUIET = { replies: 0, clients: 0, late: 0, draftsWaiting: 0, seoFindings: 0, toBuild: 0 };
  assert.equal(buildQuickMenu(QUIET).find((t) => t.label === "Durabo"), undefined);
  const busy = buildQuickMenu({ ...QUIET, interviews: { done: 3, total: 10 } });
  const tile = busy.find((t) => t.label === "Durabo");
  assert.equal(tile.count, 7);
  assert.equal(tile.tone, "warn");
  assert.equal(busy[0].label, "Durabo");
  const done = buildQuickMenu({ ...QUIET, interviews: { done: 10, total: 10 } });
  assert.equal(done.find((t) => t.label === "Durabo").tone, "good");
});

test("interviewPulse windows on the roster dates", async () => {
  const { interviewPulse } = await import("../lib/durabo/io.ts");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = path.join(process.env.DURABO_DIR ?? path.join(os.homedir(), "ai-discovery-durabo"));
  if (!fs.existsSync(root)) return;
  // 11 Aug: tomorrow has slots -> tile. 14 Aug: window empty -> gone.
  const eve = interviewPulse(new Date("2026-08-11T20:00:00"));
  assert.ok(eve && eve.total > 0);
  assert.equal(interviewPulse(new Date("2026-08-14T09:00:00")), undefined);
});

test("dutch subtitle hallucinations read as silence", async () => {
  const { cleanTranscript } = await import("../lib/speech/whisper.ts");
  assert.equal(cleanTranscript(" Ondertitels ingediend door de Amara.org gemeenschap"), "");
  assert.equal(cleanTranscript("Ondertiteld door de Amara.org gemeenschap."), "");
  assert.equal(
    cleanTranscript("Ik werk elke ochtend de orderlijst bij in Exact."),
    "Ik werk elke ochtend de orderlijst bij in Exact.",
  );
});

test("audio segments land under data/ per person per day, sorted", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = process.env.DURABO_DIR ?? path.join(os.homedir(), "ai-discovery-durabo");
  if (!fs.existsSync(root)) return;
  const { saveSegment, audioDir } = await import("../lib/durabo/audio.ts");
  const slug = "abel-kleefstra";
  const a = saveSegment(slug, 3671, "audio/mp4", new Uint8Array([1]));
  const b = saveSegment(slug, 3691, "video/webm;codecs=opus", new Uint8Array([2]));
  assert.ok(a.endsWith("seg-03671.m4a"));
  assert.ok(b.endsWith("seg-03691.webm"));
  assert.ok(a < b); // zero-padded names keep phone order on disk
  fs.rmSync(path.join(audioDir(slug), ".."), { recursive: true, force: true });
});

test("readTranscript without a date falls back to the newest transcript on disk", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = process.env.DURABO_DIR ?? path.join(os.homedir(), "ai-discovery-durabo");
  if (!fs.existsSync(root)) return;
  const { audioDir, readTranscript, transcriptFile } = await import("../lib/durabo/audio.ts");
  const slug = "abel-kleefstra";
  for (const [date, text] of [["2020-01-01", "oud"], ["2020-01-02", "nieuw"]]) {
    fs.mkdirSync(audioDir(slug, date), { recursive: true });
    fs.writeFileSync(transcriptFile(slug, date), text, "utf8");
  }
  assert.equal(readTranscript(slug), "nieuw"); // no folder for today → newest wins
  assert.equal(readTranscript(slug, "2020-01-01"), "oud"); // explicit date untouched
  fs.rmSync(path.join(audioDir(slug), ".."), { recursive: true, force: true });
});

test("network edges come from names in in_from/out_to prose", async () => {
  const { matchEdges } = await import("../lib/durabo/network.ts");
  const rows = [
    { slug: "abel-kleefstra", name: "Abel Kleefstra", department: "Supply" },
    { slug: "collette-o-kane", name: "Collette O'Kane", department: "Buying" },
    { slug: "eric-markus", name: "Eric Markus", department: "Sales" },
    { slug: "erik-smit", name: "Erik Smit", department: "Leadership" },
  ];
  const links = matchEdges(rows, {
    "abel-kleefstra": {
      in_from: "briefing van Collette (wekelijks), orders via mail",
      out_to: "status naar Eric Markus",
    },
    "erik-smit": { in_from: "rapportage van eric" },
  });
  const keys = links.map((l) => `${l.from}→${l.to}`).sort();
  assert.deepEqual(keys, [
    "abel-kleefstra→eric-markus",
    "collette-o-kane→abel-kleefstra",
    "eric-markus→erik-smit",
  ]);
  // "eric" must not match Erik Smit, and nobody links to themselves.
  assert.ok(!keys.some((k) => k.startsWith("erik-smit→") || k === "erik-smit→erik-smit"));
});

test("letterless whisper output (tones, hums) reads as silence", async () => {
  const { cleanTranscript } = await import("../lib/speech/whisper.ts");
  assert.equal(cleanTranscript("***"), "");
  assert.equal(cleanTranscript("*** ---"), "");
  assert.equal(cleanTranscript("Aha, ok."), "Aha, ok.");
});
