// The Hermes brain: the console's long-term memory.
//
// SQLite rather than the usual JSON files for one reason — search. Memories
// are only worth keeping if the right one surfaces months later, and FTS5
// gives ranked full-text search from the standard library (node:sqlite, the
// same module the bridge already uses to read Linked Helper's database).
//
// Three kinds of memory:
//   session  distilled from a Claude Code session's notes
//   run      distilled from a delivery run on a client project
//   event    deterministic business timeline ("Durabo moved talking → proposal")

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, newId } from "../store.ts";

export const BRAIN_DB = path.join(DATA_DIR, "brain", "brain.db");

export type MemoryKind =
  | "session"
  | "run"
  | "event"
  // Ingested from the console's own stores (lib/brain/ingest.ts):
  | "touch"
  | "reply"
  | "outbound"
  | "research"
  | "blueprint"
  | "invoice"
  | "transcript"
  | "lesson"
  | "whatsapp";

export type EntityType = "client" | "project" | "blueprint" | "person";

export interface Memory {
  id: string;
  kind: MemoryKind;
  subject: string;
  body: string;
  /** Where it came from: "session:<file>", "run:<id>", "event:<store>". */
  sourceRef: string;
  createdAt: string;
  /** What this memory is about, when it is about one thing. */
  entityType?: EntityType;
  entityId?: string;
  /** When the remembered thing happened — not when it was ingested. */
  occurredAt?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, subject, body);
CREATE TABLE IF NOT EXISTS distilled (
  source_ref TEXT PRIMARY KEY,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  name TEXT PRIMARY KEY,
  taken_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);
`;

/**
 * Columns added after first ship. ALTER TABLE guarded by PRAGMA table_info,
 * the schema-migration equivalent of readJson's fallback: an old database
 * upgrades itself on open, a new one is born current.
 */
const MIGRATIONS: Array<{ column: string; ddl: string }> = [
  { column: "entity_type", ddl: "ALTER TABLE memories ADD COLUMN entity_type TEXT" },
  { column: "entity_id", ddl: "ALTER TABLE memories ADD COLUMN entity_id TEXT" },
  { column: "occurred_at", ddl: "ALTER TABLE memories ADD COLUMN occurred_at TEXT" },
];

export class Brain {
  private db: DatabaseSync;

  constructor(file: string = BRAIN_DB) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
    const have = new Set(
      (this.db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    );
    for (const m of MIGRATIONS) {
      if (!have.has(m.column)) this.db.exec(m.ddl);
    }
    // Once ingest runs, this file holds interview transcripts and client
    // mail — the same 0600 the other sensitive stores get.
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* in-memory or read-only mounts: the data still works */
    }
  }

  has(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(id));
  }

  add(memory: Omit<Memory, "id" | "createdAt"> & { id?: string; createdAt?: string }): Memory {
    const full: Memory = {
      id: memory.id ?? newId("mem"),
      createdAt: memory.createdAt ?? new Date().toISOString(),
      kind: memory.kind,
      subject: memory.subject,
      body: memory.body,
      sourceRef: memory.sourceRef,
      entityType: memory.entityType,
      entityId: memory.entityId,
      occurredAt: memory.occurredAt,
    };
    // FTS5 has no primary key, so "OR IGNORE" on the main table alone used to
    // leave a duplicate FTS row behind — one repeated id, two search hits.
    // The existence check guards both tables with one truth.
    if (this.has(full.id)) return full;
    this.db
      .prepare(
        "INSERT INTO memories (id, kind, subject, body, source_ref, created_at, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        full.id,
        full.kind,
        full.subject,
        full.body,
        full.sourceRef,
        full.createdAt,
        full.entityType ?? null,
        full.entityId ?? null,
        full.occurredAt ?? null,
      );
    this.db
      .prepare("INSERT INTO memories_fts (id, subject, body) VALUES (?, ?, ?)")
      .run(full.id, full.subject, full.body);
    return full;
  }

  /** Delete from both tables and the vector store. */
  remove(id: string): boolean {
    const existed = this.has(id);
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM vectors WHERE id = ?").run(id);
    return existed;
  }

  // ---------- vectors (semantic layer) ----------

  putVector(id: string, vec: Float32Array): void {
    this.db
      .prepare("INSERT OR REPLACE INTO vectors (id, dim, vec) VALUES (?, ?, ?)")
      .run(id, vec.length, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
  }

  /** Memory ids that have no embedding yet, oldest first. */
  unembedded(limit = 256): Array<{ id: string; subject: string; body: string }> {
    return this.db
      .prepare(
        `SELECT m.id, m.subject, m.body FROM memories m
         LEFT JOIN vectors v ON v.id = m.id
         WHERE v.id IS NULL ORDER BY m.created_at ASC LIMIT ?`,
      )
      .all(limit) as Array<{ id: string; subject: string; body: string }>;
  }

  vectorCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM vectors").get() as { n: number };
    return row.n;
  }

  /**
   * Every vector, with its memory. At this console's scale (thousands of
   * rows) a brute-force cosine in JS is single-digit milliseconds — an ANN
   * index would be a dependency spent on a problem this database cannot have.
   */
  allVectors(entityId?: string): Array<{ memory: Memory; vec: Float32Array }> {
    const rows = (
      entityId
        ? this.db
            .prepare(
              `SELECT m.id, m.kind, m.subject, m.body, m.source_ref, m.created_at,
                      m.entity_type, m.entity_id, m.occurred_at, v.vec
               FROM vectors v JOIN memories m ON m.id = v.id WHERE m.entity_id = ?`,
            )
            .all(entityId)
        : this.db
            .prepare(
              `SELECT m.id, m.kind, m.subject, m.body, m.source_ref, m.created_at,
                      m.entity_type, m.entity_id, m.occurred_at, v.vec
               FROM vectors v JOIN memories m ON m.id = v.id`,
            )
            .all()
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      memory: rowToMemory(r),
      vec: new Float32Array(
        (r.vec as Uint8Array).buffer,
        (r.vec as Uint8Array).byteOffset,
        (r.vec as Uint8Array).byteLength / 4,
      ),
    }));
  }

  /** Ranked full-text search. A query that matches nothing returns []. */
  search(query: string, limit = 20, entityId?: string): Memory[] {
    // FTS5 has its own query syntax that throws on stray punctuation; quoting
    // each word and joining with OR turns founder input into a safe query.
    const tokens = query.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length === 0) return [];
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    const rows = entityId
      ? this.db
          .prepare(
            `SELECT m.id, m.kind, m.subject, m.body, m.source_ref, m.created_at,
                    m.entity_type, m.entity_id, m.occurred_at
             FROM memories_fts f JOIN memories m ON m.id = f.id
             WHERE memories_fts MATCH ? AND m.entity_id = ? ORDER BY rank LIMIT ?`,
          )
          .all(match, entityId, limit)
      : this.db
          .prepare(
            `SELECT m.id, m.kind, m.subject, m.body, m.source_ref, m.created_at,
                    m.entity_type, m.entity_id, m.occurred_at
             FROM memories_fts f JOIN memories m ON m.id = f.id
             WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`,
          )
          .all(match, limit);
    return rows.map(rowToMemory);
  }

  /** Newest first, optionally one kind. */
  recent(limit = 50, kind?: MemoryKind): Memory[] {
    const rows = kind
      ? this.db
          .prepare(
            "SELECT id, kind, subject, body, source_ref, created_at FROM memories WHERE kind = ? ORDER BY created_at DESC LIMIT ?",
          )
          .all(kind, limit)
      : this.db
          .prepare(
            "SELECT id, kind, subject, body, source_ref, created_at FROM memories ORDER BY created_at DESC LIMIT ?",
          )
          .all(limit);
    return rows.map(rowToMemory);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number };
    return row.n;
  }

  isDistilled(sourceRef: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM distilled WHERE source_ref = ?").get(sourceRef));
  }

  markDistilled(sourceRef: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO distilled (source_ref, at) VALUES (?, ?)")
      .run(sourceRef, new Date().toISOString());
  }

  getSnapshot(name: string): unknown | undefined {
    const row = this.db.prepare("SELECT json FROM snapshots WHERE name = ?").get(name) as
      | { json: string }
      | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.json);
    } catch {
      return undefined;
    }
  }

  putSnapshot(name: string, value: unknown): void {
    this.db
      .prepare("INSERT OR REPLACE INTO snapshots (name, taken_at, json) VALUES (?, ?, ?)")
      .run(name, new Date().toISOString(), JSON.stringify(value));
  }

  close(): void {
    this.db.close();
  }
}

function rowToMemory(row: unknown): Memory {
  const r = row as Record<string, string>;
  return {
    id: r.id,
    kind: r.kind as MemoryKind,
    subject: r.subject,
    body: r.body,
    sourceRef: r.source_ref,
    createdAt: r.created_at,
    entityType: (r.entity_type as Memory["entityType"]) ?? undefined,
    entityId: r.entity_id ?? undefined,
    occurredAt: r.occurred_at ?? undefined,
  };
}

let shared: Brain | undefined;

/** The app's brain, opened once per process. */
export function brain(): Brain {
  shared ??= new Brain();
  return shared;
}
