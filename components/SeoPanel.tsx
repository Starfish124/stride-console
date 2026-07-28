import { listArticles, listAudits, listKeywords, listSweeps } from "@/lib/seo/store";
import { status as gscStatus } from "@/lib/seo/searchConsole";
import {
  IconBars,
  IconEscalate,
  IconLineageDoc,
  IconSearch,
  IconTarget,
  IconTrend,
} from "@/components/icons";

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
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <IconTrend size={22} className="shrink-0 text-indigo" />
        <h2 className="display flex-1 text-[22px] text-ink">The website.</h2>
        {last && (
          <span className="eyebrow shrink-0 text-slate">{when(last.finishedAt)}</span>
        )}
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure value={score ?? 0} suffix={score === null ? "" : "/100"} label="Page score" accent={score !== null && score < 60} />
        <Figure value={audits.length} label="Pages" />
        <Figure value={keywords.length} label="Keywords" />
        <Figure value={published} label="Published" />
      </dl>

      {/* Traffic, or an honest account of why there is none to show. */}
      <div className="card-glass mb-3 flex items-start gap-3 rounded-card border border-line bg-white px-5 py-4">
        <IconBars size={18} className="mt-0.5 shrink-0 text-indigo" />
        {gsc.configured ? (
          <p className="text-[15px] leading-snug text-ink">
            Search Console is connected as{" "}
            <span className="font-mono text-[13px]">{gsc.clientEmail}</span>. Clicks and
            impressions arrive with the next sweep.
          </p>
        ) : (
          <p className="text-[15px] leading-snug text-ink">
            No clicks or traffic yet, because Search Console is not connected.
            <span className="mt-1 block text-[13px] text-slate">
              {gsc.reason ?? "Add a service account key at data/gsc-key.json."} Until
              then every number here comes from reading the site itself.
            </span>
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {high > 0 && (
          <Row
            icon={IconEscalate}
            tone="text-amber"
            ring="border-amber/40 bg-amber/[0.06]"
            title={`${high} serious page problem${high === 1 ? "" : "s"}`}
            detail={`Across ${audits.length} pages. Missing keywords in titles and headings, mostly.`}
          />
        )}

        {last && last.changesApplied > 0 && (
          <Row
            icon={IconTarget}
            tone="text-indigo"
            ring="border-line bg-white"
            title={`${last.changesApplied} title${last.changesApplied === 1 ? "" : "s"} and description${last.changesApplied === 1 ? "" : "s"} rewritten`}
            detail="Applied to the site by the last sweep."
          />
        )}

        {articles.length > published && (
          <Row
            icon={IconLineageDoc}
            tone="text-indigo"
            ring="border-indigo/25 bg-indigo-tint/50"
            title={`${articles.length - published} article${articles.length - published === 1 ? "" : "s"} drafted, not published`}
            detail="Written and through the voice gate. Waiting on a read."
          />
        )}

        {openKeywords.length > 0 && (
          <li className="card-glass rounded-card border border-line bg-white px-5 py-4">
            <p className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
              <IconSearch size={18} className="shrink-0 text-indigo" />
              Best unclaimed terms
            </p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {openKeywords.map((k) => (
                <li key={k.id} className="flex items-baseline gap-2.5 text-[13px]">
                  <span className="eyebrow tabular shrink-0 text-indigo">
                    {String(k.opportunity ?? 0).padStart(2, "0")}
                  </span>
                  <span className="text-ink">{k.term}</span>
                  <span className="eyebrow ml-auto shrink-0 text-slate">{k.locale}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>

      {last?.outcome && last.outcome !== "ok" && (
        <p className="mt-3 text-[13px] leading-snug text-slate">
          Last sweep finished {last.outcome}. {last.message}
        </p>
      )}
    </section>
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
    <li className={`flex items-start gap-3 rounded-card border px-5 py-4 ${ring}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate">{detail}</span>
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
    <div className="card-glass rounded-card border border-line bg-white px-4 py-3.5">
      <dd className={`figure text-[28px] ${accent ? "text-amber" : "text-ink"}`}>
        {value.toLocaleString("en-GB")}
        {suffix && <span className="text-[15px] text-slate">{suffix}</span>}
      </dd>
      <span aria-hidden className={`slant-rule mt-2 w-5 ${accent ? "text-amber" : "text-line"}`} />
      <dt className="eyebrow mt-2 text-slate">{label}</dt>
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
