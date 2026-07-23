// File-based JSON store. Everything lives under ./data (gitignored, auto-created).
// Atomic writes via tmp file + rename so a crash never leaves half-written JSON.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Destination,
  Draft,
  EventChecklistItem,
  InboxEntry,
  Myth,
  PitchSignup,
  PostLogEntry,
  PostStats,
  SeenItem,
  SourceEntry,
  StrideEvent,
} from "./types.ts";

export const DATA_DIR = path.join(process.cwd(), "data");
export const RENDERS_DIR = path.join(DATA_DIR, "renders");

const FILES = {
  drafts: path.join(DATA_DIR, "drafts.json"),
  seen: path.join(DATA_DIR, "seen.json"),
  myths: path.join(DATA_DIR, "myths.json"),
  sources: path.join(DATA_DIR, "sources.json"),
  postlog: path.join(DATA_DIR, "postlog.json"),
  inbox: path.join(DATA_DIR, "inbox.json"),
  events: path.join(DATA_DIR, "events.json"),
  signups: path.join(DATA_DIR, "signups.json"),
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

// ---------- events (1 Min AI Pitch) ----------

const DAY_MS = 24 * 60 * 60 * 1000;

/** The T-6-weeks checklist, due dates counted back from the event date. */
const CHECKLIST_TEMPLATE: { label: string; daysBefore: number }[] = [
  { label: "Venue confirmed.", daysBefore: 42 },
  { label: "Invites out.", daysBefore: 35 },
  { label: "Speakers confirmed.", daysBefore: 28 },
  { label: "Investors invited.", daysBefore: 28 },
  { label: "Catering booked.", daysBefore: 14 },
  { label: "Photographer booked.", daysBefore: 14 },
];

export function buildChecklist(eventDate: string): EventChecklistItem[] {
  const eventTime = Date.parse(eventDate);
  return CHECKLIST_TEMPLATE.map((item, i) => ({
    id: `item_${i + 1}`,
    label: item.label,
    due: new Date(eventTime - item.daysBefore * DAY_MS).toISOString().slice(0, 10),
    done: false,
  }));
}

export function listEvents(): StrideEvent[] {
  return readJson<StrideEvent[]>(FILES.events, []);
}

export function getEvent(id: string): StrideEvent | undefined {
  return listEvents().find((e) => e.id === id);
}

/** The next event: soonest date, yesterday's event still counts on the day after. */
export function upcomingEvent(): StrideEvent | undefined {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return listEvents()
    .filter((e) => Date.parse(e.date) > cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function addEvent(input: {
  title: string;
  date: string;
  venue: string;
  capacity: number;
}): StrideEvent {
  const event: StrideEvent = {
    id: newId("event"),
    title: input.title.trim(),
    date: input.date,
    venue: input.venue.trim(),
    capacity: input.capacity,
    checklist: buildChecklist(input.date),
    createdAt: new Date().toISOString(),
  };
  writeJson(FILES.events, [event, ...listEvents()]);
  return event;
}

export function setChecklistItem(
  eventId: string,
  itemId: string,
  done: boolean,
): StrideEvent | undefined {
  const events = listEvents();
  const event = events.find((e) => e.id === eventId);
  const item = event?.checklist.find((i) => i.id === itemId);
  if (!event || !item) return undefined;
  item.done = done;
  writeJson(FILES.events, events);
  return event;
}

// ---------- pitch signups ----------

export function listSignups(): PitchSignup[] {
  return readJson<PitchSignup[]>(FILES.signups, []);
}

export function addSignup(input: {
  name: string;
  startup: string;
  idea: string;
}): PitchSignup {
  const signup: PitchSignup = {
    id: newId("signup"),
    name: input.name.trim(),
    startup: input.startup.trim(),
    idea: input.idea.trim(),
    at: new Date().toISOString(),
  };
  writeJson(FILES.signups, [...listSignups(), signup]);
  return signup;
}

// ---------- post log ----------

export function listPostLog(): PostLogEntry[] {
  return readJson<PostLogEntry[]>(FILES.postlog, []);
}

export function appendPostLog(entry: PostLogEntry): void {
  writeJson(FILES.postlog, [...listPostLog(), entry]);
}

/** Attach manually entered stats to the log entry for this draft + destination. */
export function recordPostStats(
  draftId: string,
  destination: Destination,
  stats: Omit<PostStats, "recordedAt">,
): PostLogEntry | undefined {
  const log = listPostLog();
  const entry = log.find(
    (e) => e.draftId === draftId && e.destination === destination,
  );
  if (!entry) return undefined;
  entry.stats = { ...stats, recordedAt: new Date().toISOString() };
  writeJson(FILES.postlog, log);
  return entry;
}

// ---------- inbox (draft-ready notifications) ----------

export function listInbox(): InboxEntry[] {
  return readJson<InboxEntry[]>(FILES.inbox, []);
}

export function pushInbox(
  entry: Omit<InboxEntry, "id" | "at" | "seen">,
): InboxEntry {
  const full: InboxEntry = {
    ...entry,
    id: newId("inbox"),
    at: new Date().toISOString(),
    seen: false,
  };
  // Newest first; keep the inbox short — it is a banner, not an archive.
  writeJson(FILES.inbox, [full, ...listInbox()].slice(0, 20));
  return full;
}

export function markInboxSeen(): void {
  writeJson(
    FILES.inbox,
    listInbox().map((e) => ({ ...e, seen: true })),
  );
}
