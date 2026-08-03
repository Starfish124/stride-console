// Types for the self-running SEO engine. Framework-free so Node tests can import them.

export type Locale = "en" | "nl";

export const LOCALES: Locale[] = ["en", "nl"];

/**
 * Search intent, from the claude-seo clustering methodology. Navigational
 * keywords are tracked but never targeted with new content: somebody typing
 * "stride ai login" has already found us.
 */
export type Intent = "informational" | "commercial" | "transactional" | "navigational";

export const TARGETABLE_INTENTS: Intent[] = [
  "informational",
  "commercial",
  "transactional",
];

export interface Keyword {
  id: string;
  /** Normalised phrase: lowercase, collapsed whitespace, no leading article. */
  term: string;
  locale: Locale;
  intent: Intent;
  /** Where the term came from, so a bad source can be traced and pruned. */
  discoveredVia: "seed" | "autocomplete" | "paa" | "search-console" | "manual";
  discoveredAt: string;
  /** Cluster id once the organiser has grouped it. */
  clusterId?: string;
  /** Route this keyword is assigned to target, if any. */
  assignedRoute?: string;
  /** True when this is the single primary keyword of its route. */
  primary?: boolean;
  /**
   * Live Search Console numbers, when available. Absent means never measured,
   * which is different from measured-as-zero.
   */
  stats?: KeywordStats;
  /** Opportunity score, recomputed each sweep. Higher means work on it sooner. */
  opportunity: number;
  /** How the score was arrived at, shown in the dashboard. */
  reasoning?: string;
}

export interface KeywordStats {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  measuredAt: string;
}

export interface Cluster {
  id: string;
  /** The broadest term in the group; the pillar page targets it. */
  pillarTerm: string;
  locale: Locale;
  intent: Intent;
  keywordIds: string[];
  /** Route serving as the pillar for this cluster, once one exists. */
  pillarRoute?: string;
  createdAt: string;
}

/** A gap: a cluster with real demand and no page targeting it. */
export interface ArticleBrief {
  id: string;
  clusterId: string;
  locale: Locale;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: Intent;
  /** Template from the claude-seo intent-to-template map. */
  template: ArticleTemplate;
  role: "pillar" | "spoke";
  wordCountTarget: number;
  /** Internal links this article must place, from the cluster link matrix. */
  internalLinks: { href: string; anchor: string }[];
  suggestedSlug: string;
  opportunity: number;
  createdAt: string;
}

export type ArticleTemplate =
  | "ultimate-guide"
  | "how-to"
  | "listicle"
  | "explainer"
  | "comparison"
  | "review"
  | "best-of"
  | "landing-page";

export type ArticleStatus = "drafted" | "approved" | "published" | "rejected";

export interface SeoArticle {
  id: string;
  briefId: string;
  slug: string;
  locale: Locale;
  title: string;
  description: string;
  body: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  cluster: string;
  role: "pillar" | "spoke";
  internalLinks: { href: string; anchor: string }[];
  sources: { title: string; url: string; publisher?: string }[];
  wordCount: number;
  status: ArticleStatus;
  /** Voice-gate result at the moment it was written. */
  lint: { errors: number; warns: number; violations: LintViolation[] };
  /** On-page keyword placement check. */
  placement: PlacementResult;
  createdAt: string;
  publishedAt?: string;
  /** Commit sha once pushed, so a published article is traceable to a build. */
  commit?: string;
  writerMode: string;
}

export interface LintViolation {
  rule: string;
  severity: "error" | "warn";
  excerpt: string;
  fix?: string;
}

/** Where the primary keyword landed, per the claude-seo placement rules. */
export interface PlacementResult {
  inTitle: boolean;
  inH1: boolean;
  inSlug: boolean;
  inDescription: boolean;
  inFirstParagraph: boolean;
  inAnyHeading: boolean;
  occurrences: number;
  /** Errors block publication; warnings are shown but do not block. */
  missing: string[];
  ok: boolean;
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface AuditFinding {
  rule: string;
  severity: Severity;
  detail: string;
  recommendation: string;
  /** Set when the optimiser can fix this itself by editing pages.json. */
  autoFixable: boolean;
}

export interface PageAudit {
  route: string;
  locale: Locale;
  url: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  status?: number;
  title?: string;
  titleLength?: number;
  description?: string;
  descriptionLength?: number;
  h1?: string;
  h1Count: number;
  headings: { level: number; text: string }[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesMissingAlt: number;
  imageCount: number;
  canonical?: string;
  hasSchema: boolean;
  schemaTypes: string[];
  primaryKeyword?: string;
  placement?: PlacementResult;
  findings: AuditFinding[];
  /** 0-100, weighted per the claude-seo on-page rubric. */
  score: number;
}

/** One proposed edit to content/seo/pages.json. */
export interface MetaChange {
  route: string;
  locale: Locale;
  field: "title" | "description";
  before: string;
  after: string;
  reason: string;
  appliedAt?: string;
}

export interface SweepResult {
  id: string;
  startedAt: string;
  finishedAt: string;
  outcome: "ok" | "partial" | "failed";
  message: string;
  keywordsDiscovered: number;
  keywordsTotal: number;
  clustersTotal: number;
  pagesAudited: number;
  averageScore: number;
  changesProposed: MetaChange[];
  changesApplied: number;
  /**
   * What became of the applied metadata in the website checkout. Writing
   * pages.json is not the same as the site serving it: without a commit and a
   * push the improvements sit as a local diff and no visitor ever sees them.
   */
  published?: { ok: boolean; commit?: string; branch?: string; message: string };
  briefsCreated: number;
  statsSource: "search-console" | "none";
  findings: { route: string; severity: Severity; detail: string }[];
}

export interface SeoConfig {
  /** Absolute path to the website checkout the agent publishes into. */
  siteRepo: string;
  baseUrl: string;
  /** Routes the auditor checks, discovered from pages.json. */
  locales: Locale[];
  /** Seed terms the keyword expander starts from, per locale. */
  seeds: Record<Locale, string[]>;
  /** Max articles one article run drafts. The run is daily, so this is a
   * per-day ceiling: one good article a day beats three on a Monday, because
   * Google reads a steady publishing rhythm and a founder can read one. */
  articlesPerRun: number;
  /** Apply metadata changes automatically, or hold them for approval. */
  autoApplyMetadata: boolean;
  /** Push to git automatically once an article is approved. */
  autoPublishOnApproval: boolean;
  /**
   * Publish an article the moment the writer produces it, without waiting for
   * a human. The voice gate still decides: only a draft with zero errors goes,
   * and anything it flags stays in the queue for a person. Turning this off
   * makes every article wait for the Publish button on /seo.
   */
  autoPublishArticles: boolean;
  /**
   * After an English article, write the Dutch counterpart under the same slug.
   * Doubles the writer runs a day, and only happens when the keyword store
   * holds a Dutch term that overlaps the brief — no term, no twin.
   */
  dutchTwins: boolean;
}

export const DEFAULT_SEEDS: Record<Locale, string[]> = {
  en: [
    "AI consultant for businesses",
    "AI agency",
    "AI chatbot development",
    "workflow automation",
    "custom AI agents",
    "AI integration consulting",
  ],
  nl: [
    "AI consultant",
    "AI bureau",
    "AI chatbot laten maken",
    "workflow automatisering",
    "AI agents voor bedrijven",
    "AI implementatie",
  ],
};
