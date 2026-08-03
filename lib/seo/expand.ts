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
    // The article is OPTIONAL. "how to start ai agency" is autocomplete's own
    // phrasing and walked straight past a pattern that demanded "a" or "an" —
    // and it is the practitioner audience this whole list exists to keep out.
    "how to be (an? )?", "how to start (an? )?.*(agency|consultanc)",
    "how to (build|run|grow) (an? )?(ai )?(agency|consultanc)",
    "hoe begin je", "zelf .*(bouwen|maken) zonder",
    // Dutch puts the verb last, so "how to become an AI consultant" surfaces
    // as "ai consultant worden". The English patterns above never matched it,
    // and it reached a real brief for a 2,500-word pillar aimed at people who
    // want our job. "gezocht" is the same problem in recruitment phrasing.
    "\\bworden\\b", "\\bgezocht\\b", "\\bopleiding(en)?\\b", "\\bstudie\\b",
  ].join("|"),
  "i",
);

/**
 * Markets we do not sell into. A Dutch consultancy ranking for "ai consulting
 * companies in india" collects impressions it can never convert, and the
 * clicks it does get bounce, which is a quality signal working against us.
 *
 * European geography is absent on purpose. Ranking first in the Netherlands is
 * the goal, and English across Europe is the growth: the work is delivered
 * remotely, so Berlin, Paris, Brussels and London are all reachable buyers.
 * What stays blocked is everything that cannot buy from a Dutch consultancy —
 * North America, Asia-Pacific, the Gulf. That is a market decision, not a
 * language one, which is why "london" left this list and "new york" did not.
 */
const OFF_MARKET = new RegExp(
  [
    "\\bindia\\b", "\\bpakistan\\b", "\\bnigeria\\b", "\\bphilippines\\b",
    "\\bbangladesh\\b", "\\bindonesia\\b", "\\bkenya\\b",
    "\\busa\\b", "\\bunited states\\b", "\\bcanada\\b", "\\baustralia\\b",
    "\\bsingapore\\b", "\\bdubai\\b", "\\buae\\b", "\\bsaudi\\b",
    "\\bchina\\b", "\\bjapan\\b", "\\bbrazil\\b",
    "\\bnyc\\b", "\\bnew york\\b", "\\btoronto\\b", "\\bsydney\\b",
    "\\bboston\\b", "\\bchicago\\b", "\\blos angeles\\b", "\\bsan francisco\\b",
    "\\btexas\\b", "\\bflorida\\b", "\\bcalifornia\\b",
  ].join("|"),
  "i",
);

/**
 * Other people's names. These pass the on-topic gate by accident and then
 * become real articles: "bureau" is in ON_TOPIC for the Dutch "AI-bureau", so
 * the US Census Bureau and Bureau Veritas walked straight through it, and
 * "ai agent pricing ghl" is a 2,400-word article about GoHighLevel's price
 * list on a Dutch consultancy's blog. Both were published before this existed.
 *
 * Two shapes only, kept narrow on purpose:
 *   - organisations that merely contain an on-topic word
 *   - products we do not sell, where the searcher wants that vendor's page
 *
 * Tools we build WITH — n8n, Make, Zapier, OpenAI — are deliberately absent,
 * and that is the one live disagreement with the list Jort's session proposed.
 * "ai agent tools n8n" is a buyer asking how to do the thing we do; we have
 * something true to say about it and a reason to be on that page. "uipath
 * pricing" is someone who wants UiPath's own page. The rule is not "is it a
 * brand" but "does the searcher want that vendor, or the work" — flip any of
 * the stack names into this list if we stop implementing them.
 *
 * Generic words stay out regardless: "make" and "flow" would take "make an ai
 * chatbot" with them.
 *
 * This list catches names, never topics; a keyword that is off-brief for a
 * subtler reason is still a human's call on /seo.
 */
const OFF_BRAND = new RegExp(
  [
    "census bureau", "\\bveritas\\b", "bureau of ",
    "\\bghl\\b", "gohighlevel", "go high level",
    "\\bclickfunnels\\b", "\\bhubspot\\b", "\\bsalesforce\\b",
    "\\bairtable\\b", "monday\\.com", "\\bdatadog\\b",
    // Enterprise RPA. Somebody comparing UiPath licence tiers wants UiPath's
    // page, and will not read a Dutch consultancy's take on it.
    "\\buipath\\b", "automation anywhere", "blue prism", "\\bservicenow\\b",
    "\\bpowerapps\\b", "power automate", "\\bmulesoft\\b",
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
/**
 * Whether a term is aimed at a place rather than a problem.
 *
 * A page per city, all saying the same thing with the place name swapped, is
 * the doorway pattern Google penalises site-wide — and a site-wide action on
 * stride-ai.nl takes the six pages that actually convert down with the blog. So
 * a geo-targeted article is written but never publishes itself: it waits on
 * /seo for a person, who can tell "AI agency Berlin, because we work with three
 * German clients" apart from the same article with a different city in it.
 */
export function isGeoTargeted(term: string): boolean {
  const t = term.toLowerCase();
  return [...EU_GEO.en, ...EU_GEO.nl].some((g) => new RegExp(`\\b${g}\\b`, "i").test(t));
}

export function isTargetableTerm(term: string): boolean {
  if (OFF_AUDIENCE.test(term)) return false;
  if (OFF_MARKET.test(term)) return false;
  if (OFF_BRAND.test(term)) return false;
  return ON_TOPIC.test(term);
}

/**
 * Where to look. One market per locale, and that is a MEASURED decision.
 *
 * The obvious way to go European is a market per country — `gl=de`, `gl=fr`,
 * `gl=be` — on the theory that autocomplete answers per country. It does not,
 * or not on this endpoint: asked the same English seed, `gl=de` and `gl=fr`
 * each returned exactly ONE term that `gl=nl` had not, and it was the same
 * term in both. Four extra markets would have tripled the nightly sweep for
 * one keyword. Changing `hl` does change the answers, but to the language of
 * the interface, and we publish in two languages, not five.
 *
 * European demand comes from the SEEDS instead — see EU_GEO below. That was
 * measured too: "ai automation agency germany" returns 7 terms including "ai
 * companies in germany", and "ai agency berlin" returns 10. Geography in the
 * query is what surfaces geography in the results.
 */
export interface Market {
  id: string;
  /** Interface language Google answers in. */
  hl: string;
  /** Country whose searches it answers with. */
  gl: string;
  /** Which of the site's two locales a term found here belongs to. */
  locale: Locale;
  /** Run the alphabet pass here. */
  deep: boolean;
}

export const DISCOVERY_MARKETS: Market[] = [
  { id: "nl-NL", hl: "nl", gl: "nl", locale: "nl", deep: true },
  { id: "en-NL", hl: "en", gl: "nl", locale: "en", deep: true },
];

/**
 * European geography to append to every seed. This is the EU-wide reach: the
 * work is delivered remotely, so a buyer in Berlin or Brussels is as reachable
 * as one in Utrecht, and these queries are how the engine finds out what they
 * type.
 *
 * Belgium, Germany and France, in the two languages the site actually
 * publishes in. No German or French *content* is implied — that would need new
 * routes and hreflang in the website repo, which is a separate decision.
 *
 * Kept to countries and their biggest business cities. A long list of towns
 * would be the doorway-page pattern Google penalises: many near-identical
 * pages varying only by place name. These terms exist to reveal demand, and a
 * page still only gets written when a cluster earns one.
 */
const EU_GEO: Record<Locale, string[]> = {
  en: [
    "germany", "berlin", "munich", "frankfurt",
    "belgium", "brussels", "antwerp",
    "france", "paris",
  ],
  nl: [
    "duitsland", "belgië", "brussel", "antwerpen", "vlaanderen", "frankrijk",
  ],
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

async function suggest(query: string, market: Market, signal?: AbortSignal): Promise<string[]> {
  const url = `${SUGGEST_URL}?client=firefox&hl=${market.hl}&gl=${market.gl}&q=${encodeURIComponent(query)}`;
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
  market: string;
  queriesRun: number;
  queriesFailed: number;
  terms: { term: string; intent: Intent; via: "autocomplete" }[];
}

export function buildQueries(
  seeds: string[],
  locale: Locale,
  deep: boolean,
  options: { geo?: boolean } = {},
): string[] {
  const mods = MODIFIERS[locale];
  const queries = new Set<string>();

  for (const seed of seeds) {
    queries.add(seed);
    for (const p of mods.prefix) queries.add(`${p} ${seed}`);
    for (const s of mods.suffix) queries.add(`${seed} ${s}`);
    // The European pass. Same query shape as an intent modifier, so it costs
    // one request per seed per place and no new code path.
    if (options.geo !== false) {
      for (const g of EU_GEO[locale]) queries.add(`${seed} ${g}`);
    }
    if (deep) {
      for (const letter of LETTERS) queries.add(`${seed} ${letter}`);
    }
  }
  return [...queries];
}

/**
 * Run the expansion in one market. `deep` adds the alphabet pass, which is
 * roughly 26 extra requests per seed; the daily sweep runs it, a manual refresh
 * does not need to. `geo` adds the European pass and is on by default.
 */
export async function expandKeywords(
  seeds: string[],
  market: Market,
  options: { deep?: boolean; geo?: boolean; delayMs?: number; timeoutMs?: number } = {},
): Promise<ExpansionReport> {
  const { deep = market.deep, geo = true, delayMs = 120, timeoutMs = 10_000 } = options;
  const queries = buildQueries(seeds, market.locale, deep, { geo });

  const found = new Map<string, Intent>();
  let queriesFailed = 0;

  for (const query of queries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const results = await suggest(query, market, controller.signal);
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
    locale: market.locale,
    market: market.id,
    queriesRun: queries.length,
    queriesFailed,
    terms: [...found.entries()].map(([term, intent]) => ({
      term,
      intent,
      via: "autocomplete" as const,
    })),
  };
}
