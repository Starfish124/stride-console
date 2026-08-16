"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { railHidden } from "@/components/SideNav";
import { useWakeListener } from "@/components/useWakeListener";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { useWakePref } from "@/lib/ask/wakePref";

/**
 * The always-on ear, mounted once at the root so it runs on every page —
 * and the one place that decides where it must not.
 *
 * Off by default (lib/ask/wakePref.ts), because "the microphone is hot on
 * every page, all the time" is not a default anyone should wake up to
 * having agreed to. A founder turns it on in Settings; this component is
 * just where that preference actually does something.
 *
 * Never runs on a client's own portal page — that is someone outside
 * Stride looking at a page a founder handed them, and it must not become a
 * microphone into their room — nor on login, the pitch page, or a print
 * view, the same set SideNav already hides its rail on.
 */
export function VoiceAmbient() {
  const pathname = usePathname();
  const prefOn = useWakePref();
  const [overlayOpen, setOverlayOpen] = useState(false);

  const hidden = railHidden(pathname) || pathname.startsWith("/portal/");
  // The ambient loop and the overlay's own recording never run at once —
  // one microphone, one consumer at a time.
  const listenerEnabled = prefOn && !hidden && !overlayOpen;

  const onWake = useCallback(() => setOverlayOpen(true), []);
  const { listening, problem } = useWakeListener(listenerEnabled, onWake);

  if (hidden || !prefOn) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-line bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-slate shadow-[0_8px_24px_-16px_rgba(10,12,20,0.35)] backdrop-blur"
        aria-hidden={!listening}
      >
        <span
          className={`size-1.5 rounded-full ${
            problem ? "bg-amber" : listening ? "bg-indigo animate-pulse" : "bg-mute"
          }`}
        />
        {problem ? "Mic blocked" : "Listening for “Stride”"}
      </div>
      <VoiceOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  );
}
