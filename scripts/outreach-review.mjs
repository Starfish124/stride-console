// What the outreach did yesterday, written down where it compounds.
//
// Two hard rules shape this file.
//
// It never writes data/. The console is the only writer there — that is why
// lib/salesnav/ has no locking anywhere — and scripts/salesnav-runner.mjs is a
// separate process ticking every sixty seconds. This reads those stores and
// writes only to brain.db, which is SQLite and expects concurrent readers.
//
// And it says nothing about which message works better. That needs replies and
// non-replies on the same words, and at seventy-five touches a week that is
// months away. It records what happened; the judgement waits for evidence.
//
// Run by scripts/agents.mjs. Safe by hand:
//   node --env-file-if-exists=.env.local scripts/outreach-review.mjs [--dry]

import { brain } from "../lib/brain/store.ts";
import { ingestId } from "../lib/brain/ingest.ts";
import { listManualSteps } from "../lib/salesnav/store.ts";
import { awaitingAnswer } from "../lib/salesnav/manual.ts";
import { listReplies } from "../lib/outreach/replies.ts";
import { callClaudeCli } from "../lib/pipeline/write.ts";
import { localDay } from "../lib/salesnav/config.ts";

const dry = process.argv.includes("--dry");
const log = (m) => console.log(`[outreach ${new Date().toISOString()}] ${m}`);

const now = new Date();
const today = localDay(now);
const settledToday = listManualSteps().filter(
  (m) => m.finishedAt && localDay(new Date(m.finishedAt)) === today,
);
const sent = settledToday.filter((m) => m.state === "done");
const skipped = settledToday.filter((m) => m.state === "skipped");
const replies = listReplies().filter((r) => localDay(new Date(r.receivedAt)) === today);
const chase = awaitingAnswer(7, now);

if (sent.length === 0 && replies.length === 0 && skipped.length === 0) {
  log(`nothing went out today and nothing came back. ${chase.length} still unanswered.`);
  process.exit(0);
}

log(`sent ${sent.length}, skipped ${skipped.length}, replies ${replies.length}, unanswered ${chase.length}`);

// The words, not a summary of the words — the whole point is that the model
// reads what was actually said.
const prompt = `You are reviewing one day of a two-founder agency's LinkedIn outreach.

SENT TODAY (${sent.length}):
${sent.map((m) => `- [${m.kind}] ${m.body}`).join("\n") || "(none)"}

NOT SENT, AND WHY (${skipped.length}):
${skipped.map((m) => `- [${m.kind}] ${m.problem ?? "skipped"}`).join("\n") || "(none)"}

REPLIES TODAY (${replies.length}):
${replies.map((r) => `- ${r.name ?? "someone"}: ${(r.message ?? "").slice(0, 300)}`).join("\n") || "(none)"}

${chase.length} messages sent over a week ago have had no answer recorded.

Write at most three observations. Rules:
- Only what today's evidence supports. ${sent.length} messages is a tiny sample; do NOT
  claim one phrasing outperforms another, and do not rank anything.
- Prefer concrete noticing over advice: what was actually said, what was refused and why,
  what a reply actually asked about.
- One line each, plain English, no bullets, no preamble.
If today shows nothing worth recording, write exactly: NOTHING.`;

let text = "";
try {
  text = await callClaudeCli(prompt, { timeoutMs: 120_000 });
} catch (e) {
  log(`claude failed: ${e.message}`);
  process.exit(1);
}

const lines = text
  .split("\n")
  .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
  .filter((l) => l.length > 20 && !/^NOTHING$/i.test(l))
  .slice(0, 3);

if (!lines.length) {
  log("nothing worth recording today.");
  process.exit(0);
}

if (dry) {
  log("dry run, would record:");
  for (const l of lines) log(`  ${l}`);
  process.exit(0);
}

const db = brain();
let added = 0;
for (const [i, line] of lines.entries()) {
  // Keyed by the day, so a second run replaces nothing and adds nothing.
  const sourceRef = `outreach-review:${today}:${i}`;
  const id = ingestId(sourceRef);
  if (db.has(id)) continue;
  db.add({
    id,
    kind: "lesson",
    subject: `Outreach, ${today}`,
    body: line,
    sourceRef,
    occurredAt: now.toISOString(),
  });
  added += 1;
}
log(`recorded ${added}.`);
