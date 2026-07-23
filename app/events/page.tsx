import Link from "next/link";
import { cookies } from "next/headers";
import { listEvents, listSignups } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header } from "@/components/ui";
import { EventCreateForm } from "@/components/EventCreateForm";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;
  const events = listEvents();
  const signupCount = listSignups().length;

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-12">
          <p className="eyebrow text-slate">1 Min AI Pitch</p>
          <h1 className="display mt-3 text-3xl text-ink">The event engine.</h1>
          <p className="mt-2 max-w-lg text-slate">
            One founder, one minute, one idea. Create the event, work the
            checklist, and every stage feeds the content machine.
          </p>
        </section>

        <div className="grid gap-8 md:grid-cols-2">
          <EventCreateForm />

          <div>
            <p className="eyebrow mb-3 text-slate">
              Events — {signupCount} signups in the bank
            </p>
            {events.length === 0 ? (
              <p className="rounded-card border border-line bg-white p-6 text-sm text-slate">
                No events yet. Create the first one and the checklist starts
                counting down.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-card border border-line bg-white">
                {events.map((e, i) => {
                  const done = e.checklist.filter((c) => c.done).length;
                  return (
                    <li key={e.id} className={i > 0 ? "border-t border-line" : ""}>
                      <Link
                        href={`/events/${e.id}`}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-paper"
                      >
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-ink">
                            {e.title}
                          </span>
                          <span className="block text-xs text-slate">
                            {new Date(e.date).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            — {e.venue} — {e.capacity} seats
                          </span>
                        </span>
                        <span className="eyebrow text-indigo">
                          {done}/{e.checklist.length}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
