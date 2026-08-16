"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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
 * No lines drawn between them — a wire diagram is not what a brain looks
 * like, and a straight line to every chip reads as a diagram, not a mind.
 * What reads as alive instead: the mark itself breathes, continuously, not
 * just during the boot sequence; each thought settles into its slot on its
 * own delay rather than all appearing at once and drifts gently forever
 * after; and — the one motion that IS a line — a thin indigo trace
 * occasionally sweeps once around a bubble's own border, on its own
 * unhurried interval, staggered per chip so the orbit is never all lit at
 * once. Depth comes from pointer parallax — near layers (the mark) move
 * more than far ones (the rings) — a CSS custom property per layer, not a
 * new rendering engine.
 *
 * Phones do not get an orbit, and they do not get the pointer parallax
 * either — six chips circling a logo in 360px of width is a collision, not
 * a brain, and there is no pointer to track on a touch screen anyway. Below
 * sm the thoughts fall into a wrapping row under the mark, which is the
 * same information at a glance-able size.
 */

export interface Thought {
  label: string;
  /** The short bold bit, when there is a number or name to show. */
  value?: string;
  href: string;
}

/** Hand-placed orbit slots (percent offsets from the hub's centre). */
const SLOTS = [
  { x: 18, y: 14 },
  { x: 74, y: 10 },
  { x: 84, y: 48 },
  { x: 70, y: 82 },
  { x: 22, y: 84 },
  { x: 8, y: 46 },
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
  const orbitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit) return;
    // Parallax is a pointer thing. A touch screen has no hover to drive it,
    // and a reduced-motion request means "no", not "a smaller version of
    // yes" — both just leave --tilt-x/y at their CSS default of 0.
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    function onMove(e: MouseEvent) {
      if (frame || !orbit) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = orbit!.getBoundingClientRect();
        const tiltX = (e.clientX - rect.left) / rect.width - 0.5;
        const tiltY = (e.clientY - rect.top) / rect.height - 0.5;
        orbit!.style.setProperty("--tilt-x", String(tiltX));
        orbit!.style.setProperty("--tilt-y", String(tiltY));
      });
    }
    function onLeave() {
      orbit?.style.setProperty("--tilt-x", "0");
      orbit?.style.setProperty("--tilt-y", "0");
    }

    orbit.addEventListener("mousemove", onMove);
    orbit.addEventListener("mouseleave", onLeave);
    return () => {
      orbit.removeEventListener("mousemove", onMove);
      orbit.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

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

  // The border-trace wrapper: an inline-block just big enough to hug the
  // pill inside it, so the halo sits exactly on the chip's own rounded-full
  // outline no matter how long its label runs.
  const haloed = (t: Thought, delaySeconds: number) => (
    <div
      key={t.href + t.label}
      className="hub-halo pointer-events-none inline-block rounded-full"
      style={{ "--halo-delay": `${delaySeconds}s` } as React.CSSProperties}
    >
      {chip(t)}
    </div>
  );

  return (
    <section aria-label="What matters right now" className="relative pb-2 pt-6">
      {/* The orbit. Positioning context for the slots; rings behind it all. */}
      <div ref={orbitRef} className="relative mx-auto hidden h-[400px] max-w-3xl sm:block">
        <Radar
          dot={false}
          className="hub-rings absolute left-1/2 top-1/2 h-[380px] w-[380px] text-line"
        />

        {/* The hub itself: what the boot animation flies into, and what
            keeps breathing after it lands — the one thing on this screen
            that never stops being alive. Nearest layer, so it also carries
            the most of the pointer parallax. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="hub-parallax flex flex-col items-center text-center"
            style={{ "--hub-depth": "11px" } as React.CSSProperties}
          >
            <span id="hub-logo" className="hub-mark-alive text-indigo">
              <Mark size={64} />
            </span>
            <p className="eyebrow mt-4 text-slate">{date}</p>
            <h1 className="title-large mt-1 max-w-xs text-ink">
              {headline.split(accent)[0]}
              <span className="accent">{accent}</span>
              {headline.split(accent)[1]}
            </h1>
          </div>
        </div>

        {shown.map((t, i) => (
          <div
            key={t.href + t.label}
            className="hub-thought absolute"
            style={{
              left: `${SLOTS[i].x}%`,
              top: `${SLOTS[i].y}%`,
              animationDelay: `${i * 130}ms, ${600 + i * 220}ms`,
            }}
          >
            <div className="hub-parallax" style={{ "--hub-depth": `${7 - i * 0.5}px` } as React.CSSProperties}>
              {haloed(t, i * 2.6)}
            </div>
          </div>
        ))}
      </div>

      {/* The same brain, flattened for a phone. */}
      <div className="sm:hidden">
        <div className="flex flex-col items-center pt-4 text-center">
          <span className="hub-mark-alive text-indigo">
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
