import Link from "next/link";
import { Suspense } from "react";
import { RECIPE_LABELS } from "@/lib/types";
import {
  listClients,
  listDrafts,
  listEvents,
  listInbox,
  listMyths,
  listNotes,
  listPostLog,
  listSignups,
} from "@/lib/store";
import { listAudits } from "@/lib/seo/store";
import { unhandledCount } from "@/lib/outreach/replies";
import { buildCalendar, overdue, todayISO, upcoming } from "@/lib/calendar";
import { buildQuickMenu, buildStats } from "@/lib/dashboard";
import { IconTime } from "@/components/icons";
import { Header, StatusBadge } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { MythQuickAdd } from "@/components/MythQuickAdd";
import { InboxBanner } from "@/components/InboxBanner";
import { LhPulsePanel } from "@/components/LhPulsePanel";
import { SeoPanel } from "@/components/SeoPanel";
import { StatBand } from "@/components/StatBand";
import { QuickMenu } from "@/components/QuickMenu";
import {
  CampaignsQuickTile,
  CampaignsQuickTileSkeleton,
  LhPulseSkeleton,
  LinkedInStatTile,
  LinkedInStatTileSkeleton,
} from "@/components/LinkedInLive";

export const dynamic = "force-dynamic";

const RECIPES = [
  {
    index: "01",
    id: "tldr",
    title: "The Stride TLDR.",
    description: "5-7 curated items from this week's AI sources, one line each.",
  },
  {
    index: "02",
    id: "news",
    title: "Breaking This Week.",
    description: "The week's biggest AI story and what it means for operators.",
  },
  {
    index: "03",
    id: "myth",
    title: "Myth vs Reality.",
    description: "Long-form original thinking plus a branded carousel, from the myth bank.",
  },
] as const;

export default async function Dashboard() {
  const today = todayISO();
  const allDrafts = listDrafts();
  const drafts = allDrafts.slice(0, 8);
  const unusedMyths = listMyths().filter((m) => !m.used).length;
  const inbox = listInbox().filter((e) => !e.seen);

  const clients = listClients();
  const postLog = listPostLog();
  const audits = listAudits();

  // Nothing here asks Linked Helper anything. Every figure below comes off
  // local disk, so the page ships at once and the three pieces that do need
  // the bridge stream in behind their own boundaries.
  //
  // The licence lapse is deliberately not fed in: it is the one calendar date
  // that costs a round trip, and it is a machine deadline rather than a person
  // — the LinkedIn panel announces it, and the calendar page still plots it.
  const calendar = buildCalendar(
    {
      clients,
      events: listEvents(),
      signups: listSignups(),
      postLog,
    },
    today,
  );

  const owed = overdue(calendar, today);
  // Late first, then what is coming — five is a glance, more is a page.
  const nextUp = [...owed, ...upcoming(calendar, today, 5)]
    .filter((e) => e.actionable)
    .slice(0, 5);

  const repliesWaiting = unhandledCount();
  const draftsWaiting = allDrafts.filter((d) => d.status === "draft").length;
  const seoFindings = audits
    .flatMap((a) => a.findings ?? [])
    .filter((f) => f.severity === "high").length;

  // The headline count is what a person is holding up, and each of these is
  // counted once. Queue lengths are deliberately not in it — 870 profiles
  // waiting on a machine is not 870 things waiting on a founder.
  const waiting = owed.length + repliesWaiting + draftsWaiting;

  const tiles = buildQuickMenu({
    replies: repliesWaiting,
    clients: clients.length,
    late: owed.length,
    draftsWaiting,
    seoFindings,
    toBuild: listNotes().filter((n) => n.lane === "todo").length,
  });

  // Only pages that answered. A route that returned 404 has no on-page score
  // to average, and counting it as zero says the page reads badly when the
  // truth is that it is not there. The sweep scores it this way too, and the
  // front page disagreeing with /seo about one number is worse than either
  // number being slightly off.
  const scored = audits.filter((a) => a.ok);

  const stats = buildStats({
    clients,
    postLog,
    siteScore: scored.length
      ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length)
      : null,
    pages: scored.length,
    drafts: allDrafts.length,
    awaitingApproval: draftsWaiting,
  });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        {/* This is our own app, so it opens with the date and the count of
            what is waiting rather than a line about what the product does.
            Nobody who has already installed it needs to be sold it. */}
        <section className="pb-7 pt-9">
          <p className="eyebrow text-slate">
            {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="title-large mt-2 text-ink">
            {waiting === 0 ? (
              <>
                Nothing needs <span className="accent">you</span>.
              </>
            ) : (
              <>
                <span className="accent">{waiting}</span>{" "}
                {waiting === 1 ? "thing needs" : "things need"} you.
              </>
            )}
          </h1>
          <InboxBanner entries={inbox} />
        </section>

        {/* Where everything stands, before what there is to do about it. */}
        <StatBand stats={stats}>
          <Suspense fallback={<LinkedInStatTileSkeleton />}>
            <LinkedInStatTile />
          </Suspense>
        </StatBand>

        {/* And the way to act on any of it. */}
        <QuickMenu
          tiles={tiles}
          leading={
            <Suspense fallback={<CampaignsQuickTileSkeleton />}>
              <CampaignsQuickTile />
            </Suspense>
          }
        />

        {/* What the outbound machine needs from a founder, before the posting
            tools. Replies and drafts waiting on a person outrank a button. */}
        <Suspense fallback={<LhPulseSkeleton />}>
          <LhPulsePanel />
        </Suspense>

        <SeoPanel />

        {/* The sales half of "does this need me". The LinkedIn panel above
            answers it for the machine; this answers it for the people. */}
        {nextUp.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <IconTime size={22} className="shrink-0 text-indigo" />
              <h2 className="display flex-1 text-[22px] text-ink">Next with people.</h2>
              <Link href="/calendar" className="eyebrow shrink-0 text-indigo hover:text-indigo-deep">
                Calendar
              </Link>
            </div>
            <ul className="inset-group card-glass">
              {nextUp.map((e) => {
                const late = e.actionable && e.date < today;
                return (
                  <li key={e.id}>
                    <Link
                      href={e.href ?? "/calendar"}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-paper"
                    >
                      <span
                        className={`eyebrow w-14 shrink-0 ${late ? "text-amber" : "text-slate"}`}
                      >
                        {late
                          ? "Late"
                          : new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug text-ink">
                          {e.title}
                        </span>
                        {e.detail && (
                          <span className="block text-xs text-slate">{e.detail}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="eyebrow mb-3 text-slate">Write something</p>
        <section className="grid gap-4 md:grid-cols-3">
          {RECIPES.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </section>

        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <p className="eyebrow text-slate">Myth bank</p>
            <h2 className="display mt-2 text-[22px] text-ink">
              Heard a myth in a client call.
            </h2>
            <p className="mb-4 mt-1 text-sm text-slate">
              Ten seconds now, a long-form post later. {unusedMyths} unused in the
              bank.
            </p>
            <MythQuickAdd />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <p className="eyebrow text-slate">Recent drafts</p>
              <Link
                href="/library"
                className="text-sm font-semibold text-indigo hover:text-indigo-deep"
              >
                The whole library →
              </Link>
            </div>
            <h2 className="display mt-2 mb-4 text-[22px] text-ink">The last runs.</h2>
            {drafts.length === 0 ? (
              <p className="card-glass rounded-card border border-line bg-white p-6 text-sm text-slate">
                Nothing yet. Run a recipe above and the draft lands here.
              </p>
            ) : (
              <ul className="overflow-hidden card-glass rounded-card border border-line bg-white">
                {drafts.map((d, i) => (
                  <li key={d.id} className={i > 0 ? "border-t border-line" : ""}>
                    <Link
                      href={`/drafts/${d.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-paper"
                    >
                      <span className="eyebrow text-indigo">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {RECIPE_LABELS[d.recipe]}
                        </span>
                        <span className="block text-xs text-slate">
                          {new Date(d.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
