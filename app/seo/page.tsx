import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { SeoDashboard } from "@/components/SeoDashboard";

export const dynamic = "force-dynamic";

export default function SeoPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Search</p>
          <h1 className="display mt-3 text-4xl text-ink">The site works on itself.</h1>
          <p className="mt-2 max-w-xl text-slate">
            Every night it looks for what people search for across the Netherlands, Belgium,
            Germany and France, and fixes what it can fix safely. Every morning it writes up to
            three articles. Clean ones publish themselves; anything the voice gate flags waits
            here for you.
          </p>
        </section>
        <SeoDashboard />
      </main>
    </div>
  );
}
