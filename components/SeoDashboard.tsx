"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ramp } from "@/components/Ramp";
import { sparkPoints } from "@/lib/seo/spark";
import {
  IconApproved,
  IconBars,
  IconEscalate,
  IconGuardrail,
  IconSearch,
  IconTarget,
  IconTime,
  IconTrend,
} from "@/components/icons";

/**
 * The SEO dashboard.
 *
 * Four questions, in the order a founder actually asks them:
 *   Is anybody finding us?      the click and impression tiles
 *   What is waiting on me?      the draft queue with a publish button
 *   What did the machine do?    the change log, every edit with its reason
 *   What is it working on?      keywords, briefs, and the page scores
 *
 * Numbers that have never been measured are shown as "not measured", never as
 * zero. A dashboard reading 0 clicks is indistinguishable from one that has
 * never been connected, and the two mean opposite things.
 */

interface Payload {
  at: string;
  gsc: { configured: boolean; reason?: string; siteUrl?: string };
  stats: {
    available: boolean;
    reason?: string;
    from: string;
    to: string;
    totals: { clicks: number; impressions: number; ctr: number; position: number };
    queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    pages: { page: string; clicks: number; impressions: number; position: number }[];
  };
  analytics: {
    available: boolean;
    reason?: string;
    from: string;
    to: string;
    awaitingData: boolean;
    totals: { clicks: number; impressions: number; ctr: number; position: number };
    deltas: Record<
      "clicks" | "impressions" | "ctr" | "position",
      { current: number; previous: number; change: number; ratio?: number; better?: boolean; unmeasured: boolean }
    >;
    daily: { date: string; clicks: number; impressions: number }[];
    striking: { query: string; clicks: number; impressions: number; ctr: number; position: number; gap: number }[];
    untracked: { query: string; clicks: number; impressions: number; position: number }[];
    locales: { locale: string; clicks: number; impressions: number; ctr: number; pages: number }[];
    topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    topPages: { page: string; clicks: number; impressions: number; position: number }[];
  };
  lastSweep: null | {
    finishedAt: string;
    outcome: string;
    message: string;
    keywordsDiscovered: number;
    changesApplied: number;
    briefsCreated: number;
    statsSource: string;
    published?: { ok: boolean; commit?: string; branch?: string; message: string } | null;
  };
  changes: {
    route: string;
    locale: string;
    field: string;
    before: string;
    after: string;
    reason: string;
    appliedAt?: string;
  }[];
  keywords: {
    id: string;
    term: string;
    locale: string;
    intent: string;
    opportunity: number;
    reasoning?: string;
    assignedRoute?: string;
    primary?: boolean;
    stats?: { clicks: number; impressions: number; position: number };
  }[];
  keywordTotal: number;
  clusterTotal: number;
  briefs: {
    id: string;
    primaryKeyword: string;
    locale: string;
    role: string;
    template: string;
    opportunity: number;
    wordCountTarget: number;
  }[];
  articles: {
    id: string;
    slug: string;
    locale: string;
    title: string;
    description: string;
    body: string;
    primaryKeyword: string;
    wordCount: number;
    status: string;
    lint: { errors: number; warns: number; violations: { rule: string; severity: string; excerpt: string; fix?: string }[] };
    placement: { ok: boolean; missing: string[] };
  }[];
  published: number;
  audits: { route: string; locale: string; score: number; wordCount: number; findings: { severity: string; detail: string; recommendation: string }[] }[];
  averageScore: number;
}

type Tab = "overview" | "search" | "drafts" | "changes" | "keywords" | "pages";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "search", label: "Search" },
  { id: "drafts", label: "Drafts" },
  { id: "changes", label: "Changes" },
  { id: "keywords", label: "Keywords" },
  { id: "pages", label: "Pages" },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-indigo";
  if (score >= 60) return "text-slate";
  return "text-amber";
}

export function SeoDashboard() {
  // The app menu deep-links into these tabs (Blogs, Review, Keywords are all
  // this page), so ?tab= picks the opening one. Navigating here again with a
  // different tab does not remount, hence the sync below rather than only an
  // initial value.
  const wanted = useSearchParams().get("tab") as Tab | null;
  const valid = wanted && TABS.some((t) => t.id === wanted) ? wanted : null;

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(valid ?? "overview");

  const [lastWanted, setLastWanted] = useState(valid);
  if (valid !== lastWanted) {
    setLastWanted(valid);
    if (valid) setTab(valid);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/seo", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setData((await res.json()) as Payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount, same shape as RadarView: every setState in load happens
    // after an await, never synchronously during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(id: string, action: "publish" | "reject") {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/seo/articles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setNotice(res.ok ? (body.message ?? "Done.") : (body.error ?? "Failed."));
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <p className="rounded-card border border-amber/40 bg-amber/[0.06] p-4 text-slate">{error}</p>;
  }
  if (!data) {
    return <p className="text-slate">Reading the machine…</p>;
  }

  const drafts = data.articles.filter((a) => a.status === "drafted" || a.status === "approved");
  const clean = drafts.filter((a) => a.lint.errors === 0).length;

  return (
    <div>
      {/* ---------- tabs ---------- */}
      <nav className="mb-8 flex flex-wrap gap-1" aria-label="SEO sections">
        {TABS.map((t) => {
          const count =
            t.id === "drafts" ? drafts.length : t.id === "changes" ? data.changes.length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pressable rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                tab === t.id ? "bg-ink text-white" : "text-slate hover:bg-indigo-tint"
              }`}
            >
              {t.label}
              {count > 0 ? (
                <span className={`ml-1.5 tabular ${tab === t.id ? "text-white/70" : "text-mute"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {notice ? (
        <p className="mb-6 rounded-card border border-indigo/25 bg-indigo-tint/50 px-4 py-3 text-[14px] text-ink">
          {notice}
        </p>
      ) : null}

      {/* ---------- overview ---------- */}
      {tab === "overview" ? (
        <div className="space-y-8">
          {!data.stats.available ? (
            <Notice tone="amber" title="Search Console is not connected yet">
              {data.stats.reason}. Until it is, there are no click or ranking numbers to show.
              Everything below runs on the agent&apos;s own crawl, which is real but cannot tell you
              who found you. Nothing here is estimated to fill the gap.
            </Notice>
          ) : data.analytics.awaitingData ? (
            <Notice
              tone="indigo"
              title={`Search Console is connected — ${data.gsc.siteUrl ?? "the property"}`}
            >
              No clicks or impressions in this window yet. It reports about two days behind and does
              not backfill, so a property verified this week is quiet for a few days. The Search tab
              fills in on its own.
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              icon={IconTrend}
              label="Clicks"
              value={data.stats.available ? String(data.stats.totals.clicks) : "not measured"}
              hint={data.stats.available ? `${data.stats.from} to ${data.stats.to}` : "connect Search Console"}
              muted={!data.stats.available}
            />
            <Tile
              icon={IconSearch}
              label="Impressions"
              value={data.stats.available ? String(data.stats.totals.impressions) : "not measured"}
              hint={data.stats.available ? `CTR ${pct(data.stats.totals.ctr)}` : "connect Search Console"}
              muted={!data.stats.available}
            />
            <Tile
              icon={IconTarget}
              label="Average position"
              value={data.stats.available ? data.stats.totals.position.toFixed(1) : "not measured"}
              hint={data.stats.available ? "weighted by impressions" : "connect Search Console"}
              muted={!data.stats.available}
            />
            <Tile
              icon={IconBars}
              label="On-page score"
              value={`${data.averageScore}`}
              hint={`across ${data.audits.length} pages`}
              tone={scoreTone(data.averageScore)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Tile icon={IconSearch} label="Keywords tracked" value={String(data.keywordTotal)} hint={`in ${data.clusterTotal} clusters`} small />
            <Tile icon={IconTime} label="Drafts waiting" value={String(drafts.length)} hint={`${clean} clean through the gate`} small />
            <Tile icon={IconApproved} label="Published" value={String(data.published)} hint="by the agent" small />
          </div>

          {data.lastSweep ? (
            <section className="rounded-card border border-line bg-white p-5 card-glass">
              <p className="eyebrow text-slate">Last sweep</p>
              <p className="mt-2 text-[15px] text-ink">{data.lastSweep.message}</p>
              <p className="mt-2 text-[13px] text-mute">
                {new Date(data.lastSweep.finishedAt).toLocaleString("en-GB")} · outcome{" "}
                {data.lastSweep.outcome} · stats from{" "}
                {data.lastSweep.statsSource === "search-console" ? "Search Console" : "the crawl only"}
              </p>
              {/* The agent commits to the live site on its own, so it has to
                  say what it sent and where. */}
              {data.lastSweep.published ? (
                <p
                  className={`mt-2 text-[13px] ${data.lastSweep.published.ok ? "text-slate" : "text-amber"}`}
                >
                  {data.lastSweep.published.ok
                    ? `Sent to the site: ${data.lastSweep.published.message}`
                    : `The site was not updated: ${data.lastSweep.published.message}`}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="text-slate">
              No sweep has run yet. Start the backend, or run{" "}
              <code className="rounded bg-indigo-tint px-1.5 py-0.5 text-[13px]">npm run seo:sweep</code>.
            </p>
          )}

          {data.stats.available && data.stats.queries.length > 0 ? (
            <section>
              <h2 className="display text-xl text-ink">What people actually searched</h2>
              <div className="mt-3 inset-group">
                {data.stats.queries.slice(0, 12).map((q) => (
                  <div key={q.query} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-ink">{q.query}</span>
                    <span className="tabular shrink-0 text-[13px] text-slate">
                      {q.clicks} clicks · {q.impressions} shown · pos {q.position.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ---------- search ---------- */}
      {tab === "search" ? (
        <div className="space-y-8">
          {!data.analytics.available ? (
            <Notice tone="amber" title="Search Console is not connected">
              {data.analytics.reason}
            </Notice>
          ) : data.analytics.awaitingData ? (
            <Notice tone="indigo" title="Connected. Nothing measured in this window yet.">
              Search Console reports about two days behind and does not backfill, so a newly
              verified property is quiet for a few days. Everything on this page fills in on its
              own — no number here is estimated in the meantime.
            </Notice>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <DeltaTile
              icon={IconTrend}
              label="Clicks"
              value={data.analytics.totals.clicks}
              delta={data.analytics.deltas.clicks}
              available={data.analytics.available && !data.analytics.awaitingData}
            />
            <DeltaTile
              icon={IconSearch}
              label="Impressions"
              value={data.analytics.totals.impressions}
              delta={data.analytics.deltas.impressions}
              available={data.analytics.available && !data.analytics.awaitingData}
            />
            <DeltaTile
              icon={IconBars}
              label="CTR"
              value={data.analytics.totals.ctr}
              delta={data.analytics.deltas.ctr}
              available={data.analytics.available && !data.analytics.awaitingData}
              format={(n) => pct(n)}
            />
            <DeltaTile
              icon={IconTarget}
              label="Average position"
              value={data.analytics.totals.position}
              delta={data.analytics.deltas.position}
              available={data.analytics.available && !data.analytics.awaitingData}
              format={(n) => n.toFixed(1)}
            />
          </div>

          {data.analytics.daily.length > 1 ? (
            // Two charts, not one with two axes. Clicks and impressions differ by
            // orders of magnitude, and a second y-scale lets anyone read any
            // relationship they like into the crossing point.
            <div className="grid gap-4 sm:grid-cols-2">
              <Spark
                title="Clicks per day"
                days={data.analytics.daily}
                pick={(d) => d.clicks}
                format={(n) => String(n)}
              />
              <Spark
                title="Impressions per day"
                days={data.analytics.daily}
                pick={(d) => d.impressions}
                format={(n) => String(n)}
              />
            </div>
          ) : null}

          <section>
            <h2 className="display text-xl text-ink">Within reach</h2>
            <p className="mt-1 text-[14px] text-slate">
              Ranking 4th to 20th, so Google already thinks the page belongs. Moving these up turns
              impressions you already have into clicks, which is cheaper than winning a new keyword
              from nothing. Ordered by how many people see it, not by rank.
            </p>
            {data.analytics.striking.length === 0 ? (
              <p className="mt-3 text-[14px] text-mute">
                {data.analytics.available
                  ? "Nothing in that band yet."
                  : "Not measured — this list needs Search Console."}
              </p>
            ) : (
              <div className="mt-3 inset-group">
                {data.analytics.striking.map((r) => (
                  <div key={r.query} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-ink">{r.query}</span>
                    <span className="tabular shrink-0 text-[13px] text-slate">
                      pos {r.position.toFixed(1)}
                      <span className="text-mute"> · {r.gap} to reach 3rd</span> · {r.impressions} shown
                      {r.clicks > 0 ? ` · ${r.clicks} clicks` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="display text-xl text-ink">Searched for, never tracked</h2>
            <p className="mt-1 text-[14px] text-slate">
              Real queries that reached the site and are not in the keyword store. Discovery guesses
              from autocomplete; this is what people actually typed, which makes it the best input
              the organiser can get.
            </p>
            {data.analytics.untracked.length === 0 ? (
              <p className="mt-3 text-[14px] text-mute">
                {data.analytics.available ? "Nothing new." : "Not measured."}
              </p>
            ) : (
              <div className="mt-3 inset-group">
                {data.analytics.untracked.map((r) => (
                  <div key={r.query} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-ink">{r.query}</span>
                    <span className="tabular shrink-0 text-[13px] text-slate">
                      {r.impressions} shown · pos {r.position.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.analytics.locales.length > 0 ? (
            <section>
              <h2 className="display text-xl text-ink">By language</h2>
              <p className="mt-1 text-[14px] text-slate">
                From the page URLs, because a search query has no language of its own.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {data.analytics.locales.map((l) => (
                  <div key={l.locale} className="rounded-card border border-line bg-white p-4 card-glass">
                    <p className="eyebrow text-slate">{l.locale === "nl" ? "Dutch" : "English"}</p>
                    <p className="figure mt-2 text-2xl text-ink">{l.impressions}</p>
                    <p className="mt-1 text-[12px] text-mute">
                      impressions · {l.clicks} clicks · CTR {pct(l.ctr)} · {l.pages} pages
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.analytics.topPages.length > 0 ? (
            <section>
              <h2 className="display text-xl text-ink">Pages people saw</h2>
              <div className="mt-3 inset-group">
                {data.analytics.topPages.map((p) => (
                  <div key={p.page} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="truncate text-[14px] text-ink">{pathOf(p.page)}</span>
                    <span className="tabular shrink-0 text-[13px] text-slate">
                      {p.impressions} shown · {p.clicks} clicks · pos {p.position.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ---------- drafts ---------- */}
      {tab === "drafts" ? (
        <div className="space-y-5">
          {drafts.length === 0 ? (
            <p className="text-slate">
              Nothing waiting. The article agent runs every morning and writes for the highest
              opportunity gap the sweep found. A draft only lands here if the voice gate
              flagged it.
            </p>
          ) : (
            drafts.map((a) => (
              <article key={a.id} className="rounded-card border border-line bg-white p-5 card-glass">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow text-slate">
                      {a.locale.toUpperCase()} · {a.wordCount} words · targets &ldquo;{a.primaryKeyword}&rdquo;
                    </p>
                    <h3 className="display mt-1 text-lg text-ink">{a.title}</h3>
                    <p className="mt-1 text-[14px] text-slate">{a.description}</p>
                    <p className="mt-1 text-[13px] text-mute">/blog/{a.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.lint.errors === 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-tint px-2.5 py-1 text-[12px] font-semibold text-indigo">
                        <IconApproved className="size-3.5" /> passes the gate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber/[0.12] px-2.5 py-1 text-[12px] font-semibold text-amber">
                        <IconEscalate className="size-3.5" /> {a.lint.errors} to fix
                      </span>
                    )}
                  </div>
                </div>

                {a.lint.violations.length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {a.lint.violations.slice(0, 6).map((v, i) => (
                      <li key={i} className="text-[13px] text-slate">
                        <span className={v.severity === "error" ? "text-amber" : "text-mute"}>
                          {v.severity}
                        </span>{" "}
                        <span className="font-semibold">{v.rule}</span>: {v.excerpt}
                        {v.fix ? <span className="text-mute"> ({v.fix})</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!a.placement.ok ? (
                  <p className="mt-2 text-[13px] text-amber">
                    Keyword missing from: {a.placement.missing.join(", ")}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => act(a.id, "publish")}
                    disabled={busy === a.id || a.lint.errors > 0}
                    className="pressable rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                    title={a.lint.errors > 0 ? "The voice gate still reports errors" : "Commit and push to the website"}
                  >
                    {busy === a.id ? "Publishing…" : "Publish"}
                  </button>
                  <button
                    onClick={() => act(a.id, "reject")}
                    disabled={busy === a.id}
                    className="pressable rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-slate disabled:opacity-40"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                    className="pressable rounded-full px-4 py-2 text-[13px] font-semibold text-slate"
                  >
                    {open === a.id ? "Hide" : "Read it"}
                  </button>
                </div>

                {open === a.id ? (
                  <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-card bg-paper p-4 text-[13px] leading-relaxed text-ink">
                    {a.body}
                  </pre>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}

      {/* ---------- changes ---------- */}
      {tab === "changes" ? (
        <div className="space-y-4">
          <p className="text-[14px] text-slate">
            Every metadata edit the agent applied, newest first. Each one passed length, keyword
            and voice-gate checks before it was written, and each is a line in the website&apos;s
            git history that reverts on its own.
          </p>
          {data.changes.length === 0 ? (
            <p className="text-slate">Nothing changed yet.</p>
          ) : (
            data.changes.map((c, i) => (
              <div key={i} className="rounded-card border border-line bg-white p-4 card-glass">
                <p className="eyebrow text-slate">
                  {c.route} · {c.locale.toUpperCase()} · {c.field}
                  {c.appliedAt ? ` · ${new Date(c.appliedAt).toLocaleDateString("en-GB")}` : ""}
                </p>
                <p className="mt-2 text-[14px] text-mute line-through">{c.before}</p>
                <p className="mt-1 text-[14px] text-ink">{c.after}</p>
                <p className="mt-2 text-[13px] text-slate">Why: {c.reason}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* ---------- keywords ---------- */}
      {tab === "keywords" ? (
        <div className="space-y-6">
          {data.briefs.length > 0 ? (
            <section>
              <h2 className="display text-xl text-ink">Queued to write</h2>
              <div className="mt-3 inset-group">
                {data.briefs.slice(0, 12).map((b) => (
                  <div key={b.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-ink">
                      {b.primaryKeyword}
                      <span className="ml-2 text-[12px] text-mute">
                        {b.locale.toUpperCase()} · {b.role} · {b.template} · {b.wordCountTarget}w
                      </span>
                    </span>
                    <span className="figure shrink-0 text-[15px] text-indigo">{b.opportunity}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="display text-xl text-ink">Keywords by opportunity</h2>
            <p className="mt-1 text-[13px] text-slate">
              {data.keywordTotal} tracked, grouped into {data.clusterTotal} clusters. Higher means
              work on it sooner.
            </p>
            <div className="mt-3 inset-group">
              {data.keywords.slice(0, 60).map((k) => (
                <div key={k.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-ink">
                      {k.term}
                      <span className="ml-2 text-[12px] text-mute">
                        {k.locale.toUpperCase()} · {k.intent}
                        {k.assignedRoute ? ` · ${k.assignedRoute}${k.primary ? " (primary)" : ""}` : " · no page yet"}
                      </span>
                    </span>
                    <span className="figure shrink-0 text-[15px] text-indigo">{k.opportunity}</span>
                  </div>
                  {k.stats ? (
                    <p className="tabular mt-0.5 text-[12px] text-slate">
                      {k.stats.clicks} clicks · {k.stats.impressions} shown · position{" "}
                      {k.stats.position.toFixed(1)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* ---------- pages ---------- */}
      {tab === "pages" ? (
        <div className="space-y-4">
          <p className="text-[14px] text-slate">
            Worst first. Findings the agent can fix itself are already fixed; what remains lives in
            the page components, which the agent deliberately does not edit.
          </p>
          {data.audits.map((a) => (
            <div key={`${a.route}-${a.locale}`} className="rounded-card border border-line bg-white p-4 card-glass">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-semibold text-ink">
                  {a.route}
                  <span className="ml-2 text-[12px] text-mute">
                    {a.locale.toUpperCase()} · {a.wordCount} words
                  </span>
                </p>
                <span className={`figure text-lg ${scoreTone(a.score)}`}>{a.score}</span>
              </div>
              {a.findings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {a.findings.map((f, i) => (
                    <li key={i} className="text-[13px] text-slate">
                      <span
                        className={
                          f.severity === "critical" || f.severity === "high" ? "text-amber" : "text-mute"
                        }
                      >
                        {f.severity}
                      </span>{" "}
                      {f.detail} <span className="text-mute">{f.recommendation}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-indigo">Nothing to fix.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A stat with its change against the previous 28 days.
 *
 * The arrow and the word carry the direction, not the colour: "up" is not
 * always good — a rising average position means the site is sinking — and
 * colour alone fails for anyone who cannot separate the two hues.
 */
function DeltaTile({
  icon: Icon,
  label,
  value,
  delta,
  available,
  format = (n: number) => String(n),
}: {
  icon: typeof IconBars;
  label: string;
  value: number;
  delta: { change: number; ratio?: number; better?: boolean; unmeasured: boolean };
  available: boolean;
  format?: (n: number) => string;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 card-glass">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-slate" />
        <p className="eyebrow text-slate">{label}</p>
      </div>
      {available ? (
        <p className="figure mt-2 text-3xl text-ink">{format(value)}</p>
      ) : (
        <p className="mt-2 text-[17px] text-mute">not measured</p>
      )}
      {available ? (
        delta.unmeasured || delta.better === undefined ? (
          <p className="mt-1 text-[12px] text-mute">no change on the previous 28 days</p>
        ) : (
          <p className={`mt-1 text-[12px] ${delta.better ? "text-indigo" : "text-amber"}`}>
            {delta.change > 0 ? "\u25b2" : "\u25bc"} {format(Math.abs(delta.change))}
            {delta.ratio !== undefined ? ` (${pct(Math.abs(delta.ratio))})` : ""}{" "}
            {delta.better ? "better" : "worse"} than the 28 days before
          </p>
        )
      ) : null}
    </div>
  );
}

/**
 * One measure over time. A sparkline rather than a full chart: the question is
 * "which way is this going", and an axis pair would cost more room than the
 * answer is worth. The last value is labelled, and every day carries a native
 * SVG title so hovering names the date — no chart library, no client JS.
 */
function Spark({
  title,
  days,
  pick,
  format,
}: {
  title: string;
  days: { date: string; clicks: number; impressions: number }[];
  pick: (d: { date: string; clicks: number; impressions: number }) => number;
  format: (n: number) => string;
}) {
  const values = days.map(pick);
  const points = sparkPoints(values);
  const W = 240;
  const H = 44;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * W).toFixed(1)} ${(p.y * (H - 6) + 3).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const peak = Math.max(...values);

  // A window of pure zeroes drew a solid line across the box, which reads as
  // flat traffic rather than as no data — the one thing this dashboard is not
  // allowed to imply. Nothing measured, nothing drawn.
  if (peak === 0) {
    return (
      <figure className="rounded-card border border-line bg-white p-4 card-glass">
        <figcaption className="eyebrow text-slate">{title}</figcaption>
        <p className="mt-1 text-[17px] text-mute">not measured yet</p>
        <div className="mt-3 h-[22px] border-b border-dashed border-line" />
        <p className="mt-2 text-[12px] text-mute">
          {days.length} days to {days[days.length - 1]?.date}, none with data
        </p>
      </figure>
    );
  }

  return (
    <figure className="rounded-card border border-line bg-white p-4 card-glass">
      <figcaption className="eyebrow text-slate">{title}</figcaption>
      <p className="figure mt-1 text-2xl text-ink">{format(values[values.length - 1] ?? 0)}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${title}: ${values.map(format).join(", ")}`}
        preserveAspectRatio="none"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-indigo" strokeLinejoin="round" strokeLinecap="round" />
        {last ? (
          <circle cx={last.x * W} cy={last.y * (H - 6) + 3} r={4} className="fill-indigo" />
        ) : null}
        {points.map((p, i) => (
          <rect key={days[i].date} x={p.x * W - 3} y={0} width={6} height={H} fill="transparent">
            <title>{`${days[i].date}: ${format(values[i])}`}</title>
          </rect>
        ))}
      </svg>
      <p className="mt-1 text-[12px] text-mute">
        peak {format(peak)} · {days.length} days to {days[days.length - 1]?.date}
      </p>
    </figure>
  );
}

/** A one-off explanation card. Amber warns, indigo informs. */
function Notice({
  tone,
  title,
  children,
}: {
  tone: "amber" | "indigo";
  title: string;
  children?: React.ReactNode;
}) {
  const amber = tone === "amber";
  return (
    <div
      className={`rounded-card border p-5 ${amber ? "border-amber/40 bg-amber/[0.06]" : "border-indigo/30 bg-indigo-tint"}`}
    >
      <div className="flex items-start gap-3">
        {amber ? (
          <IconGuardrail className="mt-0.5 size-5 shrink-0 text-amber" />
        ) : (
          <IconApproved className="mt-0.5 size-5 shrink-0 text-indigo" />
        )}
        <div>
          <p className="font-semibold text-ink">{title}</p>
          {children ? <p className="mt-1 text-[14px] text-slate">{children}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Path only. A column of full URLs is unreadable and all the same prefix. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-ink",
  muted = false,
  small = false,
}: {
  icon: typeof IconBars;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 card-glass">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-slate" />
        <p className="eyebrow text-slate">{label}</p>
      </div>
      <p
        className={`figure mt-2 ${small ? "text-2xl" : "text-3xl"} ${muted ? "text-mute" : tone}`}
        style={muted ? { fontSize: "1.05rem" } : undefined}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[12px] text-mute">{hint}</p> : null}
    </div>
  );
}

export function SeoRamp() {
  return <Ramp width={52} className="mb-4 text-indigo" />;
}
