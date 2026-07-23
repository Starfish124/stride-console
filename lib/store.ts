// File-based JSON store. Everything lives under ./data (gitignored, auto-created).
// Atomic writes via tmp file + rename so a crash never leaves half-written JSON.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Draft,
  Myth,
  PostLogEntry,
  SeenItem,
  SourceEntry,
} from "./types.ts";

export const DATA_DIR = path.join(process.cwd(), "data");
export const RENDERS_DIR = path.join(DATA_DIR, "renders");

const FILES = {
  drafts: path.join(DATA_DIR, "drafts.json"),
  seen: path.join(DATA_DIR, "seen.json"),
  myths: path.join(DATA_DIR, "myths.json"),
  sources: path.join(DATA_DIR, "sources.json"),
  postlog: path.join(DATA_DIR, "postlog.json"),
} as const;

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDataDir();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

// ---------- drafts ----------

export function listDrafts(): Draft[] {
  return readJson<Draft[]>(FILES.drafts, []);
}

export function getDraft(id: string): Draft | undefined {
  return listDrafts().find((d) => d.id === id);
}

export function saveDraft(draft: Draft): void {
  const drafts = listDrafts();
  const i = drafts.findIndex((d) => d.id === draft.id);
  if (i >= 0) drafts[i] = draft;
  else drafts.unshift(draft);
  writeJson(FILES.drafts, drafts);
}

// ---------- myths ----------

export function listMyths(): Myth[] {
  return readJson<Myth[]>(FILES.myths, []);
}

export function saveMyths(myths: Myth[]): void {
  writeJson(FILES.myths, myths);
}

export function addMyth(text: string, addedBy?: string): Myth {
  const myth: Myth = {
    id: newId("myth"),
    text: text.trim(),
    addedBy,
    addedAt: new Date().toISOString(),
    used: false,
  };
  saveMyths([...listMyths(), myth]);
  return myth;
}

export function takeOldestUnusedMyth(): Myth | undefined {
  const myths = listMyths();
  const candidate = myths
    .filter((m) => !m.used)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))[0];
  if (!candidate) return undefined;
  candidate.used = true;
  candidate.usedAt = new Date().toISOString();
  saveMyths(myths);
  return candidate;
}

// ---------- sources ----------

export function listSources(): SourceEntry[] {
  const existing = readJson<SourceEntry[] | null>(FILES.sources, null);
  if (existing) return existing;
  // First run: copy the default source list into data/sources.json.
  const defaults = readJson<SourceEntry[]>(
    path.join(process.cwd(), "config", "sources.default.json"),
    [],
  );
  writeJson(FILES.sources, defaults);
  return defaults;
}

export function saveSources(sources: SourceEntry[]): void {
  writeJson(FILES.sources, sources);
}

// ---------- seen cache / dedupe ----------

export function listSeen(): SeenItem[] {
  return readJson<SeenItem[]>(FILES.seen, []);
}

export function markSeen(items: { url: string; title: string }[]): void {
  const seen = listSeen();
  const now = new Date().toISOString();
  for (const item of items) {
    seen.push({ url: item.url, title: normalizeTitle(item.title), seenAt: now });
  }
  // Keep the cache bounded: last 2,000 entries is months of history.
  writeJson(FILES.seen, seen.slice(-2000));
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Trigram Jaccard similarity of two normalized titles, in [0, 1]. */
export function titleSimilarity(a: string, b: string): number {
  const ta = trigrams(normalizeTitle(a));
  const tb = trigrams(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Duplicate when the URL matches exactly or a seen title is >80% similar. */
export function isDuplicate(
  item: { url: string; title: string },
  seen: SeenItem[] = listSeen(),
): boolean {
  const url = item.url.trim();
  for (const s of seen) {
    if (s.url === url) return true;
    if (titleSimilarity(s.title, item.title) > 0.8) return true;
  }
  return false;
}

// ---------- post log ----------

export function listPostLog(): PostLogEntry[] {
  return readJson<PostLogEntry[]>(FILES.postlog, []);
}

export function appendPostLog(entry: PostLogEntry): void {
  writeJson(FILES.postlog, [...listPostLog(), entry]);
}
