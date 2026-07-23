// Shared types for the Stride Console. Framework-free so Node tests can import them.

export type RecipeId = "tldr" | "news" | "myth";

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
  weekNumber: number;
  lint: Record<Destination, LintResult>;
  renders: DraftRenders;
  posted: PostedRecord[];
  sourceReport: SourceReportEntry[];
}

export interface PostLogEntry {
  draftId: string;
  recipe: RecipeId;
  destination: Destination;
  who: string;
  at: string;
}
