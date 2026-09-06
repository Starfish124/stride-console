import Link from "next/link";
import { listEvents, listSignups } from "@/lib/store";
import { Header } from "@/components/ui";
import { EventCreateForm } from "@/components/EventCreateForm";
import { DeleteX } from "@/components/DeleteX";
import { PageHeading } from "@/components/WorkspaceUI";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = listEvents();
  const signupCount = listSignups().length;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Growth" title="Events" description="Plan the next 1 Min AI Pitch, keep the checklist moving, and bring people together."/>


        <div className="grid gap-8 md:grid-cols-2">
          <EventCreateForm />

          <div>
            <p className="eyebrow mb-3 text-slate">
              Events — {signupCount} signups in the bank
            </p>
            {events.length === 0 ? (
              <p className="card-glass rounded-card border border-line bg-white p-6 text-sm text-slate">
                No events yet. Create the first one and the checklist starts
                counting down.
              </p>
            ) : (
              <ul className="overflow-hidden card-glass rounded-card border border-line bg-white">
                {events.map((e, i) => {
                  const done = e.checklist.filter((c) => c.done).length;
                  return (
                    <li key={e.id} className={`flex items-center pr-3 ${i > 0 ? "border-t border-line" : ""}`}>
                      <Link
                        href={`/events/${e.id}`}
                        className="flex flex-1 items-center gap-4 px-5 py-4 hover:bg-paper"
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
                      <DeleteX
                        url={`/api/events?id=${encodeURIComponent(e.id)}`}
                        ask={`Delete "${e.title}"? The checklist goes with it; signups stay in the bank.`}
                        label="Delete this event"
                      />
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
