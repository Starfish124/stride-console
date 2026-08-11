// The Durabo discovery repo on disk, and the console's live interview state.
//
// The repo (~/ai-discovery-durabo, private mirror of Jort's) stays the source
// of truth for WHO and WHAT: roster, field card, prep briefs. The console owns
// only the live state of interview day — statuses, checklist ticks, start
// times — in data/durabo-live.json. Notes are appended into the repo itself,
// where the synthesis runbook expects material to land.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../store.ts";
import { parseEmployeeDoc, parseFieldCard, parseRoster, type CardStep, type EmployeeDoc, type RosterRow } from "./parse.ts";

export function duraboRoot(): string {
  return process.env.DURABO_DIR ?? path.join(os.homedir(), "ai-discovery-durabo");
}

const LIVE_FILE = () => path.join(DATA_DIR, "durabo-live.json");

export interface LiveInterview {
  status?: string; // override of the roster status once we act on it
  startedAt?: string;
  finishedAt?: string;
  checked: Record<string, boolean>; // step num -> ticked
  by?: string;
}

export interface LiveState {
  interviews: Record<string, LiveInterview>;
}

export function readLive(): LiveState {
  return readJson<LiveState>(LIVE_FILE(), { interviews: {} });
}

export function updateLive(slug: string, fn: (i: LiveInterview) => void): LiveState {
  const state = readLive();
  const entry = state.interviews[slug] ?? { checked: {} };
  fn(entry);
  state.interviews[slug] = entry;
  writeJson(LIVE_FILE(), state);
  return state;
}

export function readRoster(): RosterRow[] {
  const md = fs.readFileSync(path.join(duraboRoot(), "Project-Status", "00-Roster.md"), "utf8");
  return parseRoster(md);
}

export function readFieldCard(): CardStep[] {
  const md = fs.readFileSync(path.join(duraboRoot(), "Prompts", "10-Field-Card-45min-NL.md"), "utf8");
  return parseFieldCard(md);
}

/** Throws on a slug that is not on the roster — the one traversal choke point. */
export function requireSlug(slug: string): RosterRow {
  const row = readRoster().find((r) => r.slug === slug);
  if (!row) throw new Error(`Not on the roster: ${slug}`);
  return row;
}

export function readEmployee(slug: string): EmployeeDoc {
  requireSlug(slug);
  const md = fs.readFileSync(path.join(duraboRoot(), "employees", slug, `${slug}.md`), "utf8");
  return parseEmployeeDoc(md);
}

function notesFile(slug: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(duraboRoot(), "employees", slug, `interview-notes-${today}.md`);
}

export function readNotes(slug: string): string {
  requireSlug(slug);
  try {
    return fs.readFileSync(notesFile(slug), "utf8");
  } catch {
    return "";
  }
}

/**
 * For the front-page tile: interview slots falling today or tomorrow, and how
 * many are done. Undefined outside that window (or with the repo missing), so
 * the tile removes itself after the engagement days.
 */
export function interviewPulse(today = new Date()): { done: number; total: number } | undefined {
  let rows;
  try {
    rows = readRoster();
  } catch {
    return undefined;
  }
  const day = (offset: number) =>
    new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const window = [day(0), day(1)];
  const live = readLive().interviews;
  const slots = rows.filter((r) => r.date && window.includes(r.date));
  if (slots.length === 0) return undefined;
  const done = slots.filter((r) =>
    ["interviewed", "artifacts-received", "synthesized"].includes(live[r.slug]?.status ?? r.status),
  ).length;
  return { done, total: slots.length };
}

/**
 * Remove one note block from today's notes file, matched on its exact text.
 * The stamp + author in each block make collisions unlikely; if two notes are
 * character-identical anyway, one goes and the other stays, which is right.
 */
export function removeNoteBlock(slug: string, block: string): boolean {
  requireSlug(slug);
  const file = notesFile(slug);
  const wanted = block.trim();
  if (!wanted) return false;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const at = text.indexOf(wanted);
  if (at === -1) return false;
  const cut = (text.slice(0, at) + text.slice(at + wanted.length)).replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(file, cut, "utf8");
  return true;
}

export function appendNote(slug: string, text: string, by?: string): void {
  const row = requireSlug(slug);
  const file = notesFile(slug);
  const stamp = new Date().toTimeString().slice(0, 5);
  let block = `\n**${stamp}${by ? ` · ${by}` : ""}** — ${text.trim()}\n`;
  if (!fs.existsSync(file)) {
    block = `# Interviewnotities — ${row.name}, ${new Date().toISOString().slice(0, 10)}\n${block}`;
  }
  fs.appendFileSync(file, block, "utf8");
}
