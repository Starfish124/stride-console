// Clustering and opportunity scoring. Deterministic and pure, so it is fully
// testable and produces the same architecture from the same keyword set.
//
// The claude-seo methodology clusters by SERP overlap, which is the better
// signal but needs a search API on every pair. This runs headless on a
// schedule with no search key, so it clusters by head-term containment
// instead: "ai consultant" is the pillar, "ai consultant for law firms" is a
// spoke, because the second contains the first. That reproduces the
// hub-and-spoke shape SERP overlap would find for the same family of terms,
// without 780 API calls.

import {
  TARGETABLE_INTENTS,
  type Cluster,
  type Intent,
  type Keyword,
  type Locale,
} from "./types.ts";

const STOPWORDS: Record<Locale, Set<string>> = {
  en: new Set([
    "the", "a", "an", "for", "of", "to", "in", "on", "and", "or", "with",
    "is", "are", "what", "how", "why", "best", "top", "your", "you", "my",
    "can", "do", "does", "vs", "versus", "it", "that", "this",
  ]),
  nl: new Set([
    "de", "het", "een", "voor", "van", "naar", "in", "op", "en", "of", "met",
    "is", "zijn", "wat", "hoe", "waarom", "beste", "je", "jouw", "mijn",
    "kan", "doen", "die", "dat", "dit", "te", "bij", "als",
  ]),
};

export function tokens(term: string, locale: Locale): string[] {
  return term
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !STOPWORDS[locale].has(t));
}

/** Jaccard similarity over significant tokens. */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return shared / (setA.size + setB.size - shared);
}

function isSubsetOf(inner: string[], outer: string[]): boolean {
  const outerSet = new Set(outer);
  return inner.length > 0 && inner.every((t) => outerSet.has(t));
}

export interface ClusterInput {
  id: string;
  term: string;
  locale: Locale;
  intent: Intent;
}

/**
 * Group keywords into hub-and-spoke clusters.
 *
 * Shortest terms are considered first, because the shortest term in a family is
 * the broadest and makes the natural pillar. A longer term joins a cluster when
 * it contains the pillar's tokens, or when it is similar enough to the pillar
 * that splitting them would produce two pages competing for one SERP.
 */
export function clusterKeywords(
  input: ClusterInput[],
  options: { minSimilarity?: number; maxClusterSize?: number } = {},
): { clusters: Cluster[]; assignment: Map<string, string> } {
  const { minSimilarity = 0.5, maxClusterSize = 25 } = options;

  const targetable = input.filter((k) => TARGETABLE_INTENTS.includes(k.intent));

  // Shortest first. Ties broken alphabetically so the output is stable across
  // runs, which matters because a reshuffled cluster id looks like new work.
  const sorted = [...targetable].sort(
    (a, b) => a.term.length - b.term.length || a.term.localeCompare(b.term),
  );

  const clusters: Cluster[] = [];
  const assignment = new Map<string, string>();
  const pillarTokens = new Map<string, string[]>();

  for (const kw of sorted) {
    const kwTokens = tokens(kw.term, kw.locale);
    if (kwTokens.length === 0) continue;

    let joined: Cluster | undefined;

    for (const cluster of clusters) {
      if (cluster.locale !== kw.locale) continue;
      if (cluster.keywordIds.length >= maxClusterSize) continue;

      const pTokens = pillarTokens.get(cluster.id) ?? [];
      const contains = isSubsetOf(pTokens, kwTokens);
      const close = similarity(pTokens, kwTokens) >= minSimilarity;
      if (contains || close) {
        joined = cluster;
        break;
      }
    }

    if (joined) {
      joined.keywordIds.push(kw.id);
      assignment.set(kw.id, joined.id);
      continue;
    }

    // Deterministic id from the pillar term, so the same keyword set always
    // produces the same cluster ids.
    const id = `cl_${kw.locale}_${kw.term.replace(/[^a-z0-9]+/gi, "-").slice(0, 48).toLowerCase()}`;
    const cluster: Cluster = {
      id,
      pillarTerm: kw.term,
      locale: kw.locale,
      intent: kw.intent,
      keywordIds: [kw.id],
      createdAt: new Date().toISOString(),
    };
    pillarTokens.set(id, kwTokens);
    clusters.push(cluster);
    assignment.set(kw.id, id);
  }

  return { clusters, assignment };
}

const INTENT_WEIGHT: Record<Intent, number> = {
  // Somebody searching "AI chatbot laten maken" is closer to a contract than
  // somebody searching "what is an AI agent". Both are worth writing; they are
  // not worth the same.
  transactional: 30,
  commercial: 22,
  informational: 12,
  navigational: 0,
};

export interface ScoreInput {
  term: string;
  intent: Intent;
  locale: Locale;
  stats?: { clicks: number; impressions: number; ctr: number; position: number };
}

export interface ScoredKeyword {
  opportunity: number;
  reasoning: string;
}

/**
 * Opportunity score, 0-100. Higher means work on it sooner.
 *
 * With Search Console connected the dominant term is the striking-distance
 * bonus: a keyword sitting at position 5-20 with real impressions is already
 * close, and moving it up a few places converts impressions that are already
 * being served. That beats writing a new article for a term nobody has ever
 * shown us for.
 *
 * Without Search Console the score falls back to intent and shape, which is
 * weaker but honest: it never pretends to know traffic it has not measured.
 */
export function scoreKeyword(input: ScoreInput): ScoredKeyword {
  const reasons: string[] = [];
  let score = INTENT_WEIGHT[input.intent];
  reasons.push(`${input.intent} intent (+${INTENT_WEIGHT[input.intent]})`);

  const wordCount = input.term.split(/\s+/).length;
  if (wordCount >= 4) {
    score += 12;
    reasons.push("long tail, less contested (+12)");
  } else if (wordCount === 3) {
    score += 6;
    reasons.push("mid tail (+6)");
  }

  // Dutch terms on a .nl domain compete against a far smaller field than the
  // same idea in English.
  if (input.locale === "nl") {
    score += 8;
    reasons.push("Dutch market, thinner competition (+8)");
  }

  const stats = input.stats;
  if (stats && stats.impressions > 0) {
    if (stats.position >= 4 && stats.position <= 20) {
      const bonus = Math.min(35, Math.round(stats.impressions / 10) + 15);
      score += bonus;
      reasons.push(
        `striking distance: position ${stats.position.toFixed(1)} on ${stats.impressions} impressions (+${bonus})`,
      );
    } else if (stats.position > 20) {
      score += 5;
      reasons.push(`ranking but far back at ${stats.position.toFixed(1)} (+5)`);
    } else {
      // Already top 3. Defend it, do not spend a new article on it.
      score -= 10;
      reasons.push(`already at position ${stats.position.toFixed(1)} (-10)`);
    }

    if (stats.impressions > 50 && stats.ctr < 0.02) {
      score += 10;
      reasons.push("seen often, rarely clicked: the title is the problem (+10)");
    }
  } else {
    reasons.push("no Search Console data yet");
  }

  return {
    opportunity: Math.max(0, Math.min(100, score)),
    reasoning: reasons.join("; "),
  };
}

/** Keyword rows ready to store, scored and clustered. */
export function buildKeywordSet(
  discovered: { term: string; intent: Intent; locale: Locale; via: Keyword["discoveredVia"] }[],
  now = new Date(),
): Keyword[] {
  return discovered.map((d) => {
    const { opportunity, reasoning } = scoreKeyword({
      term: d.term,
      intent: d.intent,
      locale: d.locale,
    });
    return {
      id: `kw_${d.locale}_${d.term.replace(/[^a-z0-9]+/gi, "-").slice(0, 60).toLowerCase()}`,
      term: d.term,
      locale: d.locale,
      intent: d.intent,
      discoveredVia: d.via,
      discoveredAt: now.toISOString(),
      opportunity,
      reasoning,
    };
  });
}
