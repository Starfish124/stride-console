// The two agent runs.
//
//   dailySweep()     - discover keywords, pull Search Console numbers, audit
//                      every live page, fix what is fixable, queue the gaps.
//   weeklyArticles() - write drafts for the highest-opportunity gaps and put
//                      them in front of a human.
//
// Neither throws. Both return a report the dashboard renders. A sweep that
// half-failed is far more useful than a sweep that raised, because the half
// that worked still improved the site and the half that did not is named.

import {
  addBriefs,
  appendSweep,
  getConfig,
  listBriefs,
  listKeywords,
  mergeKeywords,
  newId,
  saveArticle,
  saveAudits,
  saveBriefs,
  saveClusters,
  saveKeywords,
  usedSlugs,
} from "./store.ts";
import { expandKeywords } from "./expand.ts";
import { buildKeywordSet, clusterKeywords, scoreKeyword } from "./cluster.ts";
import { assignKeywords, buildBriefs, findCannibalisation } from "./organiser.ts";
import { auditUrl } from "./audit.ts";
import {
  applyChanges,
  candidatesFrom,
  proposeChange,
  readPagesFile,
  toSiteRoutes,
} from "./optimise.ts";
import { fetchStats, statsByTerm } from "./searchConsole.ts";
import { currentBranch, publish, publishArticle, type ArticleOutcome } from "./publish.ts";
import { writeArticle } from "./article.ts";
import type { ArticleBrief, Locale, MetaChange, PageAudit, SweepResult } from "./types.ts";

export interface SweepOptions {
  /** Skip the alphabet pass. Faster, shallower; used by the manual refresh. */
  shallow?: boolean;
  /** Audit against this origin instead of the configured base URL. */
  originOverride?: string;
  /** Propose metadata changes but do not write them. */
  dryRun?: boolean;
  now?: Date;
}

export async function dailySweep(options: SweepOptions = {}): Promise<SweepResult> {
  const { shallow = false, dryRun = false, now = new Date() } = options;
  const startedAt = now.toISOString();
  const config = getConfig();
  const origin = options.originOverride ?? config.baseUrl;

  const failures: string[] = [];
  let keywordsDiscovered = 0;
  let statsSource: SweepResult["statsSource"] = "none";
  const audits: PageAudit[] = [];
  let changesProposed: MetaChange[] = [];
  let changesApplied = 0;
  let published: SweepResult["published"];
  let briefsCreated = 0;
  let clustersTotal = 0;

  // ---- 1. read the site's own map of itself ----

  let routes: ReturnType<typeof toSiteRoutes> = [];
  try {
    routes = toSiteRoutes(readPagesFile(config.siteRepo));
  } catch (error) {
    // Without pages.json there is nothing to audit against and nothing to fix.
    return finish({
      outcome: "failed",
      message: `Could not read ${config.siteRepo}/content/seo/pages.json: ${msg(error)}`,
    });
  }

  // ---- 2. discover keywords ----

  for (const locale of config.locales) {
    try {
      const report = await expandKeywords(config.seeds[locale] ?? [], locale, {
        deep: !shallow,
      });
      if (report.queriesFailed === report.queriesRun && report.queriesRun > 0) {
        failures.push(`${locale}: every autocomplete query failed`);
        continue;
      }
      const added = mergeKeywords(
        buildKeywordSet(
          report.terms.map((t) => ({ ...t, locale, via: "autocomplete" as const })),
          now,
        ),
      );
      keywordsDiscovered += added.length;
    } catch (error) {
      failures.push(`${locale} discovery: ${msg(error)}`);
    }
  }

  // ---- 3. real numbers, if Search Console is connected ----

  const stats = await fetchStats(28, now);
  if (stats.available) {
    statsSource = "search-console";
    const byTerm = statsByTerm(stats);
    const keywords = listKeywords();
    let touched = false;

    for (const kw of keywords) {
      const row = byTerm.get(kw.term);
      if (!row) continue;
      kw.stats = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        measuredAt: startedAt,
      };
      const rescored = scoreKeyword({
        term: kw.term,
        intent: kw.intent,
        locale: kw.locale,
        stats: kw.stats,
      });
      kw.opportunity = rescored.opportunity;
      kw.reasoning = rescored.reasoning;
      touched = true;
    }

    // Queries Google has shown us for that discovery never guessed. These are
    // the most valuable keywords in the store, because they are proven demand
    // the site is already visible for.
    const known = new Set(keywords.map((k) => k.term));
    const fromSearch = stats.queries
      .filter((q) => q.impressions >= 3 && !known.has(q.query.toLowerCase().trim()))
      .slice(0, 200);

    if (fromSearch.length > 0) {
      const { classifyIntent, isTargetableTerm, normalizeTerm } = await import("./expand.ts");
      const discovered = fromSearch
        .map((q) => normalizeTerm(q.query))
        .filter((term) => term.includes(" ") && isTargetableTerm(term))
        .map((term) => ({
          term,
          intent: classifyIntent(term),
          locale: "en" as Locale,
          via: "search-console" as const,
        }));
      keywordsDiscovered += mergeKeywords(buildKeywordSet(discovered, now)).length;
    }

    if (touched) saveKeywords(keywords);
  } else if (stats.reason) {
    failures.push(`Search Console: ${stats.reason}`);
  }

  // ---- 4. re-apply the filters to what is already stored ----

  // Filters tighten as the engine meets real data: the first runs added the
  // job-seeker filter, then the off-market one, then Dutch verb-final phrasing
  // ("ai consultant worden"). Terms admitted under a looser filter must be
  // dropped, or the store keeps steering work at an audience we cannot sell to
  // long after the rule that catches them exists.
  {
    const { isTargetableTerm } = await import("./expand.ts");

    const stored = listKeywords();
    const kept = stored.filter((k) => k.discoveredVia === "manual" || isTargetableTerm(k.term));
    if (kept.length !== stored.length) saveKeywords(kept);

    // Briefs are reconciled against the filter directly rather than against
    // whatever this run happened to drop. An earlier version only cleaned
    // briefs on runs that also dropped a keyword, so when the keyword prune
    // succeeded and the brief write then failed, every later run saw a store
    // already clean and left the stale briefs alone permanently. Reconciling
    // from the rule instead of from the diff cannot get stuck that way.
    const briefs = listBriefs();
    const reconciled = briefs
      .filter((b) => isTargetableTerm(b.primaryKeyword))
      .map((b) => ({
        ...b,
        secondaryKeywords: b.secondaryKeywords.filter((t) => isTargetableTerm(t)),
      }));
    const changed =
      reconciled.length !== briefs.length ||
      reconciled.some((b, i) => b.secondaryKeywords.length !== briefs[i].secondaryKeywords.length);
    if (changed) saveBriefs(reconciled);
  }

  // ---- 5. cluster and assign ----

  const keywords = listKeywords();
  const { clusters, assignment } = clusterKeywords(
    keywords.map((k) => ({ id: k.id, term: k.term, locale: k.locale, intent: k.intent })),
  );
  for (const kw of keywords) kw.clusterId = assignment.get(kw.id);
  clustersTotal = clusters.length;

  const { assignments } = assignKeywords(keywords, routes);
  const byId = new Map(assignments.map((a) => [a.keywordId, a]));
  for (const kw of keywords) {
    const a = byId.get(kw.id);
    kw.assignedRoute = a?.route;
    kw.primary = a?.primary ?? false;
  }
  saveKeywords(keywords);
  saveClusters(clusters);

  // ---- 6. audit every live route ----

  for (const route of routes) {
    const url =
      route.locale === "en"
        ? `${origin}${route.route === "/" ? "" : route.route}`
        : `${origin}/nl${route.route === "/" ? "" : route.route}`;
    try {
      audits.push(
        await auditUrl(url, {
          route: route.route,
          locale: route.locale,
          primaryKeyword: route.primaryKeyword,
          isArticle: route.kind === "article",
        }),
      );
    } catch (error) {
      failures.push(`audit ${route.route}: ${msg(error)}`);
    }
  }
  saveAudits(audits);

  for (const warning of findCannibalisation(routes)) {
    failures.push(
      `two routes target "${warning.term}": ${warning.routes.join(" and ")}`,
    );
  }

  // ---- 7. fix what can be fixed from pages.json ----

  try {
    const file = readPagesFile(config.siteRepo);
    const candidates = candidatesFrom(audits, file);
    for (const candidate of candidates) {
      const change = await proposeChange(candidate);
      if (change) changesProposed.push(change);
    }

    if (!dryRun && config.autoApplyMetadata && changesProposed.length > 0) {
      const { applied } = applyChanges(config.siteRepo, changesProposed, now);
      changesApplied = applied.length;
      changesProposed = changesProposed.map(
        (c) => applied.find((a) => a.route === c.route && a.field === c.field && a.locale === c.locale) ?? c,
      );

      // Writing pages.json only changes a file on this disk. Until it is
      // committed and pushed, the host never rebuilds and no visitor sees any
      // of it — the improvements just accumulate as a local diff. publish()
      // with no articles stages pages.json alone, and buildCommitMessage
      // already writes a metadata-pass message for that case.
      if (changesApplied > 0) {
        const result = publish([], { repo: config.siteRepo, push: true, now });
        published = {
          ok: result.ok,
          commit: result.commit,
          branch: currentBranch(config.siteRepo),
          message: result.message,
        };
        if (!result.ok) failures.push(`publishing metadata: ${result.message}`);
      }
    }
  } catch (error) {
    failures.push(`optimiser: ${msg(error)}`);
  }

  // ---- 8. queue the gaps ----

  try {
    const fresh = addBriefs(
      buildBriefs(clusters, keywords, assignments, routes, { limit: 10, now }),
    );
    briefsCreated = fresh.length;
  } catch (error) {
    failures.push(`briefs: ${msg(error)}`);
  }

  const scored = audits.filter((a) => a.ok);
  const averageScore =
    scored.length > 0 ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length) : 0;

  return finish({
    outcome: failures.length === 0 ? "ok" : "partial",
    message:
      failures.length === 0
        ? `${keywordsDiscovered} new keywords, ${audits.length} pages audited, average ${averageScore}/100, ${changesApplied} fixes applied, ${briefsCreated} briefs queued.`
        : `Completed with ${failures.length} problem${failures.length === 1 ? "" : "s"}: ${failures.slice(0, 3).join("; ")}`,
  });

  function finish(partial: { outcome: SweepResult["outcome"]; message: string }): SweepResult {
    const sweep: SweepResult = {
      id: newId("sweep"),
      startedAt,
      finishedAt: new Date().toISOString(),
      outcome: partial.outcome,
      message: partial.message,
      keywordsDiscovered,
      keywordsTotal: listKeywords().length,
      clustersTotal,
      pagesAudited: audits.length,
      averageScore,
      changesProposed,
      changesApplied,
      published,
      briefsCreated,
      statsSource,
      findings: audits.flatMap((a) =>
        a.findings
          .filter((f) => f.severity === "critical" || f.severity === "high")
          .map((f) => ({ route: a.route, severity: f.severity, detail: f.detail })),
      ),
    };
    appendSweep(sweep);
    return sweep;
  }
}

export interface WeeklyResult {
  drafted: number;
  failed: number;
  published: number;
  articles: {
    slug: string;
    locale: Locale;
    title: string;
    errors: number;
    published?: boolean;
    commit?: string;
  }[];
  message: string;
}

/**
 * The briefs worth spending a writer run on, highest opportunity first.
 *
 * A brief that already has an article is finished, whatever became of that
 * article. Briefs only leave the queue once their slug is a live route, so
 * without this the Monday run rewrites the same top briefs every week — and
 * saveArticle keys on id, so every rewrite lands as a fresh duplicate at the
 * cost of a long-form Claude call each.
 *
 * Keyed by slug AND locale, because keywords are per-locale: a Dutch article
 * existing says nothing about whether the English one does.
 */
export function pendingBriefs(
  briefs: ArticleBrief[],
  alreadyWritten: Set<string>,
  limit: number,
): ArticleBrief[] {
  return briefs
    .filter((b) => !alreadyWritten.has(`${b.suggestedSlug}:${b.locale}`))
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, limit);
}

/**
 * Draft articles for the highest-opportunity queued briefs.
 *
 * Nothing is published here. Drafts wait in the console for a human to read
 * and press publish, which is the one part of this system that stays manual by
 * design.
 */
export async function weeklyArticles(
  options: { limit?: number; now?: Date } = {},
): Promise<WeeklyResult> {
  const config = getConfig();
  const { limit = config.weeklyArticleTarget, now = new Date() } = options;

  const queued = listBriefs();
  const briefs = pendingBriefs(queued, usedSlugs(), limit);

  if (briefs.length === 0) {
    const message =
      queued.length === 0
        ? "No briefs queued. Nothing to write."
        : `All ${queued.length} queued briefs already have an article. Nothing to write.`;
    return { drafted: 0, failed: 0, published: 0, articles: [], message };
  }

  const written: WeeklyResult["articles"] = [];
  let failed = 0;
  let publishedCount = 0;

  for (const brief of briefs) {
    try {
      const result = await writeArticle(brief, { now });
      if (!result.article) {
        failed++;
        continue;
      }
      saveArticle(result.article);

      // The writer ships its own clean work. The voice gate decides, not
      // whether anyone happened to be looking: publishArticle refuses a draft
      // with errors, and that one stays in the queue for a person to read.
      // Same function the Publish button calls, so the machine can never be
      // held to a laxer standard than a human pressing it.
      let sent: ArticleOutcome | undefined;
      if (config.autoPublishArticles && result.article.lint.errors === 0) {
        sent = publishArticle(result.article, { now });
        if (sent.ok) publishedCount++;
      }

      written.push({
        slug: result.article.slug,
        locale: result.article.locale,
        title: result.article.title,
        errors: result.article.lint.errors,
        published: sent?.ok ?? false,
        commit: sent?.commit,
      });
    } catch {
      failed++;
    }
  }

  const clean = written.filter((w) => w.errors === 0).length;
  const held = clean - publishedCount;
  return {
    drafted: written.length,
    failed,
    published: publishedCount,
    articles: written,
    message:
      written.length === 0
        ? `No articles written. ${failed} attempt${failed === 1 ? "" : "s"} failed.`
        : `${written.length} written, ${publishedCount} published${
            held > 0 ? `, ${held} clean but not sent` : ""
          }${written.length - clean > 0 ? `, ${written.length - clean} held by the voice gate` : ""}${
            failed > 0 ? `, ${failed} failed` : ""
          }.`,
  };
}

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
