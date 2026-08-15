import { Header } from "@/components/ui";
import { EventScout } from "@/components/EventScout";
import { listScoutEvents } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ScoutPage() {
  const events = listScoutEvents();

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <p className="eyebrow text-slate">Event scout</p>
          <h1 className="display mt-3 text-4xl text-ink">
            Which rooms are worth standing in.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            AI conferences, retail fairs, founder nights — everything we could attend, scored on one
            rubric so the best bet is always on top. Two founders, limited evenings: choose on the
            number, argue about the rest.
          </p>
        </section>
        <EventScout events={events} />
      </main>
    </div>
  );
}
