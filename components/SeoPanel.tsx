import { listArticles, listAudits, listKeywords, listSweeps } from "@/lib/seo/store";
import { status as gscStatus } from "@/lib/seo/searchConsole";
import {
  IconBars,
  IconEscalate,
  IconLineageDoc,
  IconSearch,
  IconTarget,
} from "@/components/icons";
import { Panel } from "@/components/Panel";

/**
 * The website, on the front page.
 *
 * Reads the SEO suite's own store rather than keeping a second copy of
 * anything, so this cannot disagree with what the sweep actually found.
 *
 * Search Console needs a service account key before clicks and impressions
 * exist. Where it is missing this says so, rather than printing zeros: a site
 * with no traffic and a site with no measurement look identical on a
 * dashboard and mean completely different things.
 */
export function SeoPanel() {
  let keywords: ReturnType<typeof listKeywords> = [];
  let audits: ReturnType<typeof listAudits> = [];
  let articles: ReturnType<typeof listArticles> = [];
  let sweeps: ReturnType<typeof listSweeps> = [];
  let gsc: ReturnType<typeof gscStatus> = { configured: false };

  try {
    keywords = listKeywords();
    audits = listAudits();
    articles = listArticles();
    sweeps = listSweeps();
    gsc = gscStatus();
  } catch {
    // The SEO suite has never run. Nothing to show, and nothing broken.
  }

  if (keywords.length === 0 && audits.length === 0) return null;

  // appendSweep stores newest first, so the most recent sweep is index 0. This
  // read used to take the last element, which is the oldest sweep on record —
  // the panel had been reporting the score from the very first run (48) while
  // the site had since climbed to 73.
  const last = sweeps[0];
  const findings = audits.flatMap((a) => a.findings ?? []);
  const high = findings.filter((f) => f.severity === "high").length;
  const published = articles.filter((a) => a.status === "published").length;
  const score = last?.averageScore ?? null;

  // Best unassigned opportunities: the work the sweep has teed up.
  const openKeywords = keywords
    .filter((k) => !k.assignedRoute)
    .sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0))
    .slice(0, 3);

  return (
    <Panel
      icon="IconTrend"
      title="The website."
      href="/seo"
      linkLabel="Search"
      meta={last ? when(last.finishedAt) : undefined}
    >
      {/* One divided strip rather than four cards. At this size the chrome was
          most of what the eye saw. */}
      <dl className="mb-3 grid grid-cols-4 divide-x divide-line">
        <Figure
          value={score ?? 0}
          suffix={score === null ? "" : "/100"}
          label="Score"
          accent={score !== null && score < 60}
        />
        <Figure value={audits.length} label="Pages" />
        <Figure value={keywords.length} label="Keywords" />
        <Figure value={published} label="Published" />
      </dl>

      <ul className="flex flex-col gap-2">
        {/* Traffic, or an honest account of why there is none to show. A site
            with no visitors and a site with no measurement look identical as
            zeros and mean completely different things. */}
        {!gsc.configured && (
          <Row
            icon={IconBars}
            tone="text-slate"
            ring="border-line bg-white"
            title="Search Console not connected"
            detail={gsc.reason ?? "Add a service account key at data/gsc-key.json."}
          />
        )}

        {high > 0 && (
          <Row
            icon={IconEscalate}
            tone="text-amber"
            ring="border-amber/40 bg-amber/[0.06]"
            title={`${high} serious page problem${high === 1 ? "" : "s"}`}
            detail={`Across ${audits.length} page${audits.length === 1 ? "" : "s"}`}
          />
        )}

        {last && last.changesApplied > 0 && (
          <Row
            icon={IconTarget}
            tone="text-indigo"
            ring="border-line bg-white"
            title={`${last.changesApplied} title${last.changesApplied === 1 ? "" : "s"} and description${last.changesApplied === 1 ? "" : "s"} rewritten`}
            detail="By the last sweep"
          />
        )}

        {articles.length > published && (
          <Row
            icon={IconLineageDoc}
            tone="text-indigo"
            ring="border-indigo/25 bg-indigo-tint/50"
            title={`${articles.length - published} article${articles.length - published === 1 ? "" : "s"} drafted, not published`}
            detail="Waiting on a read"
          />
        )}

        {openKeywords.length > 0 && (
          <li className="rounded-card border border-line bg-white px-4 py-3">
            <p className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
              <IconSearch size={16} className="shrink-0 text-indigo" />
              Best unclaimed terms
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {openKeywords.map((k) => (
                <li key={k.id} className="flex items-baseline gap-2.5 text-[13px]">
                  <span className="num shrink-0 text-[11px] text-indigo">
                    {String(k.opportunity ?? 0).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 truncate text-ink">{k.term}</span>
                  <span className="eyebrow ml-auto shrink-0 text-slate">{k.locale}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>

      {last?.outcome && last.outcome !== "ok" && (
        <p className="mt-2 text-[11px] leading-snug text-slate">
          Last sweep finished {last.outcome}. {last.message}
        </p>
      )}
    </Panel>
  );
}

function Row({
  icon: Icon,
  tone,
  ring,
  title,
  detail,
}: {
  icon: typeof IconTarget;
  tone: string;
  ring: string;
  title: string;
  detail: string;
}) {
  return (
    <li className={`flex items-start gap-2.5 rounded-card border px-4 py-3 ${ring}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate">{detail}</span>
      </span>
    </li>
  );
}

function Figure({
  value,
  label,
  suffix = "",
  accent,
}: {
  value: number;
  label: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="px-3 first:pl-1">
      <dd className={`figure text-[22px] ${accent ? "text-amber" : "text-ink"}`}>
        {value.toLocaleString("en-GB")}
        {suffix && <span className="text-[13px] text-slate">{suffix}</span>}
      </dd>
      {/* The one signature mark on this panel. Kept, at half the width. */}
      <span aria-hidden className={`slant-rule mt-1.5 w-4 ${accent ? "text-amber" : "text-line"}`} />
      <dt className="eyebrow mt-1.5 text-slate">{label}</dt>
    </div>
  );
}

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
