"use client";

import { setWakePref, useWakePref } from "@/lib/ask/wakePref";

/**
 * The one switch for "the console is always listening for Stride."
 *
 * Off by default, on this device only — see lib/ask/wakePref.ts.
 */
export function VoiceWakeToggle() {
  const on = useWakePref();

  function toggle() {
    setWakePref(!on);
  }

  return (
    <div className="mt-2 flex items-center gap-4">
      <p className="flex-1 text-sm text-slate">
        {on ? (
          <>
            This browser tab records in short bursts, always, and checks each one
            for the word &ldquo;Stride&rdquo; — whisper.cpp, on this Mac, never a
            cloud speech API. Say it, then ask.
          </>
        ) : (
          <>
            Turn this on and any tab with the console open listens for
            &ldquo;Stride&rdquo; in the background, the same way as the WhatsApp
            group — say it, then ask anything.
          </>
        )}
      </p>
      <button
        onClick={toggle}
        className={`rounded-input px-4 py-2 text-sm font-semibold ${
          on ? "border border-ink text-ink hover:bg-paper" : "bg-indigo text-white hover:bg-indigo-deep"
        }`}
      >
        {on ? "Turn off." : "Turn on."}
      </button>
    </div>
  );
}
