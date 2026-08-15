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

export type MemoryKind = "session" | "run" | "event";

export interface Memory {
  id: string;
  kind: MemoryKind;
  subject: string;
  body: string;
  /** Where it came from: "session:<file>", "run:<id>", "event:<store>". */
  sourceRef: string;
  createdAt: string;
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
`;

export class Brain {
  private db: DatabaseSync;

  constructor(file: string = BRAIN_DB) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  add(memory: Omit<Memory, "id" | "createdAt"> & { id?: string; createdAt?: string }): Memory {
    const full: Memory = {
      id: memory.id ?? newId("mem"),
      createdAt: memory.createdAt ?? new Date().toISOString(),
      kind: memory.kind,
      subject: memory.subject,
      body: memory.body,
      sourceRef: memory.sourceRef,
    };
    this.db
      .prepare(
        "INSERT OR IGNORE INTO memories (id, kind, subject, body, source_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(full.id, full.kind, full.subject, full.body, full.sourceRef, full.createdAt);
    this.db
      .prepare("INSERT INTO memories_fts (id, subject, body) VALUES (?, ?, ?)")
      .run(full.id, full.subject, full.body);
    return full;
  }

  /** Ranked full-text search. A query that matches nothing returns []. */
  search(query: string, limit = 20): Memory[] {
    // FTS5 has its own query syntax that throws on stray punctuation; quoting
    // each word and joining with OR turns founder input into a safe query.
    const tokens = query.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length === 0) return [];
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    const rows = this.db
      .prepare(
        `SELECT m.id, m.kind, m.subject, m.body, m.source_ref, m.created_at
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
  };
}

let shared: Brain | undefined;

/** The app's brain, opened once per process. */
export function brain(): Brain {
  shared ??= new Brain();
  return shared;
}
