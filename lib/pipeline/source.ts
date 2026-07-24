// Stage 1 — sourcing. RSS via rss-parser; non-RSS pages read through Jina Reader.
// A broken source is reported and skipped. It never throws the run.

import Parser from "rss-parser";
import type {
  Myth,
  SourceEntry,
  SourceReportEntry,
  SourcedItem,
} from "../types.ts";
import {
  isDuplicate,
  listSeen,
  listSources,
  markSeen,
  takeOldestUnusedMyth,
  titleSimilarity,
} from "../store.ts";
import { enrichItems } from "./reader.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const POSITIVE_KEYWORDS: [RegExp, number][] = [
  [/\b(launch|launches|launched|ships?|shipped|release[sd]?|rolls? out|now available|introduc\w+)\b/i, 3],
  [/\b(model|gpt|claude|gemini|llama|open[- ]?source|weights)\b/i, 2],
  [/\b(agent|agents|automation|workflow|api|tool|integration|copilot)\b/i, 2],
  [/\b(regulation|regulator|eu ai act|compliance|lawsuit|ruling|policy)\b/i, 2],
  [/\b(pricing|price|cost|free tier|enterprise|smb|business|customers?)\b/i, 2],
  [/\b(benchmark|eval|accuracy|latency|context window)\b/i, 1],
  [/\b\d/, 1],
];

const NEGATIVE_KEYWORDS: [RegExp, number][] = [
  [/\b(raises?|raised|funding|series [a-e]\b|valuation|venture|vc round)\b/i, -3],
  [/\b(hiring|job|jobs|career|we're looking|join our team|vacanc)\b/i, -4],
  [/\b(preprint|arxiv|peer[- ]review|dissertation|thesis)\b/i, -2],
  [/\b(webinar|sponsored|partner content|press release)\b/i, -2],
  [/\b(opinion|op[- ]ed|hot take)\b/i, -1],
];

const TIER_SCORE: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

export function scoreItem(item: { title: string; summary?: string; tier: 1 | 2 | 3 }): number {
  const text = `${item.title} ${item.summary ?? ""}`;
  let score = TIER_SCORE[item.tier] ?? 1;
  for (const [re, points] of [...POSITIVE_KEYWORDS, ...NEGATIVE_KEYWORDS]) {
    if (re.test(text)) score += points;
  }
  return score;
}

async function fetchRss(source: SourceEntry): Promise<SourcedItem[]> {
  const parser = new Parser({ timeout: 15000 });
  const feed = await parser.parseURL(source.url);
  const items: SourcedItem[] = [];
  for (const entry of feed.items ?? []) {
    const title = (entry.title ?? "").trim();
    const url = (entry.link ?? "").trim();
    if (!title || !url) continue;
    const publishedAt = entry.isoDate ?? entry.pubDate;
    const summary = (entry.contentSnippet ?? "").slice(0, 300);
    items.push({
      title,
      url,
      source: source.name,
      tier: source.tier,
      publishedAt,
      summary,
      score: 0,
    });
  }
  return items;
}

async function fetchPageViaJina(source: SourceEntry): Promise<SourcedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://r.jina.ai/${source.url}`, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Jina Reader returns markdown. Headline-length markdown links are our item candidates.
    const items: SourcedItem[] = [];
    const linkRe = /\[([^\]\n]{25,180})\]\((https?:\/\/[^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(text)) !== null && items.length < 10) {
      const title = m[1].replace(/\s+/g, " ").trim();
      if (/^(image|photo|logo|subscribe|sign in|read more)/i.test(title)) continue;
      items.push({
        title,
        url: m[2],
        source: source.name,
        tier: source.tier,
        score: 0,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export interface SourceRunResult {
  items: SourcedItem[];
  report: SourceReportEntry[];
}

/** Pull, filter to last 7 days, dedupe against seen.json, score, rank. */
export async function pullItems(limit: number): Promise<SourceRunResult> {
  return collectItems(limit, { mark: true });
}

/**
 * The radar: exactly what a run would pick from, WITHOUT consuming it.
 * Nothing is marked seen, so the next real run still gets every story.
 */
export async function previewItems(limit: number): Promise<SourceRunResult> {
  return collectItems(limit, { mark: false });
}

async function collectItems(
  limit: number,
  { mark }: { mark: boolean },
): Promise<SourceRunResult> {
  const sources = listSources();
  const report: SourceReportEntry[] = [];
  const all: SourcedItem[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const items =
          source.kind === "rss" ? await fetchRss(source) : await fetchPageViaJina(source);
        all.push(...items);
        report.push({ source: source.name, ok: true, count: items.length });
      } catch (err) {
        report.push({
          source: source.name,
          ok: false,
          count: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  const cutoff = Date.now() - WEEK_MS;
  const seen = listSeen();
  const fresh = all.filter((item) => {
    if (item.publishedAt) {
      const t = Date.parse(item.publishedAt);
      if (!Number.isNaN(t) && t < cutoff) return false;
    }
    return !isDuplicate(item, seen);
  });

  // Dedupe within this run too (same story from two sources).
  const unique: SourcedItem[] = [];
  for (const item of fresh) {
    const dupe = unique.some(
      (u) => u.url === item.url || titleSimilarity(u.title, item.title) > 0.8,
    );
    if (!dupe) unique.push(item);
  }

  for (const item of unique) item.score = scoreItem(item);
  unique.sort((a, b) => b.score - a.score);

  const picked = unique.slice(0, limit);
  if (mark) markSeen(picked);
  return { items: picked, report };
}

/** TLDR: top 7 items across sources, the top 3 read in full. */
export async function sourceTldr(): Promise<SourceRunResult> {
  const result = await pullItems(7);
  await enrichItems(result.items, 3);
  return result;
}

/** News: the top story plus up to 2 related items (title similarity cluster). */
export async function sourceNews(): Promise<SourceRunResult> {
  const { items, report } = await pullItems(15);
  if (items.length === 0) return { items, report };
  const top = items[0];
  const cluster = [top];
  for (const item of items.slice(1)) {
    if (cluster.length >= 3) break;
    if (titleSimilarity(top.title, item.title) > 0.2) cluster.push(item);
  }
  // If nothing clusters, take the next best stories as context.
  for (const item of items.slice(1)) {
    if (cluster.length >= 3) break;
    if (!cluster.includes(item)) cluster.push(item);
  }
  // The lead story and its context get read in full — this is the recipe
  // that lives or dies on depth.
  await enrichItems(cluster, 3);
  return { items: cluster, report };
}

/** Myth: oldest unused myth from the bank. No network. */
export function sourceMyth(): { myth: Myth | undefined } {
  return { myth: takeOldestUnusedMyth() };
}

/** ISO week number, used in the TLDR eyebrow. */
export function isoWeek(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
