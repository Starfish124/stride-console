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

const DATA_DIR = path.join(process.cwd(), "data");

const FILES = {
  keywords: path.join(DATA_DIR, "seo-keywords.json"),
  clusters: path.join(DATA_DIR, "seo-clusters.json"),
  briefs: path.join(DATA_DIR, "seo-briefs.json"),
  articles: path.join(DATA_DIR, "seo-articles.json"),
  audits: path.join(DATA_DIR, "seo-audits.json"),
  sweeps: path.join(DATA_DIR, "seo-sweeps.json"),
  config: path.join(DATA_DIR, "seo-config.json"),
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
  weeklyArticleTarget: 3,
  // Metadata edits go live without asking. They are reversible with one git
  // revert and holding them for approval means the site never improves between
  // Mondays. Article publication is the thing that waits for a human.
  autoApplyMetadata: true,
  autoPublishOnApproval: true,
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
  // A brief for a cluster and locale already in the queue is not a new
  // opportunity, it is the same one seen again.
  const keys = new Set(existing.map((b) => `${b.clusterId}:${b.locale}`));
  const fresh = briefs.filter((b) => !keys.has(`${b.clusterId}:${b.locale}`));
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
