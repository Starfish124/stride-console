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

/** One line per pregen run, surfaced as the dashboard's ready-to-review banner. */
export interface InboxEntry {
  id: string;
  draftId: string;
  recipe: RecipeId;
  message: string;
  at: string;
  seen: boolean;
}
