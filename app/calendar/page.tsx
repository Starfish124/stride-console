import { listClients, listEvents, listPostLog, listSignups } from "@/lib/store";
import { readLicenceDays } from "@/lib/channels/linkedHelper";
import { addDays, buildCalendar, overdue, todayISO } from "@/lib/calendar";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { CalendarView } from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = todayISO();

  // The licence is the one date on this grid the console does not own, and it
  // is the one that stops everything. A machine that cannot be reached simply
  // contributes no date rather than a wrong one.
  const days = await readLicenceDays().catch(() => null);
  const licenceExpiry = days === null ? undefined : addDays(today, days);

  const entries = buildCalendar(
    {
      clients: listClients(),
      events: listEvents(),
      signups: listSignups(),
      postLog: listPostLog(),
      licenceExpiry,
    },
    today,
  );
  const owed = overdue(entries, today);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Sales · the grid</p>
          <h1 className="title-large mt-3 text-ink">
            {owed.length > 0 ? (
              <>
                <span className="accent">{owed.length}</span>{" "}
                {owed.length === 1 ? "thing is" : "things are"} late.
              </>
            ) : (
              <>Nothing is <span className="accent">late</span>.</>
            )}
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Follow-ups, event prep, signups and what has already gone out. All
            of it read from the rest of the console, so nothing here is a second
            copy that can drift.
          </p>
        </section>

        <CalendarView entries={entries} today={today} />
      </main>
    </div>
  );
}
