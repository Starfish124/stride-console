"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/Ramp";

/**
 * The opening: the mark alone on paper, two slow pulses, then it flies to
 * its seat at the centre of the brain hub and the page is simply there.
 *
 * Once per browser session, not per navigation — coming home from a client
 * hub should not replay the curtain. Honoured exceptions: reduced-motion
 * users skip straight to the page, and if the hub logo cannot be found
 * (some future page shuffle) the overlay just fades rather than flying to
 * a guess.
 *
 * FLIP, hand-rolled: measure where #hub-logo sits, transform this overlay's
 * logo from screen-centre to exactly that rect, fade the sheet behind it,
 * remove the overlay on transitionend. The hub logo underneath is identical
 * pixels, so the handover is invisible.
 */

const KEY = "stride-booted";
const PULSES_MS = 1_700;
const FLY_MS = 650;

export function BootIntro() {
  const [phase, setPhase] = useState<"pulse" | "fly" | "gone">("pulse");
  const logoRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let booted = false;
    try {
      booted = sessionStorage.getItem(KEY) === "1";
    } catch {
      booted = true; // storage blocked: never risk replaying forever
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (booted || reduced) {
      // Direct DOM removal instead of state: this runs once before paint
      // settles, and a render pass here trips the set-state-in-effect rule
      // for no benefit — the node is going away, not re-rendering.
      rootRef.current?.remove();
      return;
    }
    rootRef.current?.style.removeProperty("display");

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        const target = document.getElementById("hub-logo");
        const el = logoRef.current;
        if (target && el) {
          const from = el.getBoundingClientRect();
          const to = target.getBoundingClientRect();
          // Same viewBox, different size: translate centre to centre, scale.
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          el.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          el.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
        }
        setPhase("fly");
        timers.push(
          setTimeout(() => {
            try {
              sessionStorage.setItem(KEY, "1");
            } catch {
              /* storage blocked: the guard above already covers the replay */
            }
            setPhase("gone");
          }, FLY_MS),
        );
      }, PULSES_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase === "gone") return null;

  return (
    // Hidden until the effect confirms this session has not booted yet, so
    // repeat visits never flash the curtain.
    <div ref={rootRef} aria-hidden className="fixed inset-0 z-[60]" style={{ display: "none" }}>
      {/* The sheet and the logo part ways during the fly: the sheet fades to
          reveal the page, the logo stays fully opaque while it travels, so
          the hub mark appearing beneath reads as the same object landing. */}
      <div
        className="absolute inset-0 bg-paper transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ opacity: phase === "fly" ? 0 : 1 }}
      />
      <div
        ref={logoRef}
        className={`absolute left-1/2 top-1/2 -ml-12 -mt-12 text-indigo ${
          phase === "pulse" ? "boot-pulse" : ""
        }`}
      >
        <Mark size={96} />
      </div>
    </div>
  );
}
