import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { AskStride } from "@/components/AskStride";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Team · the model</p>
          <h1 className="title-large mt-3 text-ink">
            Ask it <span className="accent">anything</span>.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            A model running on this Mac, reading the console&apos;s own state. It
            never leaves the machine, and it can only answer from what the
            console actually knows. You can read exactly what it was given
            underneath every answer.
          </p>
        </section>

        <AskStride />
      </main>
    </div>
  );
}
