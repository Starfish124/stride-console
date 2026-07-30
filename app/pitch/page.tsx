import { upcomingEvent } from "@/lib/store";
import { Wordmark } from "@/components/ui";
import { PitchForm } from "./PitchForm";

export const dynamic = "force-dynamic";

/** Public signup page. No auth: the proxy allows /pitch and /api/pitch. */
export default async function PitchPage() {
  const upcoming = upcomingEvent();

  return (
    <div className="min-h-screen bg-paper">
      <main className="relative mx-auto max-w-xl overflow-hidden px-6 pb-20">
        <section className="py-14">
          <Wordmark height={34} />
          <p className="eyebrow mt-8 text-slate">1 Min AI Pitch</p>
          <h1 className="editorial mt-3 text-4xl text-ink">
            One minute. One idea.
          </h1>
          <p className="mt-3 text-slate">
            You get 60 seconds on stage in front of a room of operators and
            investors. No slides, one honest timer, and the conversations after
            the pitches run longer than the pitches.
          </p>
          {upcoming ? (
            <p className="mt-3 text-sm font-semibold text-ink">
              Next edition:{" "}
              {new Date(upcoming.date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}{" "}
              at {upcoming.venue}. {upcoming.capacity} seats.
            </p>
          ) : null}
        </section>
        <PitchForm />
        <p className="mt-6 text-xs text-slate">
          We use your signup to build the lineup and nothing else.
        </p>
      </main>
    </div>
  );
}
