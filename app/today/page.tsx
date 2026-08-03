import Link from "next/link";
import { buildLedger } from "@/lib/today";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { IconApproved, IconBars, IconSearch, IconTime, IconTrend } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * The day, in one page.
 *
 * Four agents, two repositories, a graph and two founders touch this machine
 * daily, and seeing a day whole meant reading a git log, opening /seo, opening
 * /workspaces and remembering the rest.
 *
 * Read-only by construction — there is no button here. A page that tells you
 * what happened must not be able to make something happen, or its own record
 * becomes something it caused.
 */
export default async function TodayPage() {
  const ledger = buildLedger();
  const { seo, graph } = ledger;

  const byRepo = new Map<string, typeof ledger.commits>();
  for (const commit of ledger.commits) {
    byRepo.set(commit.repo, [...(byRepo.get(commit.repo) ?? []), commit]);
  }

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">The log</p>
          <h1 className="title-large mt-3 text-ink">
            {ledger.commits.length > 0 ? (
              <>
                <span className="accent">{ledger.commits.length}</span>{" "}
                {ledger.commits.length === 1 ? "change" : "changes"} shipped today.
              </>
            ) : (
              <>
                Nothing shipped <span className="accent">yet</span>.
              </>
            )}
          </h1>
          <p className="mt-2 max-w-xl text-slate">
            Every commit, sweep, article and run since midnight, from the two repositories and the
            agents themselves. Read only — nothing on this page can start anything.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat icon={IconTrend} label="Commits" value={String(ledger.commits.length)} hint={`${byRepo.size} ${byRepo.size === 1 ? "repo" : "repos"}`} />
          <Stat icon={IconSearch} label="Keywords" value={String(seo.keywordsTotal)} hint={seo.sweeps > 0 ? `+${seo.keywordsDiscovered} today` : "no sweep yet today"} />
          <Stat icon={IconApproved} label="Articles out" value={String(seo.publishedToday.length)} hint={`${seo.briefsQueued} briefs queued`} />
          <Stat icon={IconTime} label="Claude runs" value={String(ledger.runs.length)} hint={ledger.runs.length > 0 ? `${ledger.runs.filter((r) => r.ok).length} clean` : "none today"} />
        </div>

        {/* ---- the agents ---- */}
        <section className="mt-10">
          <h2 className="display text-xl text-ink">What the agents did</h2>
          <div className="mt-3 inset-group">
            <Row
              label="SEO sweep"
              value={
                seo.sweeps > 0
                  ? `${seo.sweeps} today · ${seo.keywordsDiscovered} new keywords · ${seo.changesApplied} metadata fixes`
                  : "has not run since midnight"
              }
            />
            <Row
              label="Articles"
              value={
                seo.publishedToday.length > 0
                  ? seo.publishedToday.map((a) => `${a.locale}/${a.slug}`).join(", ")
                  : "none published today"
              }
            />
            <Row
              label="Knowledge graph"
              value={
                graph
                  ? `${graph.nodes.toLocaleString("en-GB")} nodes · ${graph.edges.toLocaleString("en-GB")} edges · ${graph.sessions} sessions · built ${new Date(graph.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "never built"
              }
              href="/graph"
            />
          </div>
          {/* Stamped with its time on purpose. This morning's sweep ran before
              the Search Console key existed and says so, which reads as a live
              fault unless you can see it is hours old. */}
          {seo.lastSweepMessage ? (
            <p className="mt-3 text-[13px] text-mute">
              {seo.lastSweepAt
                ? `At ${new Date(seo.lastSweepAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} the sweep said: `
                : "Last sweep said: "}
              {seo.lastSweepMessage}
            </p>
          ) : null}
        </section>

        {/* ---- the commits ---- */}
        {ledger.commits.length > 0 ? (
          <section className="mt-10">
            <h2 className="display text-xl text-ink">Shipped</h2>
            {[...byRepo.entries()].map(([repo, commits]) => (
              <div key={repo} className="mt-4">
                <p className="eyebrow text-slate">
                  {repo} · {commits.length}
                </p>
                <div className="mt-2 inset-group">
                  {commits.map((c) => (
                    <div key={`${repo}-${c.sha}`} className="px-4 py-2.5">
                      <p className="text-[14px] text-ink">{c.subject}</p>
                      <p className="mt-0.5 text-[12px] text-mute">
                        <span className="tabular">{c.sha}</span> ·{" "}
                        {new Date(c.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {c.author}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {/* ---- delivery runs ---- */}
        {ledger.runs.length > 0 ? (
          <section className="mt-10">
            <h2 className="display text-xl text-ink">Delivery runs</h2>
            <div className="mt-3 inset-group">
              {ledger.runs.map((r) => (
                <div key={`${r.project}-${r.at}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span className="text-[14px] text-ink">{r.task}</span>
                  <span className={`shrink-0 text-[12px] ${r.ok ? "text-slate" : "text-amber"}`}>
                    {r.ok ? "clean" : "failed"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="display text-xl text-ink">Where to look next</h2>
          <div className="mt-3 inset-group">
            <Row label="Search performance" value="clicks, rankings and what is within reach" href="/seo?tab=search" />
            <Row label="Drafts waiting on you" value="what the voice gate flagged" href="/seo?tab=drafts" />
            <Row label="The graph" value="every repo and session, joined up" href="/graph" />
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IconBars;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 card-glass">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-slate" />
        <p className="eyebrow text-slate">{label}</p>
      </div>
      <p className="figure mt-2 text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-mute">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <div className="flex min-h-11 items-baseline justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-[14px] font-semibold text-ink">{label}</span>
      <span className="text-right text-[13px] text-slate">{value}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-indigo-tint">
      {body}
    </Link>
  ) : (
    body
  );
}
