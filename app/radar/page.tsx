import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header, Radar } from "@/components/ui";
import { RadarView } from "@/components/RadarView";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <Radar className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 text-slate opacity-30" />
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
