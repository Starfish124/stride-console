import Link from "next/link";
import { RECIPE_LABELS } from "@/lib/types";
import {
  listClients,
  listDrafts,
  listEvents,
  listInbox,
  listMyths,
  listPostLog,
  listSignups,
} from "@/lib/store";
import { listAudits } from "@/lib/seo/store";
import { readPulse } from "@/lib/channels/attention";
import { addDays, buildCalendar, overdue, todayISO, upcoming } from "@/lib/calendar";
import { buildStats } from "@/lib/dashboard";
import { IconTime } from "@/components/icons";
import { Header, StatusBadge } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { MythQuickAdd } from "@/components/MythQuickAdd";
import { InboxBanner } from "@/components/InboxBanner";
import { LhPulsePanel } from "@/components/LhPulsePanel";
import { SeoPanel } from "@/components/SeoPanel";
import { StatBand } from "@/components/StatBand";
import { Ramp } from "@/components/Ramp";

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
  // The one figure the console does not own. Out of reach stays null all the
  // way to the tile, which prints a dash rather than inventing a zero.
  const pulse = await readPulse().catch(() => null);
  const reachable = pulse?.reachable ? pulse : null;

  const calendar = buildCalendar(
    {
      clients,
      events: listEvents(),
      signups: listSignups(),
      postLog,
      licenceExpiry:
        pulse?.licenceDaysLeft != null
          ? addDays(today, pulse.licenceDaysLeft)
          : undefined,
    },
    today,
  );

  const owed = overdue(calendar, today);
  // Late first, then what is coming — five is a glance, more is a page.
  const nextUp = [...owed, ...upcoming(calendar, today, 5)]
    .filter((e) => e.actionable)
    .slice(0, 5);

  const stats = buildStats({
    clients,
    postLog,
    owed: owed.length,
    queued: reachable?.people ?? null,
    running: reachable?.running ?? null,
    siteScore: audits.length
      ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length)
      : null,
    pages: audits.length,
    drafts: allDrafts.length,
    awaitingApproval: allDrafts.filter((d) => d.status === "draft").length,
  });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden pb-8 pt-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Stride console · marketing machine</p>
          <h1 className="title-large mt-3 text-ink">
            Sales, marketing, and the <span className="accent">machines</span>{" "}
            that run them.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Every channel in one place. Nothing goes out without one of you.
          </p>
          <InboxBanner entries={inbox} />
        </section>

        {/* Where everything stands, before what there is to do about it. */}
        <StatBand stats={stats} />

        {/* What the outbound machine needs from a founder, before the posting
            tools. Replies and drafts waiting on a person outrank a button. */}
        <LhPulsePanel />

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
