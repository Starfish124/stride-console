import { Header } from "@/components/ui";
import { RadarView } from "@/components/RadarView";

export const dynamic = "force-dynamic";

export default async function RadarPage() {

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <p className="eyebrow text-slate">Radar</p>
          <h1 className="display mt-3 text-4xl text-ink">
            What the machine is reading.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            A live sweep of every source, scored and ranked exactly like a real
            run — without using anything up. The next post still gets every
            story.
          </p>
        </section>
        <RadarView />
      </main>
    </div>
  );
}
