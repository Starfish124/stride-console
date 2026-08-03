"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ramp } from "@/components/Ramp";
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

type Tab = "overview" | "drafts" | "changes" | "keywords" | "pages";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
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
            <div className="rounded-card border border-amber/40 bg-amber/[0.06] p-5">
              <div className="flex items-start gap-3">
                <IconGuardrail className="mt-0.5 size-5 shrink-0 text-amber" />
                <div>
                  <p className="font-semibold text-ink">Search Console is not connected yet</p>
                  <p className="mt-1 text-[14px] text-slate">{data.stats.reason}</p>
                  <p className="mt-2 text-[13px] text-mute">
                    Until it is, there are no click or ranking numbers to show. Everything below
                    runs on the agent&apos;s own crawl, which is real but cannot tell you who found
                    you. Nothing here is estimated to fill the gap.
                  </p>
                </div>
              </div>
            </div>
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
