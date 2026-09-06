import { listClients, listEvents, listPostLog, listSignups } from "@/lib/store";
import { buildCalendar, todayISO } from "@/lib/calendar";
import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
import { CalendarView } from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = todayISO();

  const entries = buildCalendar(
    {
      clients: listClients(),
      events: listEvents(),
      signups: listSignups(),
      postLog: listPostLog(),
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
