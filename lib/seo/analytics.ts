// What the Search Console numbers MEAN.
//
// searchConsole.ts fetches; this file reads. Everything here is pure and takes
// plain rows, so the interesting judgements — what counts as striking distance,
// which way a position delta points, when a change is worth showing at all —
// are testable without a key, a network or a fixture server.
//
// The rule the whole engine runs on holds here too: nothing is invented to fill
// a gap. A window with no data returns empty lists, and the UI says "not
// measured" rather than printing a zero that looks like a measurement.

import { localeOfPage, type DayRow, type QueryRow, type SearchStats } from "./searchConsole.ts";
import type { Locale } from "./types.ts";
// Re-exported so server callers have one import, but it lives apart: the
// dashboard is a client component and must not pull node:fs in with it.
export { sparkPoints } from "./spark.ts";

/** A measure where up is better, or the one where it is not. */
export type Direction = "up-good" | "down-good";

export interface Delta {
  current: number;
  previous: number;
  /** Absolute change, current minus previous. */
  change: number;
  /** Share of the previous value, or undefined when there was nothing to grow from. */
  ratio?: number;
  /** Whether the change is an improvement, given the measure's direction. */
  better?: boolean;
  /** True when there is no previous window to compare against. */
  unmeasured: boolean;
}

/**
 * Compare one number against the previous period.
 *
 * `unmeasured` exists because "0 → 4 clicks" and "no data → 4 clicks" are
 * different sentences, and only the first is growth. A brand new property
 * reports the second for its first month, and printing "+400%" for it would be
 * the dashboard's first lie.
 */
export function delta(current: number, previous: number, direction: Direction = "up-good"): Delta {
  const unmeasured = previous === 0 && current === 0;
  const change = current - previous;
  const improved = direction === "up-good" ? change > 0 : change < 0;

  return {
    current,
    previous,
    change,
    ratio: previous > 0 ? change / previous : undefined,
    better: change === 0 ? undefined : improved,
    unmeasured,
  };
}

export interface StrikingRow extends QueryRow {
  /** Places to climb to reach the third result, where clicks concentrate. */
  gap: number;
}

/**
 * Queries ranking just off the money — positions 4 to 20.
 *
 * This is the most actionable list in the whole engine. A term at position 11
 * is one page-two entry Google already thinks is relevant; moving it up a few
 * places converts existing impressions into clicks, which is far cheaper than
 * earning a new keyword from nothing.
 *
 * Sorted by impressions, not by position: rank 5 with nine impressions is worth
 * less attention than rank 14 with nine hundred. The floor keeps single-sighting
 * noise out of a list meant to be worked through.
 */
export function strikingDistance(
  queries: QueryRow[],
  options: { minImpressions?: number; limit?: number } = {},
): StrikingRow[] {
  const { minImpressions = 10, limit = 25 } = options;
  return queries
    .filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= minImpressions)
    .map((q) => ({ ...q, gap: Math.max(0, Math.round((q.position - 3) * 10) / 10) }))
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, limit);
}

/**
 * Real queries the keyword store has never heard of.
 *
 * Discovery guesses from autocomplete; this is Google reporting what people
 * actually typed to reach the site. Anything here is proven demand the engine
 * is not yet steering work at, which makes it the highest-value input the
 * organiser can get.
 */
export function untrackedQueries(
  queries: QueryRow[],
  knownTerms: Iterable<string>,
  options: { minImpressions?: number; limit?: number } = {},
): QueryRow[] {
  const { minImpressions = 3, limit = 20 } = options;
  const known = new Set([...knownTerms].map((t) => t.toLowerCase().trim()));
  return queries
    .filter((q) => q.impressions >= minImpressions && !known.has(q.query.toLowerCase().trim()))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

export interface LocaleSplit {
  locale: Locale;
  clicks: number;
  impressions: number;
  ctr: number;
  pages: number;
}

/**
 * Performance per language, from the page dimension.
 *
 * The site sells into a Dutch market in two languages, and the split answers a
 * question the totals hide: whether the Dutch pages are carrying their share.
 * Queries cannot answer it — a query has no locale, a URL does.
 */
export function byLocale(pages: SearchStats["pages"]): LocaleSplit[] {
  const acc = new Map<Locale, { clicks: number; impressions: number; pages: number }>();

  for (const page of pages) {
    const locale = localeOfPage(page.page);
    const row = acc.get(locale) ?? { clicks: 0, impressions: 0, pages: 0 };
    row.clicks += page.clicks;
    row.impressions += page.impressions;
    row.pages += 1;
    acc.set(locale, row);
  }

  return [...acc.entries()]
    .map(([locale, r]) => ({
      locale,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
      pages: r.pages,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

export interface SearchAnalytics {
  available: boolean;
  reason?: string;
  from: string;
  to: string;
  /** True when the property is connected but the window holds no rows yet. */
  awaitingData: boolean;
  totals: SearchStats["totals"];
  deltas: { clicks: Delta; impressions: Delta; ctr: Delta; position: Delta };
  daily: DayRow[];
  striking: StrikingRow[];
  untracked: QueryRow[];
  locales: LocaleSplit[];
  topQueries: QueryRow[];
  topPages: SearchStats["pages"];
}

/**
 * Everything the search tab renders, assembled from two windows and a series.
 *
 * `awaitingData` is the state a newly verified property spends its first days
 * in: connected, authorised, and reporting nothing, because Search Console lags
 * about two days and does not backfill. It is not a failure and must not render
 * as one — but it is also not zero traffic, so it gets its own flag rather than
 * being folded into `available`.
 */
export function buildAnalytics(
  current: SearchStats,
  previous: SearchStats,
  daily: DayRow[],
  knownTerms: Iterable<string>,
): SearchAnalytics {
  return {
    available: current.available,
    reason: current.reason,
    from: current.from,
    to: current.to,
    awaitingData: current.available && current.totals.impressions === 0,
    totals: current.totals,
    deltas: {
      clicks: delta(current.totals.clicks, previous.totals.clicks),
      impressions: delta(current.totals.impressions, previous.totals.impressions),
      ctr: delta(current.totals.ctr, previous.totals.ctr),
      // The one measure where down is the win: position 4 beats position 9.
      position: delta(current.totals.position, previous.totals.position, "down-good"),
    },
    daily,
    striking: strikingDistance(current.queries),
    untracked: untrackedQueries(current.queries, knownTerms),
    locales: byLocale(current.pages),
    topQueries: [...current.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    topPages: [...current.pages].sort((a, b) => b.impressions - a.impressions).slice(0, 12),
  };
}
