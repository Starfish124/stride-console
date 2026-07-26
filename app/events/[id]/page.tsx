import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getEvent, listSignups } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header } from "@/components/ui";
import { EventChecklist } from "@/components/EventChecklist";
import { EventRecipeButtons } from "@/components/EventRecipeButtons";
import { MythQuickAdd } from "@/components/MythQuickAdd";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();
  const signups = listSignups();
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;

  const dateLabel = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-12">
          <p className="eyebrow text-slate">1 Min AI Pitch</p>
          <h1 className="display mt-3 text-3xl text-ink">{event.title}.</h1>
          <p className="mt-2 text-slate">
            {dateLabel} — {event.venue} — {event.capacity} seats. The public
            signup lives at /pitch.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <EventChecklist event={event} />
            <div>
              <p className="eyebrow text-slate">Capture a myth</p>
              <p className="mb-4 mt-1 text-sm text-slate">
                Heard a myth at the event. Ten seconds now, a long-form post
                later.
              </p>
              <MythQuickAdd />
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <EventRecipeButtons eventId={event.id} />
            <div className="card-glass rounded-card border border-line bg-white p-6">
              <p className="eyebrow text-slate">
                Signups — {signups.length}
              </p>
              {signups.length === 0 ? (
                <p className="mt-2 text-sm text-slate">
                  None yet. Share the /pitch link and the lineup writes itself.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {signups.map((s) => (
                    <li key={s.id} className="text-sm">
                      <span className="font-semibold text-ink">{s.startup}</span>
                      <span className="text-slate"> — {s.name}. {s.idea}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
