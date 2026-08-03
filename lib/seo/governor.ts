// The governor: how fast the engine is allowed to publish.
//
// Everything else here decides WHAT to write. This decides HOW MUCH, and it
// decides it from results rather than from ambition. Articles that earn
// impressions buy the machine a faster pace; articles that do not take it away.
//
// Three properties matter more than the exact numbers:
//
//   1. It reads outcomes, never its own opinions. The input is Search Console
//      impressions against published pages. An opportunity score cannot vote on
//      how fast to publish, or the engine grades its own homework.
//
//   2. It is ASYMMETRIC. Raising takes a good window and a cooldown; cutting
//      happens on the spot. Publishing too little costs some traffic. Publishing
//      too much of what nobody reads costs the domain — scaled content abuse is
//      a site-wide penalty, and it would take the six pages that convert down
//      with the blog. The two mistakes are not the same size, so they do not get
//      the same caution.
//
//   3. It refuses to decide without history. Fewer than a handful of matured
//      articles, or no Search Console data, means hold and say why. A governor
//      that guesses is just an ambition with a log file.

import type { Locale, SeoArticle } from "./types.ts";

/** A page row as Search Console reports it. */
export interface PageStat {
  page: string;
  impressions: number;
}

export interface GovernorDecision {
  at: string;
  from: number;
  to: number;
  changed: boolean;
  /** Plain sentence, shown in the console and written to the log. */
  reason: string;
  /** What the decision was made from, so a surprising change can be audited. */
  evidence: {
    matured: number;
    earning: number;
    hitRate?: number;
    windowDays: number;
  };
}

export interface GovernorPolicy {
  /** Days before an article is judged. Google needs weeks, not days. */
  maturityDays: number;
  /** Impressions that count as an article having earned its place. */
  impressionFloor: number;
  /** Share of matured articles that must be earning to speed up. */
  raiseAbove: number;
  /** Share below which the pace is cut. */
  cutBelow: number;
  /** Never publish more than this a day, whatever the numbers say. */
  ceiling: number;
  /** Never publish fewer than this. */
  floor: number;
  /** Days between raises, so one good fortnight cannot ramp to the ceiling. */
  raiseCooldownDays: number;
  /** Matured articles needed before the governor will decide at all. */
  minHistory: number;
}

export const DEFAULT_POLICY: GovernorPolicy = {
  maturityDays: 21,
  impressionFloor: 10,
  raiseAbove: 0.6,
  cutBelow: 0.25,
  // A human sets the ceiling. The governor may grow into it and never past it,
  // because "it was working, so it kept going" is how a blog becomes a content
  // farm without anybody choosing that.
  ceiling: 5,
  // One a day is a heartbeat, not a quota: the demand gate independently refuses
  // to write when there is nothing worth writing, so the floor sets pace rather
  // than permission. Set it to 0 to let a bad run stop publishing entirely.
  floor: 1,
  raiseCooldownDays: 14,
  minHistory: 4,
};

/** The site path an article lives at, for matching against Search Console pages. */
export function pathForArticle(slug: string, locale: Locale): string {
  return locale === "nl" ? `/nl/blog/${slug}` : `/blog/${slug}`;
}

/**
 * Articles old enough to be judged.
 *
 * Judging a three-day-old article is judging Google's crawl schedule, not the
 * writing. Anything younger is excluded rather than counted as a failure, which
 * is the difference between a governor and a stopwatch.
 */
export function maturedArticles(
  articles: SeoArticle[],
  now: Date,
  maturityDays: number,
): SeoArticle[] {
  const cutoff = now.getTime() - maturityDays * 24 * 60 * 60 * 1000;
  return articles.filter(
    (a) => a.status === "published" && a.publishedAt && Date.parse(a.publishedAt) <= cutoff,
  );
}

/** How many of those articles Google is actually showing to people. */
export function earningCount(
  articles: SeoArticle[],
  pages: PageStat[],
  impressionFloor: number,
): number {
  // Impressions per path, since Search Console reports full URLs and an article
  // is identified here by slug and locale.
  const byPath = new Map<string, number>();
  for (const row of pages) {
    let pathname = row.page;
    try {
      pathname = new URL(row.page).pathname;
    } catch {
      // Already a path, or something unparseable. Either way, compare as given.
    }
    byPath.set(pathname.replace(/\/$/, ""), (byPath.get(pathname.replace(/\/$/, "")) ?? 0) + row.impressions);
  }

  return articles.filter(
    (a) => (byPath.get(pathForArticle(a.slug, a.locale)) ?? 0) >= impressionFloor,
  ).length;
}

/**
 * Decide the daily article cap.
 *
 * Pure, so the policy can be argued about and tested without waiting a month
 * for real data to arrive.
 */
export function decideCap(input: {
  current: number;
  articles: SeoArticle[];
  pages: PageStat[];
  statsAvailable: boolean;
  lastRaisedAt?: string;
  now?: Date;
  policy?: Partial<GovernorPolicy>;
}): GovernorDecision {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const now = input.now ?? new Date();
  const at = now.toISOString();

  const hold = (reason: string, evidence: GovernorDecision["evidence"]): GovernorDecision => ({
    at,
    from: input.current,
    to: input.current,
    changed: false,
    reason,
    evidence,
  });

  if (!input.statsAvailable) {
    return hold("Search Console has no data yet, so there is nothing to judge the pace on.", {
      matured: 0,
      earning: 0,
      windowDays: policy.maturityDays,
    });
  }

  const matured = maturedArticles(input.articles, now, policy.maturityDays);
  if (matured.length < policy.minHistory) {
    return hold(
      `Only ${matured.length} article${matured.length === 1 ? "" : "s"} ${
        matured.length === 1 ? "is" : "are"
      } older than ${policy.maturityDays} days. The pace stays at ${input.current} a day until there are ${policy.minHistory}.`,
      { matured: matured.length, earning: 0, windowDays: policy.maturityDays },
    );
  }

  const earning = earningCount(matured, input.pages, policy.impressionFloor);
  const hitRate = earning / matured.length;
  const evidence = { matured: matured.length, earning, hitRate, windowDays: policy.maturityDays };
  const share = `${earning} of ${matured.length}`;

  // Cutting first, and without a cooldown. When the work is not landing, the
  // next thing to do is less of it, immediately.
  if (hitRate < policy.cutBelow) {
    const to = Math.max(policy.floor, input.current - 1);
    if (to === input.current) {
      return hold(
        `Only ${share} articles are earning impressions, but the pace is already at the floor of ${policy.floor}. Worth reading the queue rather than writing more.`,
        evidence,
      );
    }
    return {
      at,
      from: input.current,
      to,
      changed: true,
      reason: `Only ${share} articles older than ${policy.maturityDays} days are earning impressions, so the pace drops to ${to} a day.`,
      evidence,
    };
  }

  if (hitRate > policy.raiseAbove) {
    if (input.current >= policy.ceiling) {
      return hold(
        `${share} articles are earning impressions, and the pace is already at the ceiling of ${policy.ceiling} a day. Raising it further is a decision for a person.`,
        evidence,
      );
    }
    const daysSinceRaise = input.lastRaisedAt
      ? (now.getTime() - Date.parse(input.lastRaisedAt)) / (24 * 60 * 60 * 1000)
      : Infinity;
    if (daysSinceRaise < policy.raiseCooldownDays) {
      return hold(
        `${share} articles are earning impressions, but the pace was raised ${Math.floor(
          daysSinceRaise,
        )} days ago. It waits ${policy.raiseCooldownDays} between raises so one good fortnight cannot ramp it to the ceiling.`,
        evidence,
      );
    }
    return {
      at,
      from: input.current,
      to: input.current + 1,
      changed: true,
      reason: `${share} articles older than ${policy.maturityDays} days are earning impressions, so the pace rises to ${
        input.current + 1
      } a day.`,
      evidence,
    };
  }

  return hold(
    `${share} articles are earning impressions, which is neither good enough to speed up nor bad enough to slow down. The pace stays at ${input.current} a day.`,
    evidence,
  );
}
