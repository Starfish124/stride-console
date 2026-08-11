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
