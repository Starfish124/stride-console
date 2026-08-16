// SEO state, in the same file-based JSON store the rest of the console uses.
// Atomic writes via tmp file plus rename, so a crash mid-sweep never leaves
// half-written JSON that the next sweep then reads as truth.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DEFAULT_SEEDS,
  type ArticleBrief,
  type Cluster,
  type Keyword,
  type MetaChange,
  type PageAudit,
  type SeoArticle,
  type SeoConfig,
  type SweepResult,
} from "./types.ts";
import type { GovernorDecision } from "./governor.ts";

const DATA_DIR = path.join(process.cwd(), "data");

const FILES = {
  keywords: path.join(DATA_DIR, "seo-keywords.json"),
  clusters: path.join(DATA_DIR, "seo-clusters.json"),
  briefs: path.join(DATA_DIR, "seo-briefs.json"),
  articles: path.join(DATA_DIR, "seo-articles.json"),
  audits: path.join(DATA_DIR, "seo-audits.json"),
  sweeps: path.join(DATA_DIR, "seo-sweeps.json"),
  config: path.join(DATA_DIR, "seo-config.json"),
  governor: path.join(DATA_DIR, "seo-governor.json"),
} as const;

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

// ---------- config ----------

export const DEFAULT_CONFIG: SeoConfig = {
  siteRepo: process.env.STRIDE_SITE_REPO ?? path.join(process.env.HOME ?? "", "ai-agency-website"),
  baseUrl: "https://stride-ai.nl",
  locales: ["en", "nl"],
  seeds: DEFAULT_SEEDS,
  articlesPerRun: 3,
  // Metadata edits go live without asking. They are reversible with one git
  // revert and holding them for approval means the site never improves between
  // Mondays. Article publication is the thing that waits for a human.
  autoApplyMetadata: true,
  autoPublishOnApproval: true,
  // The writer publishes its own clean work. The voice gate is what stands
  // between the machine and the site, not a person's attention: a draft with
  // any error stays in the queue and waits to be read.
  autoPublishArticles: true,
  // The Netherlands is the market that buys, and the site is already bilingual.
  dutchTwins: true,
  // Evidence before work. The guesses run out, and what is left at the top of
  // the queue scores well and means nothing.
  requireMeasuredDemand: true,
  // One article a day, published, whatever the queue looks like. A founder's
  // call and not a negotiable one: a blog that skips days reads as abandoned to
  // a reader and as a dead section to a crawler, and the compounding this
  // engine exists for only starts once the rhythm is unbroken.
  minPublishedPerRun: 1,
};

export function getConfig(): SeoConfig {
  const stored = readJson<Partial<SeoConfig>>(FILES.config, {});
  return { ...DEFAULT_CONFIG, ...stored, seeds: { ...DEFAULT_SEEDS, ...stored.seeds } };
}

export function saveConfig(patch: Partial<SeoConfig>): SeoConfig {
  const next = { ...getConfig(), ...patch };
  writeJson(FILES.config, next);
  return next;
}

// ---------- the governor ----------

/**
 * Every pace decision, newest first, including the ones that changed nothing.
 *
 * The holds matter as much as the changes: "it stayed at three because four of
 * six articles are earning" is the sentence that makes an automated cap
 * trustworthy, and without it a founder finds a number that moved on its own and
 * has no way to ask why.
 */
export function listGovernorDecisions(): GovernorDecision[] {
  return readJson<GovernorDecision[]>(FILES.governor, []);
}

export function appendGovernorDecision(decision: GovernorDecision): void {
  writeJson(FILES.governor, [decision, ...listGovernorDecisions()].slice(0, 60));
}

/** When the pace was last RAISED, which is the only direction with a cooldown. */
export function lastRaisedAt(): string | undefined {
  return listGovernorDecisions().find((d) => d.changed && d.to > d.from)?.at;
}

// ---------- keywords ----------

export function listKeywords(): Keyword[] {
  return readJson<Keyword[]>(FILES.keywords, []);
}

export function saveKeywords(keywords: Keyword[]): void {
  writeJson(FILES.keywords, keywords);
}

/**
 * Merge discovered terms into the store. Existing keywords keep their id,
 * assignment and stats: an assignment is a decision the organiser made, and a
 * rediscovery is not new information about it.
 *
 * Returns the keywords that were genuinely new.
 */
export function mergeKeywords(discovered: Keyword[]): Keyword[] {
  const existing = listKeywords();
  const seen = new Map(existing.map((k) => [`${k.locale}:${k.term}`, k]));
  const added: Keyword[] = [];

  for (const kw of discovered) {
    const key = `${kw.locale}:${kw.term}`;
    const prior = seen.get(key);
    if (prior) {
      // Refresh only the fields a new sighting can legitimately update.
      prior.intent = kw.intent;
      prior.opportunity = kw.opportunity;
      prior.reasoning = kw.reasoning;
      continue;
    }
    seen.set(key, kw);
    added.push(kw);
  }

  saveKeywords([...existing, ...added]);
  return added;
}

export function updateKeyword(id: string, patch: Partial<Keyword>): void {
  const all = listKeywords();
  const index = all.findIndex((k) => k.id === id);
  if (index < 0) return;
  all[index] = { ...all[index], ...patch };
  saveKeywords(all);
}

// ---------- clusters ----------

export function listClusters(): Cluster[] {
  return readJson<Cluster[]>(FILES.clusters, []);
}

export function saveClusters(clusters: Cluster[]): void {
  writeJson(FILES.clusters, clusters);
}

// ---------- briefs ----------

export function listBriefs(): ArticleBrief[] {
  return readJson<ArticleBrief[]>(FILES.briefs, []);
}

export function saveBriefs(briefs: ArticleBrief[]): void {
  writeJson(FILES.briefs, briefs);
}

export function addBriefs(briefs: ArticleBrief[]): ArticleBrief[] {
  const existing = listBriefs();
  // Two ways a brief is already in the queue.
  //
  // The cluster key is the original one: a brief for a cluster and locale
  // already queued is not a new opportunity, it is the same one seen again.
  //
  // The slug key is what a brief minted from a SINGLE keyword needs. Those
  // carry no cluster of their own — they are one term, not a group — and
  // keying them on an empty cluster id would have made every keyword brief in
  // a locale collide with the first one and vanish without a word. The slug is
  // their real identity, and it catches the same duplicate twice over: within
  // one call, and against everything already queued.
  const clusters = new Set(
    existing.filter((b) => b.clusterId).map((b) => `${b.clusterId}:${b.locale}`),
  );
  const slugs = new Set(existing.map((b) => `${b.suggestedSlug}:${b.locale}`));

  const fresh = briefs.filter((b) => {
    const slugKey = `${b.suggestedSlug}:${b.locale}`;
    if (slugs.has(slugKey)) return false;
    if (b.clusterId && clusters.has(`${b.clusterId}:${b.locale}`)) return false;
    slugs.add(slugKey);
    if (b.clusterId) clusters.add(`${b.clusterId}:${b.locale}`);
    return true;
  });

  saveBriefs([...existing, ...fresh]);
  return fresh;
}

export function removeBrief(id: string): void {
  saveBriefs(listBriefs().filter((b) => b.id !== id));
}

// ---------- articles ----------

export function listArticles(): SeoArticle[] {
  return readJson<SeoArticle[]>(FILES.articles, []);
}

export function getArticle(id: string): SeoArticle | undefined {
  return listArticles().find((a) => a.id === id);
}

export function saveArticle(article: SeoArticle): void {
  const all = listArticles();
  const index = all.findIndex((a) => a.id === article.id);
  if (index >= 0) all[index] = article;
  else all.unshift(article);
  writeJson(FILES.articles, all);
}

/** Slugs already used, so the writer never collides with a live URL. */
export function usedSlugs(): Set<string> {
  return new Set(listArticles().map((a) => `${a.slug}:${a.locale}`));
}

// ---------- audits ----------

export function listAudits(): PageAudit[] {
  return readJson<PageAudit[]>(FILES.audits, []);
}

export function saveAudits(audits: PageAudit[]): void {
  writeJson(FILES.audits, audits);
}

// ---------- sweeps ----------

export function listSweeps(): SweepResult[] {
  return readJson<SweepResult[]>(FILES.sweeps, []);
}

export function appendSweep(sweep: SweepResult): void {
  // 90 sweeps is roughly three months of daily history, which is enough to see
  // a trend and small enough to render without pagination.
  const all = [sweep, ...listSweeps()].slice(0, 90);
  writeJson(FILES.sweeps, all);
}

/** Every metadata change ever applied, newest first, for the dashboard log. */
export function appliedChanges(limit = 50): MetaChange[] {
  return listSweeps()
    .flatMap((s) => s.changesProposed.filter((c) => c.appliedAt))
    .slice(0, limit);
}
