// Keyword discovery. Google's autocomplete endpoint is the source: it is free,
// needs no key, and returns what people actually type rather than what a
// keyword tool imagines they type.
//
// Two passes, following the claude-seo expansion method:
//   1. modifier soup  - seed plus intent modifiers ("best X", "X kosten")
//   2. alphabet soup  - seed plus each letter, which surfaces the long tail
//                       Google has seen but nobody would guess
//
// A source that fails is reported and skipped. It never throws the sweep.

import type { Intent, Locale } from "./types.ts";

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";

/** Intent modifiers per locale. Prefix modifiers go in front, suffix behind. */
const MODIFIERS: Record<Locale, { prefix: string[]; suffix: string[] }> = {
  en: {
    prefix: ["what is", "how to", "why", "best", "top"],
    suffix: [
      "for business",
      "examples",
      "cost",
      "pricing",
      "vs",
      "guide",
      "checklist",
      "for small business",
      "alternatives",
      "tools",
    ],
  },
  nl: {
    prefix: ["wat is", "hoe werkt", "waarom", "beste"],
    suffix: [
      "voor bedrijven",
      "voorbeelden",
      "kosten",
      "prijs",
      "uitbesteden",
      "laten maken",
      "voor mkb",
      "checklist",
      "vergelijking",
    ],
  },
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

/**
 * Terms that look on-topic but bring the wrong audience.
 *
 * Autocomplete around "AI consultant" is dominated by people who want to
 * become one: salary, job description, how to become, certification. Ranking
 * for those earns traffic that will never buy anything, and worse, it teaches
 * Google the site is a careers resource. This list is why the engine does not
 * quietly drift into writing a jobs blog.
 *
 * Note what is deliberately absent: hourly rate, cost, pricing, kosten,
 * tarief. A buyer sizing a budget searches those, so they stay.
 */
const OFF_AUDIENCE = new RegExp(
  [
    "\\bsalar(y|ies)\\b", "\\bsalaris\\b",
    "\\bjobs?\\b", "\\bvacatures?\\b", "\\bvacanc(y|ies)\\b",
    "\\bcareers?\\b", "\\bcarri[eè]re\\b",
    "how to become", "hoe word je",
    "\\bcourses?\\b", "\\bcursus(sen)?\\b", "\\btrainings?\\b", "\\bopleiding(en)?\\b",
    "\\bcertification\\b", "\\bcertificaat\\b", "\\bcertified\\b",
    "\\bdegree\\b", "\\bbootcamp\\b",
    "\\binternships?\\b", "\\bstage\\b",
    "\\bresume\\b", "\\bcv\\b",
    "interview questions", "sollicitatie",
    "\\bhiring\\b", "\\brecruit",
    // Advice aimed at practitioners rather than buyers. "how to be a good
    // business consultant" is a reader who does our job, not one who hires us.
    "how to be an? ", "how to start an? .*(agency|consultanc)",
    "hoe begin je", "zelf .*(bouwen|maken) zonder",
  ].join("|"),
  "i",
);

/**
 * Markets we do not sell into. A Dutch consultancy ranking for "ai consulting
 * companies in india" collects impressions it can never convert, and the
 * clicks it does get bounce, which is a quality signal working against us.
 *
 * Dutch and Belgian geography is absent on purpose: those terms are the ones
 * most worth winning.
 */
const OFF_MARKET = new RegExp(
  [
    "\\bindia\\b", "\\bpakistan\\b", "\\bnigeria\\b", "\\bphilippines\\b",
    "\\bbangladesh\\b", "\\bindonesia\\b", "\\bkenya\\b",
    "\\busa\\b", "\\bunited states\\b", "\\bcanada\\b", "\\baustralia\\b",
    "\\bsingapore\\b", "\\bdubai\\b", "\\buae\\b", "\\bsaudi\\b",
    "\\bchina\\b", "\\bjapan\\b", "\\bbrazil\\b",
    "\\bnyc\\b", "\\bnew york\\b", "\\blondon\\b", "\\btoronto\\b", "\\bsydney\\b",
  ].join("|"),
  "i",
);

/**
 * Vocabulary the business actually sells into. A suggestion that shares none
 * of it has drifted off the seed and is not ours to write about.
 */
const ON_TOPIC = new RegExp(
  [
    "\\bai\\b", "artificial intelligence", "\\bllm\\b", "\\bgpt\\b",
    "chatbots?", "agents?", "automat", "workflow", "consultan", "agenc",
    "bureau", "integrat", "software", "\\bmvp\\b", "\\bdata\\b",
    "machine learning", "\\brpa\\b", "digitaliser", "\\bapi\\b",
  ].join("|"),
  "i",
);

/**
 * Whether a discovered term is worth tracking at all. Both gates must pass:
 * it has to be about what we do, and it has to be aimed at somebody who might
 * buy it.
 */
export function isTargetableTerm(term: string): boolean {
  if (OFF_AUDIENCE.test(term)) return false;
  if (OFF_MARKET.test(term)) return false;
  return ON_TOPIC.test(term);
}

const GEO: Record<Locale, { hl: string; gl: string }> = {
  en: { hl: "en", gl: "nl" },
  nl: { hl: "nl", gl: "nl" },
};

/**
 * Normalise a phrase so "The Best AI Agency " and "best ai agency" are one
 * keyword rather than two. Leading articles go because Google treats them as
 * noise and keeping them splits the store.
 */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an|de|het|een)\s+/, "");
}

/** Intent classification from surface signals, per the claude-seo table. */
export function classifyIntent(term: string): Intent {
  const t = ` ${term.toLowerCase()} `;

  // Navigational first: a brand search is not an opportunity, it is a visit.
  if (/\b(stride ?ai|stride-ai|login|inloggen|sign in|contact opnemen)\b/.test(t)) {
    return "navigational";
  }
  if (
    /\b(buy|hire|inhuren|uitbesteden|laten maken|price|pricing|prijs|kosten|quote|offerte|cost|book|boeken)\b/.test(
      t,
    )
  ) {
    return "transactional";
  }
  if (
    /\b(best|beste|top|review|reviews|vs|versus|vergelijking|comparison|alternative|alternatieven|tools|software|agency|bureau|consultant)\b/.test(
      t,
    )
  ) {
    return "commercial";
  }
  return "informational";
}

async function suggest(query: string, locale: Locale, signal?: AbortSignal): Promise<string[]> {
  const geo = GEO[locale];
  const url = `${SUGGEST_URL}?client=firefox&hl=${geo.hl}&gl=${geo.gl}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal,
    headers: {
      // Without a browser-ish agent the endpoint sometimes answers with an
      // empty list rather than an error, which looks like "no demand".
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`suggest ${res.status}`);
  const body = (await res.json()) as [string, string[]];
  return Array.isArray(body?.[1]) ? body[1] : [];
}

export interface ExpansionReport {
  locale: Locale;
  queriesRun: number;
  queriesFailed: number;
  terms: { term: string; intent: Intent; via: "autocomplete" }[];
}

function buildQueries(seeds: string[], locale: Locale, deep: boolean): string[] {
  const mods = MODIFIERS[locale];
  const queries = new Set<string>();

  for (const seed of seeds) {
    queries.add(seed);
    for (const p of mods.prefix) queries.add(`${p} ${seed}`);
    for (const s of mods.suffix) queries.add(`${seed} ${s}`);
    if (deep) {
      for (const letter of LETTERS) queries.add(`${seed} ${letter}`);
    }
  }
  return [...queries];
}

/**
 * Run the expansion for one locale. `deep` adds the alphabet pass, which is
 * roughly 26 extra requests per seed; the daily sweep runs it, a manual
 * refresh does not need to.
 */
export async function expandKeywords(
  seeds: string[],
  locale: Locale,
  options: { deep?: boolean; delayMs?: number; timeoutMs?: number } = {},
): Promise<ExpansionReport> {
  const { deep = true, delayMs = 120, timeoutMs = 10_000 } = options;
  const queries = buildQueries(seeds, locale, deep);

  const found = new Map<string, Intent>();
  let queriesFailed = 0;

  for (const query of queries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const results = await suggest(query, locale, controller.signal);
      for (const raw of results) {
        const term = normalizeTerm(raw);
        // Single words are too broad to target and 90-character phrases are
        // usually a sentence somebody typed by accident.
        if (term.length < 8 || term.length > 90) continue;
        if (!term.includes(" ")) continue;
        if (!isTargetableTerm(term)) continue;
        found.set(term, classifyIntent(term));
      }
    } catch {
      queriesFailed++;
    } finally {
      clearTimeout(timer);
    }
    // Politeness. The endpoint is undocumented and rate limits if hammered.
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    locale,
    queriesRun: queries.length,
    queriesFailed,
    terms: [...found.entries()].map(([term, intent]) => ({
      term,
      intent,
      via: "autocomplete" as const,
    })),
  };
}
