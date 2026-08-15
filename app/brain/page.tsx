import { brain, type Memory } from "@/lib/brain/store";
import { BrainSearch } from "@/components/BrainSearch";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { IconBars, IconSpark, IconTime, IconWorkflow } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * The brain: what the machine remembers.
 *
 * Hermes distils every Claude session and delivery run into durable lessons
 * overnight, and diffs the pipeline into a timeline. This page is the reading
 * room — read-only, same rule as /today.
 */
export default async function BrainPage() {
  let lessons: Memory[] = [];
  let timeline: Memory[] = [];
  let total = 0;
  try {
    const b = brain();
    total = b.count();
    lessons = b.recent(80).filter((m) => m.kind !== "event").slice(0, 20);
    timeline = b.recent(20, "event");
  } catch {
    // No brain yet: the page says so instead of erroring.
  }

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Hermes</p>
          <h1 className="title-large mt-3 text-ink">
            {total > 0 ? (
              <>
                <span className="accent">{total}</span>{" "}
                {total === 1 ? "thing" : "things"} the machine remembers.
              </>
            ) : (
              <>
                Nothing remembered <span className="accent">yet</span>.
              </>
            )}
          </h1>
          <p className="mt-2 max-w-xl text-slate">
            Every Claude session and delivery run is distilled overnight into lessons, and every
            pipeline move becomes a line of history. Runs and new sessions read this before they
            start.
          </p>
        </section>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Stat icon={IconSpark} label="Sessions" value={countOf(lessons, "session")} />
          <Stat icon={IconWorkflow} label="Runs" value={countOf(lessons, "run")} />
          <Stat icon={IconTime} label="Timeline" value={String(timeline.length)} />
        </div>

        <BrainSearch />

        {lessons.length > 0 ? (
          <section className="mt-10">
            <h2 className="display text-xl text-ink">Latest lessons</h2>
            <div className="mt-3 inset-group">
              {lessons.map((m) => (
                <div key={m.id} className="px-4 py-2.5">
                  <p className="text-[14px] font-semibold text-ink">{m.subject}</p>
                  <p className="mt-0.5 text-[13px] text-slate">{m.body}</p>
                  <p className="mt-0.5 text-[12px] text-mute">
                    {m.kind} · {m.createdAt.slice(0, 10)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {timeline.length > 0 ? (
          <section className="mt-10">
            <h2 className="display text-xl text-ink">The timeline</h2>
            <div className="mt-3 inset-group">
              {timeline.map((m) => (
                <div key={m.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span className="text-[14px] text-ink">{m.subject}</span>
                  <span className="tabular shrink-0 text-[12px] text-mute">
                    {m.createdAt.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {total === 0 ? (
          <p className="mt-8 text-sm text-mute">
            Hermes runs nightly at 05:00 from the agent supervisor. First memories appear after
            the first run — or start one now with{" "}
            <span className="tabular">node scripts/brain-distill.mjs</span>.
          </p>
        ) : null}
      </main>
    </div>
  );
}

function countOf(list: Memory[], kind: Memory["kind"]): string {
  return String(list.filter((m) => m.kind === kind).length);
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconBars;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 card-glass">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-slate" />
        <p className="eyebrow text-slate">{label}</p>
      </div>
      <p className="figure mt-2 text-3xl text-ink">{value}</p>
    </div>
  );
}
