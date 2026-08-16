// The fan-in: every store the console keeps, turned into memories.
//
// Before this file, the most valuable text in the company was in no index at
// all — client interview transcripts, every inbound reply, every email sent,
// the CRM touch history, the blueprint shelf, what was billed. Each adapter
// below is a pure function from a store's records to memory rows, so they
// test the way lib/brain/diff.ts tests: data in, rows out, no side effects.
//
// Idempotency is structural: every row's id is a hash of its sourceRef, and
// Brain.add() skips ids it already holds. Running ingest twice is a no-op;
// running it nightly picks up only what is new.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { brain, type Brain, type Memory } from "./store.ts";
import { embedTexts } from "./embed.ts";
import { DATA_DIR, listBlueprints, listClients, listInvoices } from "../store.ts";
import { listReplies, type Reply } from "../outreach/replies.ts";
import { listResearch, listSends } from "../salesnav/store.ts";
import { listInboundSince } from "../whatsapp/store.ts";
import { founderFor } from "../whatsapp/config.ts";
import { lessons } from "../pipeline/memory.ts";
import { invoiceTotal, type Blueprint, type Client, type Invoice } from "../types.ts";
import type { AccountResearch, SendRecord } from "../salesnav/types.ts";

type Row = Omit<Memory, "id" | "createdAt">;

/** Stable id from the source reference: the whole idempotency story. */
export function ingestId(sourceRef: string): string {
  return `ing_${crypto.createHash("sha1").update(sourceRef).digest("hex").slice(0, 16)}`;
}

const trim = (s: string, cap: number) => (s.length > cap ? `${s.slice(0, cap)}…` : s);

// ---------- adapters: pure, testable ----------

export function rowsFromTouches(clients: Client[]): Row[] {
  const rows: Row[] = [];
  for (const c of clients) {
    for (const t of c.touches ?? []) {
      if (!t.note?.trim()) continue;
      rows.push({
        kind: "touch",
        subject: `${c.company || c.name} — touch`,
        body: trim(t.note.trim(), 1_500),
        sourceRef: `touch:${c.id}:${t.id}`,
        entityType: "client",
        entityId: c.id,
        occurredAt: t.at,
      });
    }
  }
  return rows;
}

export function rowsFromReplies(replies: Reply[]): Row[] {
  return replies
    .filter((r) => r.message?.trim())
    .map((r) => ({
      kind: "reply" as const,
      subject: `Reply from ${r.name ?? "unknown"}${r.company ? ` (${r.company})` : ""}`,
      body: trim(r.message!.trim(), 1_500),
      sourceRef: `reply:${r.id}`,
      occurredAt: r.receivedAt,
    }));
}

export function rowsFromSends(sends: SendRecord[]): Row[] {
  return sends.map((s) => ({
    kind: "outbound" as const,
    subject: `Sent to ${s.to}: ${s.subject}`,
    body: trim(s.body, 1_500),
    sourceRef: `send:${s.key}`,
    entityType: "client" as const,
    entityId: s.clientId,
  }));
}

export function rowsFromResearch(research: AccountResearch[]): Row[] {
  return research.map((r) => ({
    kind: "research" as const,
    subject: `Account research: ${r.url}`,
    body: trim([r.summary, ...r.angles.map((a) => `Angle: ${a}`)].join("\n"), 2_000),
    sourceRef: `research:${r.id}`,
    entityType: "client" as const,
    entityId: r.clientId,
  }));
}

export function rowsFromBlueprints(blueprints: Blueprint[]): Row[] {
  const rows: Row[] = blueprints.map((b) => ({
    kind: "blueprint" as const,
    subject: `Blueprint: ${b.name} (${b.status}, built for ${b.builtFor || "—"})`,
    body: trim(`${b.oneLiner}\nProblem: ${b.problem}\nSolution: ${b.solution}`, 2_000),
    sourceRef: `blueprint:${b.id}`,
    entityType: "blueprint" as const,
    entityId: b.id,
  }));
  // Reuse history as its own memories, so "what did we ship for X" answers.
  for (const b of blueprints) {
    for (const u of b.uses ?? []) {
      rows.push({
        kind: "blueprint",
        subject: `Blueprint reused: ${b.name} for ${u.client}`,
        body: `${b.oneLiner}`,
        sourceRef: `blueprint-use:${b.id}:${u.client}:${u.at}`,
        entityType: "blueprint",
        entityId: b.id,
        occurredAt: u.at,
      });
    }
  }
  return rows;
}

export function rowsFromInvoices(invoices: Invoice[]): Row[] {
  // Line descriptions tell the delivery story; amounts stay out of prompts.
  return invoices.map((inv) => ({
    kind: "invoice" as const,
    subject: `Invoice ${inv.number} — ${inv.billTo.name} (${inv.status})`,
    body: trim(
      `Billed: ${inv.lines.map((l) => l.title).join("; ")}. Total ex-detail: €${Math.round(invoiceTotal(inv))}.`,
      1_000,
    ),
    sourceRef: `invoice:${inv.id}:${inv.status}`,
    entityType: "client" as const,
    entityId: inv.clientId,
    occurredAt: inv.date,
  }));
}

/**
 * The same boundary the relay itself answers within, and no wider: the
 * Stride group only (lib/whatsapp/store.ts — nothing else is even queried),
 * founders only within it. A message from a number outside
 * STRIDE_WHATSAPP_FOUNDERS never reaches the relay and never reaches the
 * brain — one allowlist gates both, so this file cannot quietly become a
 * wider net than the door it copied.
 */
export function rowsFromWhatsApp(): Row[] {
  const messages = listInboundSince("1970-01-01T00:00:00", 500);
  const rows: Row[] = [];
  for (const m of messages) {
    const founder = m.founderNumber ? founderFor(m.founderNumber) : undefined;
    if (!founder) continue;
    rows.push({
      kind: "whatsapp",
      subject: `WhatsApp — ${founder.name}`,
      body: trim(m.content, 1_000),
      sourceRef: `whatsapp:${m.id}`,
      occurredAt: m.timestamp,
    });
  }
  return rows;
}

export function rowsFromLessons(lines: string[]): Row[] {
  return lines.map((l) => ({
    kind: "lesson" as const,
    subject: "Post-performance lesson",
    body: l,
    sourceRef: `lesson:${crypto.createHash("sha1").update(l).digest("hex").slice(0, 12)}`,
  }));
}

/** ~1,500-char chunks on paragraph boundaries: retrieval-sized, quote-sized. */
export function chunkTranscript(text: string, cap = 1_500): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > cap) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function rowsFromTranscriptFile(person: string, date: string, text: string): Row[] {
  return chunkTranscript(text).map((chunk, i) => ({
    kind: "transcript" as const,
    subject: `Interview ${person}, ${date} (part ${i + 1})`,
    body: chunk,
    sourceRef: `transcript:${person}:${date}:${i}`,
    entityType: "person" as const,
    entityId: person,
    occurredAt: date,
  }));
}

/** data/durabo-audio/<slug>/<date>/transcript.md — the live interview feed. */
function transcriptRows(): Row[] {
  const rows: Row[] = [];
  const root = path.join(DATA_DIR, "durabo-audio");
  let people: string[] = [];
  try {
    people = fs.readdirSync(root);
  } catch {
    return rows;
  }
  for (const person of people) {
    let dates: string[] = [];
    try {
      dates = fs.readdirSync(path.join(root, person));
    } catch {
      continue;
    }
    for (const date of dates) {
      try {
        const text = fs.readFileSync(path.join(root, person, date, "transcript.md"), "utf8");
        rows.push(...rowsFromTranscriptFile(person, date, text));
      } catch {
        /* no transcript that day */
      }
    }
  }
  return rows;
}

// ---------- the fan-in ----------

export interface IngestReport {
  scanned: number;
  added: number;
  bySource: Record<string, number>;
}

/** Pull every store into the brain. Safe to run any number of times. */
export function ingestAll(db: Brain = brain()): IngestReport {
  const sources: Record<string, () => Row[]> = {
    touches: () => rowsFromTouches(listClients()),
    replies: () => rowsFromReplies(listReplies()),
    sends: () => rowsFromSends(listSends()),
    research: () => rowsFromResearch(listResearch()),
    blueprints: () => rowsFromBlueprints(listBlueprints()),
    invoices: () => rowsFromInvoices(listInvoices()),
    lessons: () => rowsFromLessons(lessons()),
    transcripts: transcriptRows,
    whatsapp: rowsFromWhatsApp,
  };

  const report: IngestReport = { scanned: 0, added: 0, bySource: {} };
  for (const [name, build] of Object.entries(sources)) {
    let rows: Row[] = [];
    try {
      rows = build();
    } catch {
      continue; // one broken store must not stop the other seven
    }
    let added = 0;
    for (const row of rows) {
      const id = ingestId(row.sourceRef);
      if (db.has(id)) continue;
      db.add({ ...row, id });
      added++;
    }
    report.scanned += rows.length;
    report.added += added;
    report.bySource[name] = added;
  }
  return report;
}

/**
 * Backfill embeddings for memories that have none, within a budget. Batched
 * so one nightly run works through a backlog instead of timing out on it.
 */
export async function embedMissing(db: Brain = brain(), budget = 256): Promise<number> {
  let done = 0;
  while (done < budget) {
    const batch = db.unembedded(Math.min(32, budget - done));
    if (batch.length === 0) break;
    const vecs = await embedTexts(batch.map((m) => `${m.subject}\n${m.body}`));
    if (!vecs) break; // embedder cold: tomorrow's run picks it up
    batch.forEach((m, i) => db.putVector(m.id, vecs[i]));
    done += batch.length;
  }
  return done;
}
