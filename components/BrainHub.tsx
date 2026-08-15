import Link from "next/link";
import { Mark } from "@/components/Ramp";
import { Radar } from "@/components/ui";

/**
 * The console opens as a brain having thoughts.
 *
 * The mark sits in the middle — the hub the boot animation lands on — inside
 * the brand's radar rings, and around it float the handful of things that
 * actually matter right now: what is waiting, who is in play, what is being
 * built, what is unpaid. Each thought is a link; the orbit is the overview
 * and the navigation at once.
 *
 * Phones do not get an orbit. Six chips circling a logo in 360px of width is
 * a collision, not a brain — below sm they fall into a wrapping row under
 * the mark, which is the same information at a glance-able size.
 */

export interface Thought {
  label: string;
  /** The short bold bit, when there is a number or name to show. */
  value?: string;
  href: string;
}

/** Hand-placed orbit slots (percent offsets from the hub's centre). */
const SLOTS = [
  { left: "18%", top: "14%" },
  { left: "74%", top: "10%" },
  { left: "84%", top: "48%" },
  { left: "70%", top: "82%" },
  { left: "22%", top: "84%" },
  { left: "8%", top: "46%" },
];

export function BrainHub({
  date,
  headline,
  accent,
  thoughts,
}: {
  date: string;
  /** The sentence under the mark, already composed by the page. */
  headline: string;
  /** The word in the headline that gets the accent italic. */
  accent: string;
  thoughts: Thought[];
}) {
  const shown = thoughts.slice(0, SLOTS.length);

  const chip = (t: Thought) => (
    <Link
      key={t.href + t.label}
      href={t.href}
      className="pressable pointer-events-auto flex max-w-56 items-baseline gap-1.5 rounded-full border border-line bg-white/90 px-3.5 py-2 text-[13px] leading-snug shadow-[0_8px_24px_-16px_rgba(10,12,20,0.35)] backdrop-blur hover:border-indigo/30 hover:text-indigo"
    >
      {t.value && <span className="shrink-0 font-mono text-sm font-bold text-ink">{t.value}</span>}
      <span className="truncate font-semibold text-slate">{t.label}</span>
    </Link>
  );

  return (
    <section aria-label="What matters right now" className="relative pb-2 pt-6">
      {/* The orbit. Positioning context for the slots; rings behind it all. */}
      <div className="relative mx-auto hidden h-[400px] max-w-3xl sm:block">
        <Radar className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 text-line" />

        {/* The hub itself: what the boot animation flies into. */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
          <span id="hub-logo" className="text-indigo">
            <Mark size={64} />
          </span>
          <p className="eyebrow mt-4 text-slate">{date}</p>
          <h1 className="title-large mt-1 max-w-xs text-ink">
            {headline.split(accent)[0]}
            <span className="accent">{accent}</span>
            {headline.split(accent)[1]}
          </h1>
        </div>

        {shown.map((t, i) => (
          <div
            key={t.href + t.label}
            className="hub-thought absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: SLOTS[i].left, top: SLOTS[i].top, animationDelay: `${i * 1.1}s` }}
          >
            {chip(t)}
          </div>
        ))}
      </div>

      {/* The same brain, flattened for a phone. */}
      <div className="sm:hidden">
        <div className="flex flex-col items-center pt-4 text-center">
          <span className="text-indigo">
            <Mark size={48} />
          </span>
          <p className="eyebrow mt-3 text-slate">{date}</p>
          <h1 className="title-large mt-1 text-ink">
            {headline.split(accent)[0]}
            <span className="accent">{accent}</span>
            {headline.split(accent)[1]}
          </h1>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{shown.map(chip)}</div>
      </div>
    </section>
  );
}
