import { Suspense } from "react";
import {
  listClients,
  listDrafts,
  listEvents,
  listInbox,
  listInvoices,
  listMyths,
  listNotes,
  listPostLog,
  listSignups,
} from "@/lib/store";
import { listAudits, listKeywords } from "@/lib/seo/store";
import { unhandledCount } from "@/lib/outreach/replies";
import { buildCalendar, overdue, todayISO, upcoming } from "@/lib/calendar";
import { buildQuickMenu, buildStats } from "@/lib/dashboard";
import { interviewPulse } from "@/lib/durabo/io";
import { Header } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { MythQuickAdd } from "@/components/MythQuickAdd";
import { InboxBanner } from "@/components/InboxBanner";
import { LhPulsePanel } from "@/components/LhPulsePanel";
import { SeoPanel } from "@/components/SeoPanel";
import { PipelinePanel } from "@/components/PipelinePanel";
import { CalendarPanel } from "@/components/CalendarPanel";
import { ContentPanel } from "@/components/ContentPanel";
import { PanelDeck } from "@/components/PanelDeck";
import type { DeckSlide } from "@/components/PanelDeck";
import { StatBand } from "@/components/StatBand";
import { QuickMenu } from "@/components/QuickMenu";
import { RightNow } from "@/components/RightNow";
import { AskStride } from "@/components/AskStride";
import { BrainHub, type Thought } from "@/components/BrainHub";
import { BootIntro } from "@/components/BootIntro";
import { euro } from "@/lib/company";
import { invoiceTotal } from "@/lib/types";
import {
  CampaignsQuickTile,
  CampaignsQuickTileSkeleton,
  LhPulseSkeleton,
  LinkedInStatTile,
  LinkedInStatTileSkeleton,
} from "@/components/LinkedInLive";

export const dynamic = "force-dynamic";

const RECIPES = [
  { index: "01", id: "tldr", title: "The Stride TLDR." },
  { index: "02", id: "news", title: "Breaking This Week." },
  { index: "03", id: "myth", title: "Myth vs Reality." },
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

  const notes = listNotes();
  const tiles = buildQuickMenu({
    replies: repliesWaiting,
    clients: clients.length,
    late: owed.length,
    draftsWaiting,
    seoFindings,
    toBuild: notes.filter((n) => n.lane === "todo").length,
    interviews: interviewPulse(),
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

  // Worst first, which is the order the rest of the page already uses. The
  // website slide is left out entirely when the SEO suite has never run,
  // rather than parked on the rail as an empty stop.
  const slides: DeckSlide[] = [
    {
      id: "deck-linkedin",
      label: "LinkedIn",
      // The only slide that waits on anything. Its own boundary, so the rest
      // of the deck paints without it.
      panel: (
        <Suspense fallback={<LhPulseSkeleton />}>
          <LhPulsePanel />
        </Suspense>
      ),
    },
    // SeoPanel draws nothing at all when the suite has never run, and an
    // empty snap point is worse than a missing one.
    ...(audits.length > 0 || listKeywords().length > 0
      ? [{ id: "deck-website", label: "Website", panel: <SeoPanel /> }]
      : []),
    { id: "deck-pipeline", label: "Pipeline", panel: <PipelinePanel clients={clients} /> },
    {
      id: "deck-calendar",
      label: "Calendar",
      panel: <CalendarPanel entries={nextUp} today={today} />,
    },
    {
      id: "deck-content",
      label: "Content",
      panel: (
        <ContentPanel drafts={drafts} postLog={postLog} unusedMyths={unusedMyths} />
      ),
    },
  ];

  // The brain's thoughts: the six most important things in orbit around the
  // mark. Each one is real, current, and a link — never decoration.
  const invoicesAll = listInvoices();
  const unpaidInvoices = invoicesAll.filter((i) => i.status === "sent");
  const doing = notes.filter((n) => n.lane === "doing");
  const inPlay = clients
    .filter((c) => c.stage !== "past")
    .sort((a, b) => (a.nextStep ?? "9999").localeCompare(b.nextStep ?? "9999"));
  const thoughts: Thought[] = [];
  if (owed.length > 0) thoughts.push({ value: String(owed.length), label: "overdue", href: "/calendar" });
  if (draftsWaiting > 0) thoughts.push({ value: String(draftsWaiting), label: "drafts waiting on you", href: "/" });
  if (repliesWaiting > 0) thoughts.push({ value: String(repliesWaiting), label: "replies to answer", href: "/outreach#replies" });
  if (inPlay[0]) thoughts.push({ value: inPlay[0].company || inPlay[0].name, label: inPlay[0].nextStepNote ?? "next step", href: `/clients/${inPlay[0].id}` });
  if (doing[0]) thoughts.push({ label: `Building: ${doing[0].text.slice(0, 40)}`, href: "/notes" });
  if (unpaidInvoices.length > 0) thoughts.push({ value: euro(unpaidInvoices.reduce((s, i) => s + invoiceTotal(i), 0)), label: "out the door, unpaid", href: "/invoices" });
  const upcomingEntry = nextUp.find((e) => e.date >= today);
  if (upcomingEntry) thoughts.push({ value: upcomingEntry.date.slice(5), label: upcomingEntry.title.slice(0, 40), href: upcomingEntry.href ?? "/calendar" });
  if (thoughts.length === 0) thoughts.push({ label: "Quiet brain. Radar has the sources.", href: "/radar" });

  const headline =
    waiting === 0 ? "Nothing needs you." : `${waiting} ${waiting === 1 ? "thing needs" : "things need"} you.`;

  return (
    <div className="min-h-screen bg-paper">
      {/* The curtain: mark, two breaths, fly to the hub. Once per session. */}
      <BootIntro />
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {/* The console opens as a brain having thoughts: the mark at centre,
            the six things that matter in orbit. Nobody who installed this
            needs to be sold it — but everybody needs to see what is moving. */}
        <BrainHub
          date={new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          headline={headline}
          accent={waiting === 0 ? "you" : String(waiting)}
          thoughts={thoughts}
        />
        <InboxBanner entries={inbox} />

        {/* Where everything stands, before what there is to do about it. */}
        <StatBand stats={stats}>
          <Suspense fallback={<LinkedInStatTileSkeleton />}>
            <LinkedInStatTile />
          </Suspense>
        </StatBand>

        {/* What the two of you are actually doing, before the machinery. */}
        <RightNow doing={doing} clients={clients} invoices={invoicesAll} />

        {/* And the way to act on any of it. */}
        <QuickMenu
          tiles={tiles}
          leading={
            <Suspense fallback={<CampaignsQuickTileSkeleton />}>
              <CampaignsQuickTile />
            </Suspense>
          }
        />

        {/* Every channel's dashboard, on one rail. */}
        <PanelDeck slides={slides} />

        {/* The deck reports. These two write, so they stay where a thumb can
            reach them without a sideways gesture. */}
        <p className="eyebrow mb-2 text-slate">Write something</p>
        <section className="grid gap-2 md:grid-cols-3">
          {RECIPES.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </section>

        <p className="eyebrow mb-2 mt-7 text-slate">Heard a myth</p>
        <MythQuickAdd />

        {/* The model, without leaving the front page. It reads the console's
            own state, so "what needs me" gets an answer in a sentence. */}
        <p className="eyebrow mb-2 mt-10 text-slate">Ask Stride</p>
        <AskStride />
      </main>
    </div>
  );
}
