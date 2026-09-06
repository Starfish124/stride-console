import { listClients, listEvents, listPostLog, listSignups } from "@/lib/store";
import { readLicenceDays } from "@/lib/channels/linkedHelper";
import { addDays, buildCalendar, todayISO } from "@/lib/calendar";
import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
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


  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Workspace" title="Calendar" description="Follow-ups, events, and deadlines. A clear view of what’s next."/>


        <CalendarView entries={entries} today={today} />
      </main>
    </div>
  );
}
