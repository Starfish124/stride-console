import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { DuraboRoster } from "@/components/DuraboRoster";
import { readLive, readRoster } from "@/lib/durabo/io";

export const dynamic = "force-dynamic";

export default async function DuraboPage() {
  const roster = readRoster();
  const live = readLive().interviews;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Delivery · Durabo</p>
          <h1 className="title-large mt-3 text-ink">
            Interviewdagen, <span className="accent">live</span>.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            De roster uit de discovery-repo, met wat er nu gebeurt. Tik een
            naam voor de kaart, de voorbereiding en de notities. Beide
            telefoons zien dezelfde stand.
          </p>
        </section>
        <DuraboRoster initialRoster={roster} initialLive={live} />
      </main>
    </div>
  );
}
