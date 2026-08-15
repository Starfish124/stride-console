// The Hermes memory job: distil what happened into what is worth remembering.
//
// Three streams into data/brain/brain.db:
//   events    clients/notes snapshot-diffed since the last run — no LLM
//   sessions  Claude session notes from data/graph/sessions, one claude -p each
//   runs      finished delivery runs from the workspace, one claude -p each
//
// Idempotent: distilled sources are in the ledger and never re-read, events
// come from replacing the snapshot they were diffed against. A distillation
// that fails stays out of the ledger and is retried the next night.
//
// Run: node scripts/brain-distill.mjs
//      node scripts/brain-distill.mjs --dry      (report, distil nothing)
//      node scripts/brain-distill.mjs --max=50   (manual backfill, bigger batch)

import fs from "node:fs";
import path from "node:path";
import { Brain } from "../lib/brain/store.ts";
import { embedMissing, ingestAll } from "../lib/brain/ingest.ts";
import { diffSnapshots } from "../lib/brain/diff.ts";
import { distillPrompt, parseMemories } from "../lib/brain/distill.ts";
import { callClaudeCli, extractCliResult } from "../lib/pipeline/write.ts";
import { listSessionNotes, SESSIONS_DIR } from "../lib/graph/store.ts";
import { listRuns } from "../lib/workspace/store.ts";
import { DATA_DIR } from "../lib/store.ts";

// A night's Claude budget. Whatever does not fit tonight fits tomorrow; the
// first run works through the backlog over a few nights instead of burning a
// hundred calls at once.
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const MAX_DISTILLS = maxArg ? Math.max(1, Number(maxArg.slice(6)) || 10) : 10;
const DISTILL_TIMEOUT_MS = 120_000;

const DRY = process.argv.includes("--dry");

const SNAPSHOT_STORES = ["clients", "notes"];

function log(message) {
  console.log(`[brain] ${message}`);
}

function ingestEvents(brain) {
  let added = 0;
  for (const name of SNAPSHOT_STORES) {
    let current;
    try {
      current = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
    } catch {
      continue; // Store missing or unreadable: snapshot next time it exists.
    }
    const prev = brain.getSnapshot(name);
    // First sight of a store baselines it silently — replaying the whole
    // history as "new" events would be noise, not memory.
    if (prev !== undefined && !DRY) {
      for (const event of diffSnapshots(name, prev, current)) {
        brain.add({ kind: "event", subject: event, body: event, sourceRef: `event:${name}` });
        added += 1;
      }
    }
    if (!DRY) brain.putSnapshot(name, current);
  }
  return added;
}

function pendingSources(brain) {
  const sources = [];
  for (const note of listSessionNotes()) {
    const ref = `session:${note.name}`;
    if (brain.isDistilled(ref)) continue;
    sources.push({
      ref,
      kind: "session",
      title: note.title,
      read: () => fs.readFileSync(path.join(SESSIONS_DIR, note.name), "utf8"),
    });
  }
  for (const run of listRuns()) {
    if (run.status === "running") continue;
    const ref = `run:${run.id}`;
    if (brain.isDistilled(ref)) continue;
    sources.push({
      ref,
      kind: "run",
      title: `Delivery run: ${run.task}`,
      read: () =>
        [
          `Task: ${run.task}`,
          `Status: ${run.status}`,
          run.output ? `Transcript:\n${run.output}` : "",
          run.diff ? `Diff:\n${run.diff}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
    });
  }
  return sources;
}

async function distil(brain, source) {
  let content;
  try {
    content = source.read();
  } catch {
    // A source that vanished has nothing to teach; stop retrying it.
    brain.markDistilled(source.ref);
    return 0;
  }
  const raw = await callClaudeCli(distillPrompt(source.kind, source.title, content), {
    timeoutMs: DISTILL_TIMEOUT_MS,
  });
  const memories = parseMemories(extractCliResult(raw));
  for (const m of memories) {
    brain.add({ kind: source.kind, subject: m.subject, body: m.body, sourceRef: source.ref });
  }
  // Distilling to nothing is a valid verdict on a routine source.
  brain.markDistilled(source.ref);
  return memories.length;
}

const brain = new Brain();
const events = ingestEvents(brain);
log(`events: ${events} new`);

// The fan-in: touches, replies, sends, research, blueprints, invoices,
// lessons, interview transcripts. Deterministic, no LLM, idempotent — so it
// runs before the budgeted distillation and costs nothing.
try {
  const ing = ingestAll(brain);
  log(`ingest: ${ing.added} new of ${ing.scanned} scanned (${Object.entries(ing.bySource).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing new"})`);
} catch (error) {
  log(`ingest failed: ${error.message} — distillation continues`);
}

const pending = pendingSources(brain);
log(`pending sources: ${pending.length}${DRY ? " (dry run, stopping)" : ""}`);
if (!DRY) {
  const batch = pending.slice(0, MAX_DISTILLS);
  let memories = 0;
  let failed = 0;
  for (const source of batch) {
    try {
      const n = await distil(brain, source);
      memories += n;
      log(`  ${source.ref}: ${n} memories`);
    } catch (error) {
      failed += 1;
      log(`  ${source.ref}: failed (${error.message}) — will retry next run`);
    }
  }
  const left = pending.length - batch.length;
  log(
    `done: ${memories} memories from ${batch.length - failed}/${batch.length} sources` +
      (left > 0 ? `, ${left} left for the next run` : ""),
  );
}
// Backfill embeddings for whatever has none, inside a fixed budget. A cold
// Ollama means zero embedded tonight and a retry tomorrow; search stays
// keyword-only meanwhile.
if (!DRY) {
  const embedded = await embedMissing(brain, 512);
  log(`embeddings: ${embedded} backfilled, ${brain.count() - brain.vectorCount()} still queued`);
}
log(`brain now holds ${brain.count()} memories, ${brain.vectorCount()} embedded`);
brain.close();
