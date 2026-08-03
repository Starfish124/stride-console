// The keyword organiser. Decides which page owns which keyword, catches two
// pages competing for one term, and turns clusters nobody serves into article
// briefs.
//
// This is the part that makes the site "live by itself": every keyword either
// has a page responsible for it, or has a brief queued to create one.

import { tokens } from "./cluster.ts";
import {
  type ArticleBrief,
  type ArticleTemplate,
  type Cluster,
  type Intent,
  type Keyword,
  type Locale,
} from "./types.ts";

/** A route the site already serves, as read from content/seo/pages.json. */
export interface SiteRoute {
  route: string;
  locale: Locale;
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  /** Marketing pages outrank articles when both could serve a keyword. */
  kind: "page" | "article";
}

export interface Assignment {
  keywordId: string;
  route: string;
  primary: boolean;
  confidence: number;
}

export interface CannibalWarning {
  term: string;
  locale: Locale;
  routes: string[];
}

/**
 * How much of the keyword's meaning a page already covers.
 *
 * Deliberately asymmetric. Jaccard would punish a page for having a rich
 * vocabulary: /services mentions chatbots, agents, automation and MVPs, so a
 * symmetric score against "custom ai agents for business" comes out low purely
 * because the page talks about more things than the query does. The question
 * that matters is the other direction, whether this page covers what the
 * searcher asked for.
 */
export function containment(keywordTokens: string[], routeTokens: string[]): number {
  if (keywordTokens.length === 0) return 0;
  const routeSet = new Set(routeTokens);
  let shared = 0;
  for (const t of new Set(keywordTokens)) if (routeSet.has(t)) shared++;
  return shared / new Set(keywordTokens).size;
}

/**
 * Match keywords to the pages that should rank for them.
 *
 * A keyword goes to the route that covers most of it, provided the coverage
 * clears a floor. Below the floor the keyword is left unassigned, which is the
 * signal the organiser uses to decide new content is needed. Guessing a home
 * for every keyword would hide exactly the gaps this is meant to find.
 */
export function assignKeywords(
  keywords: Keyword[],
  routes: SiteRoute[],
  options: { floor?: number } = {},
): { assignments: Assignment[]; unassigned: Keyword[] } {
  const { floor = 0.6 } = options;
  const assignments: Assignment[] = [];
  const unassigned: Keyword[] = [];

  // Track the best keyword per route so exactly one is marked primary.
  const bestPerRoute = new Map<string, { keywordId: string; score: number }>();

  for (const kw of keywords) {
    if (kw.intent === "navigational") continue;

    const kwTokens = tokens(kw.term, kw.locale);
    let best: { route: SiteRoute; score: number } | undefined;

    for (const route of routes) {
      if (route.locale !== kw.locale) continue;

      const routeText = [route.primaryKeyword, route.title, ...route.secondaryKeywords].join(" ");
      let score = containment(kwTokens, tokens(routeText, kw.locale));

      // An exact primary-keyword match is a decision already made elsewhere.
      if (route.primaryKeyword.toLowerCase() === kw.term) score = 1;
      // A marketing page converts better than an article for buying intent.
      if (route.kind === "page" && kw.intent === "transactional") score += 0.08;

      if (!best || score > best.score) best = { route, score };
    }

    if (!best || best.score < floor) {
      unassigned.push(kw);
      continue;
    }

    assignments.push({
      keywordId: kw.id,
      route: best.route.route,
      primary: false,
      confidence: Number(best.score.toFixed(3)),
    });

    const incumbent = bestPerRoute.get(best.route.route);
    if (!incumbent || best.score > incumbent.score) {
      bestPerRoute.set(best.route.route, { keywordId: kw.id, score: best.score });
    }
  }

  for (const a of assignments) {
    a.primary = bestPerRoute.get(a.route)?.keywordId === a.keywordId;
  }

  return { assignments, unassigned };
}

/**
 * Two routes targeting the same term split their own ranking signal between
 * them and usually leave both on page two. The claude-seo cannibalisation rule
 * is the same: no two pages may share a primary keyword.
 */
export function findCannibalisation(routes: SiteRoute[]): CannibalWarning[] {
  const byTerm = new Map<string, SiteRoute[]>();
  for (const route of routes) {
    const key = `${route.locale}:${route.primaryKeyword.toLowerCase().trim()}`;
    byTerm.set(key, [...(byTerm.get(key) ?? []), route]);
  }
  return [...byTerm.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      term: key.split(":").slice(1).join(":"),
      locale: list[0].locale,
      routes: list.map((r) => r.route),
    }));
}

const TEMPLATE_BY_INTENT: Record<Intent, ArticleTemplate> = {
  informational: "explainer",
  commercial: "comparison",
  transactional: "landing-page",
  navigational: "explainer",
};

function pickTemplate(term: string, intent: Intent): ArticleTemplate {
  const t = term.toLowerCase();
  if (/^(how to|hoe )/.test(t)) return "how-to";
  if (/^(what is|wat is)/.test(t)) return "explainer";
  if (/\b(best|beste|top)\b/.test(t)) return "best-of";
  if (/\b(vs|versus|vergelijking|comparison)\b/.test(t)) return "comparison";
  if (/\b(examples|voorbeelden|checklist|tools)\b/.test(t)) return "listicle";
  return TEMPLATE_BY_INTENT[intent];
}

export function slugify(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/**
 * Turn unserved clusters into article briefs, highest opportunity first.
 *
 * Word count targets follow the claude-seo spec: a pillar earns 2,500 words
 * because it has to cover the whole subtopic, a spoke earns 1,200 because it
 * answers one question and links home.
 */
export function buildBriefs(
  clusters: Cluster[],
  keywords: Keyword[],
  assignments: Assignment[],
  existingRoutes: SiteRoute[],
  options: { limit?: number; now?: Date; publishedSlugs?: Set<string> } = {},
): ArticleBrief[] {
  const { limit = 10, now = new Date(), publishedSlugs = new Set<string>() } = options;

  const byId = new Map(keywords.map((k) => [k.id, k]));
  const assignedIds = new Set(assignments.map((a) => a.keywordId));
  const usedSlugs = new Set(existingRoutes.map((r) => slugify(r.route.replace(/^\//, ""))));

  const briefs: ArticleBrief[] = [];

  for (const cluster of clusters) {
    const members = cluster.keywordIds
      .map((id) => byId.get(id))
      .filter((k): k is Keyword => Boolean(k));
    if (members.length === 0) continue;

    // A cluster where most terms already have a home is being served. Only
    // clusters that are genuinely uncovered become new articles.
    const covered = members.filter((k) => assignedIds.has(k.id)).length;
    if (covered / members.length > 0.5) continue;

    const ranked = [...members].sort((a, b) => b.opportunity - a.opportunity);
    const primary = ranked[0];
    const secondary = ranked.slice(1, 7).map((k) => k.term);

    const slug = slugify(primary.term);
    if (usedSlugs.has(slug)) continue;
    // Already an article on the site. usedSlugs only knows the routes in
    // pages.json, and a published article is a file on disk before it is a
    // route here, so without this the queue keeps proposing a rewrite of work
    // that is already live — at a twelve-minute writer run each.
    if (publishedSlugs.has(`${slug}:${cluster.locale}`)) continue;
    usedSlugs.add(slug);

    // A cluster with a real spread of terms deserves the pillar treatment;
    // one or two terms is a single question and gets a spoke.
    const role: "pillar" | "spoke" = members.length >= 5 ? "pillar" : "spoke";

    // Every article links to the service page and, for spokes, to the pillar
    // of its own cluster. No orphan pages is the rule from the link matrix.
    const internalLinks: { href: string; anchor: string }[] = [
      { href: "/services", anchor: cluster.locale === "nl" ? "onze AI diensten" : "our AI services" },
    ];
    if (cluster.pillarRoute && role === "spoke") {
      internalLinks.push({ href: cluster.pillarRoute, anchor: cluster.pillarTerm });
    }

    briefs.push({
      id: `br_${cluster.id}`,
      clusterId: cluster.id,
      locale: cluster.locale,
      primaryKeyword: primary.term,
      secondaryKeywords: secondary,
      intent: cluster.intent,
      template: pickTemplate(primary.term, cluster.intent),
      role,
      wordCountTarget: role === "pillar" ? 2500 : 1200,
      internalLinks,
      suggestedSlug: slug,
      // Cluster opportunity is the best term in it, nudged by how many terms
      // one article would serve at once.
      opportunity: Math.min(
        100,
        Math.round(primary.opportunity + Math.min(15, members.length * 1.5)),
      ),
      createdAt: now.toISOString(),
    });
  }

  return briefs.sort((a, b) => b.opportunity - a.opportunity).slice(0, limit);
}
