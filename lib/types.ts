// Shared types for the Stride Console. Framework-free so Node tests can import them.

export type ContentRecipeId = "tldr" | "news" | "myth";

/** The four 1 Min AI Pitch recipes — the 10% promo slice, same pipeline. */
export type EventRecipeId =
  | "eventAnnounce"
  | "eventLineup"
  | "eventReminder"
  | "eventRecap";

export type RecipeId = ContentRecipeId | EventRecipeId;

export const EVENT_RECIPES: EventRecipeId[] = [
  "eventAnnounce",
  "eventLineup",
  "eventReminder",
  "eventRecap",
];

export function isEventRecipe(recipe: RecipeId): recipe is EventRecipeId {
  return (EVENT_RECIPES as RecipeId[]).includes(recipe);
}

export const RECIPE_LABELS: Record<RecipeId, string> = {
  tldr: "Stride TLDR",
  news: "Breaking This Week",
  myth: "Myth vs Reality",
  eventAnnounce: "Event announcement",
  eventLineup: "Event lineup",
  eventReminder: "Week-before reminder",
  eventRecap: "Day-after recap",
};

export type Destination = "page" | "founderA" | "founderB";

export type DraftStatus = "draft" | "approved" | "posted";

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  kind: "rss" | "page";
  tier: 1 | 2 | 3;
}

export interface SourcedItem {
  title: string;
  url: string;
  source: string;
  tier: 1 | 2 | 3;
  publishedAt?: string;
  summary?: string;
  /** Full article text via Jina Reader, attached to top stories only. */
  content?: string;
  score: number;
}

export interface SourceReportEntry {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface Myth {
  id: string;
  text: string;
  addedBy?: string;
  addedAt: string;
  used: boolean;
  usedAt?: string;
}

export interface SeenItem {
  url: string;
  title: string;
  seenAt: string;
}

export interface MythSlide {
  myth: string;
  reality: string;
}

export interface WriterOutput {
  hook: string;
  body: string;
  hashtags: string[];
  imageHeadline: string;
  imageStat?: string;
  slides?: MythSlide[];
  founderIntroA?: string;
  founderIntroB?: string;
}

export type LintSeverity = "error" | "warn";

export interface LintViolation {
  rule: string;
  severity: LintSeverity;
  excerpt: string;
  fix?: string;
}

export interface LintResult {
  violations: LintViolation[];
  errors: number;
  warns: number;
  ok: boolean;
}

export interface PostedRecord {
  destination: Destination;
  who: string;
  at: string;
}

export interface DraftRenders {
  /** PNG filenames under data/renders/{draftId}/ (carousel: one per slide). */
  images: string[];
  /** PDF filename under data/renders/{draftId}/ when the format is a carousel. */
  pdf?: string;
  error?: string;
}

export interface Draft {
  id: string;
  recipe: RecipeId;
  createdAt: string;
  status: DraftStatus;
  approvedBy?: string;
  approvedAt?: string;
  /** True when written without an API key: template output that deserves a manual Claude pass. */
  needsPolish: boolean;
  /** Full writer prompt, kept so founders can run it through Claude manually in no-key mode. */
  claudePrompt?: string;
  variants: Record<Destination, string>;
  hashtags: string[];
  imageHeadline: string;
  imageStat?: string;
  slides?: MythSlide[];
  items: SourcedItem[];
  mythId?: string;
  eventId?: string;
  /** Set when an event post would exceed the weekly promo slice. */
  promoWarning?: string;
  weekNumber: number;
  lint: Record<Destination, LintResult>;
  renders: DraftRenders;
  posted: PostedRecord[];
  sourceReport: SourceReportEntry[];
}

/** Manually entered LinkedIn numbers, recorded a day or two after posting. */
export interface PostStats {
  impressions: number;
  reactions: number;
  comments: number;
  saves: number;
  recordedAt: string;
}

export interface PostLogEntry {
  draftId: string;
  recipe: RecipeId;
  destination: Destination;
  who: string;
  at: string;
  stats?: PostStats;
}

// ---------- events (1 Min AI Pitch) ----------

export interface EventChecklistItem {
  id: string;
  label: string;
  /** ISO date the item is due, derived from the event date at creation. */
  due: string;
  done: boolean;
}

export interface StrideEvent {
  id: string;
  title: string;
  /** ISO date of the event evening. */
  date: string;
  venue: string;
  capacity: number;
  checklist: EventChecklistItem[];
  createdAt: string;
}

/** What the writer gets to work with for an event recipe. */
export interface EventWriteInfo {
  title: string;
  date: string;
  venue: string;
  capacity: number;
  signups: { name: string; startup: string; idea: string }[];
}

/** A /pitch signup: name + startup + the one-line idea. */
export interface PitchSignup {
  id: string;
  name: string;
  startup: string;
  idea: string;
  at: string;
}

// ---------- clients and leads ----------

/**
 * Where somebody sits with us. Deliberately short: a stage list long enough to
 * need a legend is a stage list nobody updates.
 */
export type ClientStage = "lead" | "talking" | "proposal" | "client" | "past";

export const CLIENT_STAGES: ClientStage[] = [
  "lead",
  "talking",
  "proposal",
  "client",
  "past",
];

export const STAGE_LABELS: Record<ClientStage, string> = {
  lead: "Lead",
  talking: "Talking",
  proposal: "Proposal out",
  client: "Client",
  past: "Past",
};

/** Plain words for what the stage means, shown under the column heading. */
export const STAGE_HINTS: Record<ClientStage, string> = {
  lead: "Somebody worth approaching. No conversation yet.",
  talking: "A conversation is live. Nothing priced.",
  proposal: "They have the numbers. The ball is theirs.",
  client: "Paying, and being delivered to.",
  past: "Finished or gone quiet. Worth a look now and then.",
};

/** One dated thing that happened with a client: a call, a reply, a send. */
export interface ClientTouch {
  id: string;
  /** ISO date. */
  at: string;
  note: string;
  who?: string;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  stage: ClientStage;
  /** Where they came from: an event, a campaign, a referral, the website. */
  source?: string;
  role?: string;
  email?: string;
  linkedin?: string;
  /** What they actually need, in the founder's own words. */
  need?: string;
  /** What Stride would do about it. Feeds the one-pager. */
  proposed?: string;
  /** Deal size in euros, if it has been said out loud. */
  value?: number;
  owner?: string;
  /** ISO date of the next thing we owe them. Drives the calendar. */
  nextStep?: string;
  nextStepNote?: string;
  touches: ClientTouch[];
  createdAt: string;
  updatedAt: string;
}

// ---------- the shared notes board ----------

export type NoteLane = "idea" | "todo" | "doing" | "done";

export const NOTE_LANES: NoteLane[] = ["idea", "todo", "doing", "done"];

export const LANE_LABELS: Record<NoteLane, string> = {
  idea: "Ideas",
  todo: "To build",
  doing: "Building",
  done: "Done",
};

/** A note either founder can drop in. Shared, because that is the whole point. */
export interface Note {
  id: string;
  text: string;
  lane: NoteLane;
  /** Which part of the machine it is about, for filtering. */
  area?: string;
  by?: string;
  createdAt: string;
  updatedAt: string;
}

/** A founder phone's web-push subscription, stored locally like everything else. */
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  addedAt: string;
}

/** One line per pregen run, surfaced as the dashboard's ready-to-review banner. */
export interface InboxEntry {
  id: string;
  draftId: string;
  recipe: RecipeId;
  message: string;
  at: string;
  seen: boolean;
}

// ---------- event scout (conferences and fairs worth attending) ----------

export type ScoutCategory = "ai" | "retail" | "tech" | "business" | "other";

export const SCOUT_CATEGORIES: ScoutCategory[] = ["ai", "retail", "tech", "business", "other"];

export const SCOUT_CATEGORY_LABELS: Record<ScoutCategory, string> = {
  ai: "AI",
  retail: "Retail",
  tech: "Tech",
  business: "Business",
  other: "Other",
};

export type ScoutStatus = "considering" | "going" | "skipped" | "attended";

export const SCOUT_STATUSES: ScoutStatus[] = ["considering", "going", "skipped", "attended"];

export const SCOUT_STATUS_LABELS: Record<ScoutStatus, string> = {
  considering: "Considering",
  going: "Going",
  skipped: "Skipped",
  attended: "Attended",
};

/**
 * The fit rubric, 0–5 each. Kept to four questions a founder can answer from
 * an event's landing page in a minute — more axes than that and nobody fills
 * them in, and the score stops meaning anything.
 */
export interface ScoutCriteria {
  /** Are Stride's target customers (SME founders, retail operators) in the room? */
  audienceFit: number;
  /** How many conversations there could realistically become clients? */
  leadPotential: number;
  /** Can we be seen — speak, demo, sponsor cheaply, or at least work the floor? */
  visibility: number;
  /** Ticket + travel + days out of the building. 5 = cheap and close. */
  affordability: number;
}

/**
 * Weighted fit score, 0–5, one decimal. Weights favour meeting buyers over
 * being seen: the console exists to find customers, not conference badges.
 */
export function scoutScore(c: ScoutCriteria): number {
  const clamp = (n: number) => Math.min(5, Math.max(0, Number.isFinite(n) ? n : 0));
  const raw =
    clamp(c.audienceFit) * 0.35 +
    clamp(c.leadPotential) * 0.3 +
    clamp(c.visibility) * 0.2 +
    clamp(c.affordability) * 0.15;
  return Math.round(raw * 10) / 10;
}

/** One event on the scout board. Dates are ISO yyyy-mm-dd, local. */
export interface ScoutEvent {
  id: string;
  name: string;
  url?: string;
  date?: string;
  endDate?: string;
  location?: string;
  category: ScoutCategory;
  /** Free text: "€450 ticket + hotel", "free". */
  cost?: string;
  notes?: string;
  criteria: ScoutCriteria;
  status: ScoutStatus;
  by?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- invoices ----------

export type InvoiceStatus = "draft" | "sent" | "paid";

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

/** One billable line: a bold what, a grey how, and the arithmetic. */
export interface InvoiceLine {
  title: string;
  subtitle?: string;
  qty: number;
  rate: number;
}

/**
 * An invoice in the approved template's shape. Company details are NOT stored
 * per invoice — they come from lib/company.ts at render time, so a corrected
 * IBAN fixes every reprint. What the client owed and was shown is stored.
 */
export interface Invoice {
  id: string;
  /** 2026-001 — year, dash, three-digit sequence within the year. */
  number: string;
  clientId?: string;
  billTo: {
    name: string;
    attn?: string;
    address: string[];
    email?: string;
  };
  /** ISO yyyy-mm-dd. Due date derives: date + dueDays. */
  date: string;
  dueDays: number;
  reference?: string;
  lines: InvoiceLine[];
  /** Percent, 21 for Dutch BTW. Stored so a rate change never rewrites history. */
  vatRate: number;
  status: InvoiceStatus;
  by?: string;
  createdAt: string;
  updatedAt: string;
}

export function invoiceSubtotal(inv: Pick<Invoice, "lines">): number {
  return inv.lines.reduce((s, l) => s + l.qty * l.rate, 0);
}

export function invoiceVat(inv: Pick<Invoice, "lines" | "vatRate">): number {
  return Math.round(invoiceSubtotal(inv) * inv.vatRate) / 100;
}

export function invoiceTotal(inv: Pick<Invoice, "lines" | "vatRate">): number {
  return invoiceSubtotal(inv) + invoiceVat(inv);
}

/** date + dueDays, ISO. */
export function invoiceDueDate(inv: Pick<Invoice, "date" | "dueDays">): string {
  const d = new Date(`${inv.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + inv.dueDays);
  return d.toISOString().slice(0, 10);
}
