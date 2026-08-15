// Brain v1: the semantic layer and the fan-in, against a real temporary
// SQLite file, with a stubbed embedder — Ollama never runs in a test.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Brain } from "../lib/brain/store.ts";
import { cosine } from "../lib/brain/embed.ts";
import { renderPassages, retrieve } from "../lib/brain/retrieve.ts";
import {
  chunkTranscript,
  ingestId,
  rowsFromBlueprints,
  rowsFromInvoices,
  rowsFromLessons,
  rowsFromReplies,
  rowsFromTouches,
  rowsFromTranscriptFile,
} from "../lib/brain/ingest.ts";

function tmpBrain() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-v1-"));
  return new Brain(path.join(dir, "brain.db"));
}

const noEmbed = { embed: async () => null };

// ---------- store: the dedupe fix and the new columns ----------

test("adding the same id twice yields one memory and one search hit", () => {
  const b = tmpBrain();
  b.add({ id: "m1", kind: "event", subject: "Durabo moved", body: "talking to proposal", sourceRef: "s" });
  b.add({ id: "m1", kind: "event", subject: "Durabo moved", body: "talking to proposal", sourceRef: "s" });
  assert.equal(b.count(), 1);
  assert.equal(b.search("Durabo").length, 1);
  b.close();
});

test("remove deletes from memories, fts and vectors", () => {
  const b = tmpBrain();
  b.add({ id: "m1", kind: "event", subject: "gone soon", body: "x", sourceRef: "s" });
  b.putVector("m1", Float32Array.from([1, 0]));
  assert.equal(b.remove("m1"), true);
  assert.equal(b.count(), 0);
  assert.equal(b.search("gone").length, 0);
  assert.equal(b.vectorCount(), 0);
  assert.equal(b.remove("m1"), false);
  b.close();
});

test("entity columns round-trip and filter search", () => {
  const b = tmpBrain();
  b.add({ id: "a", kind: "touch", subject: "call", body: "priced the sprint", sourceRef: "t1", entityType: "client", entityId: "c1", occurredAt: "2026-08-01" });
  b.add({ id: "b", kind: "touch", subject: "call", body: "priced the sprint", sourceRef: "t2", entityType: "client", entityId: "c2" });
  const hits = b.search("sprint", 10, "c1");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entityId, "c1");
  assert.equal(hits[0].occurredAt, "2026-08-01");
  b.close();
});

// ---------- vectors ----------

test("vector blob round-trips through allVectors", () => {
  const b = tmpBrain();
  b.add({ id: "v1", kind: "lesson", subject: "s", body: "b", sourceRef: "l1" });
  b.putVector("v1", Float32Array.from([0.5, -1, 2]));
  const all = b.allVectors();
  assert.equal(all.length, 1);
  assert.deepEqual([...all[0].vec], [0.5, -1, 2]);
  b.close();
});

test("cosine is 1 on parallel, 0 on orthogonal and on mismatched dims", () => {
  assert.ok(Math.abs(cosine(Float32Array.from([1, 2]), Float32Array.from([2, 4])) - 1) < 1e-6);
  assert.equal(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1])), 0);
  assert.equal(cosine(Float32Array.from([1]), Float32Array.from([1, 2])), 0);
});

// ---------- retrieve ----------

test("retrieve degrades to keyword-only when the embedder is down", async () => {
  const b = tmpBrain();
  b.add({ id: "k1", kind: "reply", subject: "Rutger", body: "wants the invoice agent", sourceRef: "r1" });
  const out = await retrieve("invoice", {}, { embed: noEmbed.embed, db: b });
  assert.equal(out.length, 1);
  assert.equal(out[0].memory.id, "k1");
  b.close();
});

test("semantic leg surfaces a memory keyword search cannot", async () => {
  const b = tmpBrain();
  b.add({ id: "sem", kind: "transcript", subject: "interview", body: "handmatig overtypen kost uren", sourceRef: "t1" });
  b.add({ id: "kw", kind: "reply", subject: "note", body: "automation question", sourceRef: "t2" });
  b.putVector("sem", Float32Array.from([1, 0]));
  b.putVector("kw", Float32Array.from([0, 1]));
  // The stub embeds the query right next to "sem"; FTS finds only "kw".
  const out = await retrieve("automation", {}, { embed: async () => Float32Array.from([0.9, 0.1]), db: b });
  const ids = out.map((p) => p.memory.id);
  assert.ok(ids.includes("sem"), "semantic hit missing");
  assert.ok(ids.includes("kw"), "keyword hit missing");
  b.close();
});

test("renderPassages is empty on nothing and capped on lots", () => {
  assert.equal(renderPassages([]), "");
  const passages = Array.from({ length: 100 }, (_, i) => ({
    memory: { id: `m${i}`, kind: "event", subject: "s".repeat(50), body: "b".repeat(200), sourceRef: "x", createdAt: "2026-08-15T00:00:00Z" },
    score: 1,
  }));
  assert.ok(renderPassages(passages).length <= 4_000);
});

// ---------- ingest adapters (pure) ----------

test("ingestId is stable and prefix-recognisable", () => {
  assert.equal(ingestId("touch:c1:t1"), ingestId("touch:c1:t1"));
  assert.notEqual(ingestId("touch:c1:t1"), ingestId("touch:c1:t2"));
  assert.ok(ingestId("x").startsWith("ing_"));
});

test("touch rows carry the client entity and skip empty notes", () => {
  const rows = rowsFromTouches([
    { id: "c1", name: "Erik", company: "Durabo", stage: "client", touches: [
      { id: "t1", at: "2026-08-01", note: "wants royalty tool" },
      { id: "t2", at: "2026-08-02", note: "   " },
    ], createdAt: "", updatedAt: "" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entityId, "c1");
  assert.equal(rows[0].occurredAt, "2026-08-01");
  assert.match(rows[0].subject, /Durabo/);
});

test("reply rows keep only replies with a message", () => {
  const rows = rowsFromReplies([
    { id: "r1", receivedAt: "2026-08-01", event: "replied", name: "Ana", headline: null, profileUrl: null, company: "Co", message: "yes please", campaign: null, handled: false, raw: {} },
    { id: "r2", receivedAt: "2026-08-01", event: "connected", name: null, headline: null, profileUrl: null, company: null, message: null, campaign: null, handled: false, raw: {} },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].subject, /Ana/);
});

test("blueprint rows include reuse history as separate memories", () => {
  const rows = rowsFromBlueprints([
    { id: "b1", name: "Trend radar", kind: "agent", oneLiner: "reads reddit", problem: "p", solution: "s", stack: [], builtFor: "Durabo", payload: "x", status: "proven", uses: [{ client: "Durabo", at: "2026-08-12" }], createdAt: "", updatedAt: "" },
  ]);
  assert.equal(rows.length, 2);
  assert.match(rows[1].subject, /reused.*Durabo/);
});

test("invoice rows name the lines, not the client's bank details", () => {
  const rows = rowsFromInvoices([
    { id: "i1", number: "2026-001", billTo: { name: "Client BV", address: [] }, date: "2026-08-15", dueDays: 30, lines: [{ title: "Discovery", qty: 16, rate: 125 }], vatRate: 21, status: "sent", createdAt: "", updatedAt: "" },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].body, /Discovery/);
  assert.doesNotMatch(rows[0].body, /IBAN/);
});

test("lesson rows dedupe by content hash", () => {
  const a = rowsFromLessons(["hooks with numbers beat hooks without"]);
  const b = rowsFromLessons(["hooks with numbers beat hooks without"]);
  assert.equal(a[0].sourceRef, b[0].sourceRef);
});

test("transcript chunking respects the cap and keeps order", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"woord ".repeat(40)}`).join("\n\n");
  const chunks = chunkTranscript(text, 1_500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 1_600));
  assert.match(chunks[0], /Paragraph 0/);
  const rows = rowsFromTranscriptFile("erik-smit", "2026-08-13", text);
  assert.equal(rows.length, chunks.length);
  assert.equal(rows[0].entityId, "erik-smit");
  assert.match(rows[0].sourceRef, /transcript:erik-smit:2026-08-13:0/);
});

// ---------- ingest is idempotent against a real store ----------

test("re-adding ingest rows is a no-op", () => {
  const b = tmpBrain();
  const rows = rowsFromTouches([
    { id: "c1", name: "A", company: "ACo", stage: "client", touches: [{ id: "t1", at: "2026-08-01", note: "call" }], createdAt: "", updatedAt: "" },
  ]);
  for (const pass of [1, 2]) {
    for (const row of rows) {
      const id = ingestId(row.sourceRef);
      if (!b.has(id)) b.add({ ...row, id });
    }
    assert.equal(b.count(), 1, `pass ${pass}`);
  }
  b.close();
});
