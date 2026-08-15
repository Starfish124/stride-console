// File-based JSON store. Everything lives under ./data (gitignored, auto-created).
// Atomic writes via tmp file + rename so a crash never leaves half-written JSON.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Blueprint,
  Client,
  ClientStage,
  ClientTouch,
  Destination,
  Draft,
  EventChecklistItem,
  InboxEntry,
  Invoice,
  Myth,
  Note,
  NoteLane,
  PitchSignup,
  PostLogEntry,
  PostStats,
  PushSubscriptionRecord,
  ScoutCriteria,
  ScoutEvent,
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
  pushSubs: path.join(DATA_DIR, "push-subs.json"),
  clients: path.join(DATA_DIR, "clients.json"),
  notes: path.join(DATA_DIR, "notes.json"),
  scout: path.join(DATA_DIR, "scout.json"),
  invoices: path.join(DATA_DIR, "invoices.json"),
  blueprints: path.join(DATA_DIR, "blueprints.json"),
} as const;

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * `mode` is passed to the tmp file so a caller can keep a file 0600. Files
 * holding somebody else's email address or their consent record want that;
 * the drafts do not care.
 */
export function writeJson(file: string, value: unknown, mode?: number): void {
  ensureDataDir();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode });
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

export function removeMyth(id: string): boolean {
  const myths = listMyths();
  const left = myths.filter((m) => m.id !== id);
  if (left.length === myths.length) return false;
  saveMyths(left);
  return true;
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

/** Union by id: the user's entries stay exactly as edited, new defaults join. */
export function mergeSources(
  current: SourceEntry[],
  defaults: SourceEntry[],
): SourceEntry[] {
  const have = new Set(current.map((s) => s.id));
  return [...current, ...defaults.filter((d) => !have.has(d.id))];
}

/** Fold newly shipped default sources into the saved list. Returns the result. */
export function restoreDefaultSources(): SourceEntry[] {
  const defaults = readJson<SourceEntry[]>(
    path.join(process.cwd(), "config", "sources.default.json"),
    [],
  );
  const merged = mergeSources(listSources(), defaults);
  saveSources(merged);
  return merged;
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

export function removeEvent(id: string): boolean {
  const events = listEvents();
  const left = events.filter((e) => e.id !== id);
  if (left.length === events.length) return false;
  writeJson(FILES.events, left);
  return true;
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

// ---------- web-push subscriptions ----------

export function listPushSubs(): PushSubscriptionRecord[] {
  return readJson<PushSubscriptionRecord[]>(FILES.pushSubs, []);
}

export function addPushSub(sub: Omit<PushSubscriptionRecord, "addedAt">): void {
  const subs = listPushSubs().filter((s) => s.endpoint !== sub.endpoint);
  subs.push({ ...sub, addedAt: new Date().toISOString() });
  writeJson(FILES.pushSubs, subs);
}

export function removePushSub(endpoint: string): void {
  writeJson(
    FILES.pushSubs,
    listPushSubs().filter((s) => s.endpoint !== endpoint),
  );
}

// ---------- clients and leads ----------

export function listClients(): Client[] {
  return readJson<Client[]>(FILES.clients, []);
}

export function getClient(id: string): Client | undefined {
  return listClients().find((c) => c.id === id);
}

export function addClient(
  input: Partial<Client> & { name: string; company: string },
): Client {
  const now = new Date().toISOString();
  const client: Client = {
    ...input,
    id: newId("client"),
    name: input.name.trim(),
    company: input.company.trim(),
    stage: input.stage ?? "lead",
    touches: input.touches ?? [],
    createdAt: now,
    updatedAt: now,
  };
  writeJson(FILES.clients, [client, ...listClients()]);
  return client;
}

/**
 * Patch one client. Id, touches and createdAt are not patchable here — touches
 * go through addTouch so two founders adding one at once cannot clobber each
 * other's, and the other two are not the caller's to move.
 */
export function updateClient(
  id: string,
  patch: Partial<Omit<Client, "id" | "touches" | "createdAt">>,
): Client | undefined {
  const clients = listClients();
  const client = clients.find((c) => c.id === id);
  if (!client) return undefined;
  Object.assign(client, patch, { updatedAt: new Date().toISOString() });
  writeJson(FILES.clients, clients);
  return client;
}

export function addTouch(
  clientId: string,
  input: { note: string; who?: string; at?: string },
): Client | undefined {
  const clients = listClients();
  const client = clients.find((c) => c.id === clientId);
  if (!client) return undefined;
  const touch: ClientTouch = {
    id: newId("touch"),
    at: input.at ?? new Date().toISOString(),
    note: input.note.trim(),
    who: input.who,
  };
  // Newest first, so the detail page reads as a feed without sorting.
  client.touches = [touch, ...client.touches];
  client.updatedAt = new Date().toISOString();
  writeJson(FILES.clients, clients);
  return client;
}

export function removeClient(id: string): boolean {
  const clients = listClients();
  const left = clients.filter((c) => c.id !== id);
  if (left.length === clients.length) return false;
  writeJson(FILES.clients, left);
  return true;
}

/** Money in the pipe: value of everyone still in play, by stage. */
export function pipelineValue(clients: Client[] = listClients()): Record<ClientStage, number> {
  const totals: Record<ClientStage, number> = {
    lead: 0,
    talking: 0,
    proposal: 0,
    client: 0,
    past: 0,
  };
  for (const c of clients) totals[c.stage] += c.value ?? 0;
  return totals;
}

/**
 * Clients whose next step is today or already behind us. Sorted worst first,
 * because an overdue follow-up is the one thing on this board that decays.
 */
export function overdueClients(
  clients: Client[] = listClients(),
  today = new Date().toISOString().slice(0, 10),
): Client[] {
  return clients
    .filter((c) => c.nextStep && c.nextStep <= today && c.stage !== "past")
    .sort((a, b) => (a.nextStep ?? "").localeCompare(b.nextStep ?? ""));
}

// ---------- the shared notes board ----------

export function listNotes(): Note[] {
  return readJson<Note[]>(FILES.notes, []);
}

export function addNote(input: {
  text: string;
  lane?: NoteLane;
  area?: string;
  by?: string;
}): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: newId("note"),
    text: input.text.trim(),
    lane: input.lane ?? "idea",
    area: input.area,
    by: input.by,
    createdAt: now,
    updatedAt: now,
  };
  writeJson(FILES.notes, [note, ...listNotes()]);
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, "text" | "lane" | "area">>,
): Note | undefined {
  const notes = listNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return undefined;
  Object.assign(note, patch, { updatedAt: new Date().toISOString() });
  writeJson(FILES.notes, notes);
  return note;
}

export function removeNote(id: string): boolean {
  const notes = listNotes();
  const left = notes.filter((n) => n.id !== id);
  if (left.length === notes.length) return false;
  writeJson(FILES.notes, left);
  return true;
}

// ---------- event scout ----------

export function listScoutEvents(): ScoutEvent[] {
  const existing = readJson<ScoutEvent[] | null>(FILES.scout, null);
  if (existing) return existing;
  // First run: the board opens with researched events rather than a blank
  // page, same pattern as the source list. Seeds carry real dates and a
  // pre-scored rubric; delete or rescore them like anything else.
  const now = new Date().toISOString();
  const seeds = readJson<ScoutEvent[]>(
    path.join(process.cwd(), "config", "scout.default.json"),
    [],
  ).map((e) => ({ ...e, createdAt: now, updatedAt: now }));
  writeJson(FILES.scout, seeds);
  return seeds;
}

export function addScoutEvent(
  input: Omit<ScoutEvent, "id" | "createdAt" | "updatedAt" | "status" | "criteria"> & {
    status?: ScoutEvent["status"];
    criteria?: Partial<ScoutCriteria>;
  },
): ScoutEvent {
  const now = new Date().toISOString();
  const event: ScoutEvent = {
    ...input,
    id: newId("scout"),
    status: input.status ?? "considering",
    criteria: {
      audienceFit: input.criteria?.audienceFit ?? 3,
      leadPotential: input.criteria?.leadPotential ?? 3,
      visibility: input.criteria?.visibility ?? 3,
      affordability: input.criteria?.affordability ?? 3,
    },
    createdAt: now,
    updatedAt: now,
  };
  writeJson(FILES.scout, [event, ...listScoutEvents()]);
  return event;
}

export function updateScoutEvent(
  id: string,
  patch: Partial<Omit<ScoutEvent, "id" | "createdAt" | "updatedAt" | "criteria">> & {
    criteria?: Partial<ScoutCriteria>;
  },
): ScoutEvent | undefined {
  const events = listScoutEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return undefined;
  const { criteria, ...rest } = patch;
  Object.assign(event, rest, { updatedAt: new Date().toISOString() });
  if (criteria) Object.assign(event.criteria, criteria);
  writeJson(FILES.scout, events);
  return event;
}

export function removeScoutEvent(id: string): boolean {
  const events = listScoutEvents();
  const left = events.filter((e) => e.id !== id);
  if (left.length === events.length) return false;
  writeJson(FILES.scout, left);
  return true;
}

// ---------- invoices ----------

export function listInvoices(): Invoice[] {
  return readJson<Invoice[]>(FILES.invoices, []);
}

export function getInvoice(id: string): Invoice | undefined {
  return listInvoices().find((i) => i.id === id);
}

/** 2026-001, 2026-002, ... — sequence restarts each calendar year. */
export function nextInvoiceNumber(year = new Date().getFullYear()): string {
  const prefix = `${year}-`;
  const max = listInvoices()
    .filter((i) => i.number.startsWith(prefix))
    .reduce((m, i) => Math.max(m, Number(i.number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function addInvoice(
  input: Omit<Invoice, "id" | "number" | "createdAt" | "updatedAt" | "status"> & {
    status?: Invoice["status"];
  },
): Invoice {
  const now = new Date().toISOString();
  const invoice: Invoice = {
    ...input,
    id: newId("inv"),
    number: nextInvoiceNumber(Number(input.date.slice(0, 4)) || undefined),
    status: input.status ?? "draft",
    createdAt: now,
    updatedAt: now,
  };
  // Invoices are money paperwork: same 0600 the signup consent records get.
  writeJson(FILES.invoices, [invoice, ...listInvoices()], 0o600);
  return invoice;
}

export function updateInvoice(
  id: string,
  patch: Partial<Omit<Invoice, "id" | "number" | "createdAt" | "updatedAt">>,
): Invoice | undefined {
  const invoices = listInvoices();
  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) return undefined;
  Object.assign(invoice, patch, { updatedAt: new Date().toISOString() });
  writeJson(FILES.invoices, invoices, 0o600);
  return invoice;
}

export function removeInvoice(id: string): boolean {
  const invoices = listInvoices();
  const left = invoices.filter((i) => i.id !== id);
  if (left.length === invoices.length) return false;
  writeJson(FILES.invoices, left, 0o600);
  return true;
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

// ---------- blueprints ----------

export function listBlueprints(): Blueprint[] {
  const existing = readJson<Blueprint[] | null>(FILES.blueprints, null);
  if (existing) return existing;
  // First run: the library opens holding what has already been built once,
  // seeded from config the same way sources and the scout board are.
  const now = new Date().toISOString();
  const seeds = readJson<Blueprint[]>(
    path.join(process.cwd(), "config", "blueprints.default.json"),
    [],
  ).map((b) => ({ ...b, createdAt: now, updatedAt: now }));
  writeJson(FILES.blueprints, seeds);
  return seeds;
}

export function addBlueprint(
  input: Omit<Blueprint, "id" | "createdAt" | "updatedAt" | "uses" | "status"> & {
    status?: Blueprint["status"];
    uses?: Blueprint["uses"];
  },
): Blueprint {
  const now = new Date().toISOString();
  const blueprint: Blueprint = {
    ...input,
    id: newId("bp"),
    status: input.status ?? "experimental",
    uses: input.uses ?? [],
    createdAt: now,
    updatedAt: now,
  };
  writeJson(FILES.blueprints, [blueprint, ...listBlueprints()]);
  return blueprint;
}

export function updateBlueprint(
  id: string,
  patch: Partial<Omit<Blueprint, "id" | "createdAt" | "updatedAt">>,
): Blueprint | undefined {
  const blueprints = listBlueprints();
  const blueprint = blueprints.find((b) => b.id === id);
  if (!blueprint) return undefined;
  Object.assign(blueprint, patch, { updatedAt: new Date().toISOString() });
  writeJson(FILES.blueprints, blueprints);
  return blueprint;
}

/** Log a reuse: the moment a blueprint is copied for a client. */
export function recordBlueprintUse(id: string, client: string): Blueprint | undefined {
  const blueprints = listBlueprints();
  const blueprint = blueprints.find((b) => b.id === id);
  if (!blueprint) return undefined;
  blueprint.uses.push({ client, at: new Date().toISOString() });
  blueprint.updatedAt = new Date().toISOString();
  writeJson(FILES.blueprints, blueprints);
  return blueprint;
}

export function removeBlueprint(id: string): boolean {
  const blueprints = listBlueprints();
  const left = blueprints.filter((b) => b.id !== id);
  if (left.length === blueprints.length) return false;
  writeJson(FILES.blueprints, left);
  return true;
}
