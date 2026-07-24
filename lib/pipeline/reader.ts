// Stage 1b — depth. The top stories get their full article text through
// Jina Reader, so the writer works from what was actually written, not a
// headline and a 300-character snippet. A slow or blocked site never throws
// the run: enrichment is best-effort per item.

import type { SourcedItem } from "../types.ts";

/** Keep prompts bounded: enough for real substance, never a whole longread. */
export const MAX_ARTICLE_CHARS = 6000;

const READER_TIMEOUT_MS = 20000;

/**
 * Strip reader markdown down to prompt-ready prose: drop images, boilerplate
 * link lists, and nav noise; unwrap inline links to their text.
 */
export function cleanArticle(markdown: string, maxChars: number = MAX_ARTICLE_CHARS): string {
  const lines = markdown
    // Images carry no text for a writer.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // [text](url) → text.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split("\n");

  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    // Nav crumbs, share rows, cookie banners: short shouty fragments.
    if (/^(skip to|share|subscribe|sign in|log in|accept cookies|advertisement|related:|read more|see also)/i.test(line)) continue;
    // Markdown tables and separator art add tokens, not meaning.
    if (/^[|=_*-]{3,}$/.test(line)) continue;
    kept.push(raw);
  }

  const text = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= maxChars) return text;
  // Cut on a paragraph edge so the writer never sees a mid-sentence cliff.
  const cut = text.lastIndexOf("\n\n", maxChars);
  return text.slice(0, cut > maxChars / 2 ? cut : maxChars).trim();
}

/**
 * Read one URL through Jina Reader. Returns cleaned article text, or
 * undefined when the site is slow, blocked, or the response is too thin
 * to be an article. Set JINA_API_KEY for higher rate limits; without it
 * the free tier is plenty for a handful of stories per run.
 */
export async function readArticle(
  url: string,
  { timeoutMs = READER_TIMEOUT_MS, maxChars = MAX_ARTICLE_CHARS }: { timeoutMs?: number; maxChars?: number } = {},
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "text/plain" };
    const key = process.env.JINA_API_KEY;
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return undefined;
    const text = cleanArticle(await res.text(), maxChars);
    // Under ~400 chars it is a paywall stub or an error page, not an article.
    return text.length >= 400 ? text : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export interface EnrichReport {
  attempted: number;
  enriched: number;
}

/**
 * Attach full article text to the first `count` items, in place.
 * Failures leave the item as it was — headline + snippet still write fine.
 */
export async function enrichItems(
  items: SourcedItem[],
  count: number,
): Promise<EnrichReport> {
  const targets = items.slice(0, count);
  const texts = await Promise.all(targets.map((item) => readArticle(item.url)));
  let enriched = 0;
  targets.forEach((item, i) => {
    if (texts[i]) {
      item.content = texts[i];
      enriched++;
    }
  });
  return { attempted: targets.length, enriched };
}
