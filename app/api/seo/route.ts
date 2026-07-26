import { NextResponse } from "next/server";
import {
  appliedChanges,
  listArticles,
  listAudits,
  listBriefs,
  listClusters,
  listKeywords,
  listSweeps,
} from "@/lib/seo/store";
import { fetchStats, status as gscStatus } from "@/lib/seo/searchConsole";

export const dynamic = "force-dynamic";

/**
 * Everything the SEO dashboard renders, in one read.
 *
 * Search Console is fetched live rather than from the last sweep, so opening
 * the page mid-morning shows this morning's numbers instead of last night's.
 * When it is not configured the payload says so, and the UI shows a setup
 * card instead of a row of zeroes.
 */
export async function GET() {
  const [sweeps, keywords, clusters, briefs, articles, audits] = [
    listSweeps(),
    listKeywords(),
    listClusters(),
    listBriefs(),
    listArticles(),
    listAudits(),
  ];

  const stats = await fetchStats(28);

  const scored = audits.filter((a) => a.ok);
  const averageScore =
    scored.length > 0 ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length) : 0;

  return NextResponse.json({
    at: new Date().toISOString(),
    gsc: gscStatus(),
    stats,
    lastSweep: sweeps[0] ?? null,
    sweeps: sweeps.slice(0, 14),
    changes: appliedChanges(30),
    keywords: [...keywords].sort((a, b) => b.opportunity - a.opportunity).slice(0, 120),
    keywordTotal: keywords.length,
    clusterTotal: clusters.length,
    briefs: [...briefs].sort((a, b) => b.opportunity - a.opportunity),
    articles: articles.filter((a) => a.status === "drafted" || a.status === "approved"),
    published: articles.filter((a) => a.status === "published").length,
    audits: [...audits].sort((a, b) => a.score - b.score),
    averageScore,
  });
}
