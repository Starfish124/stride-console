import Link from "next/link";
import { engineStatus } from "@/lib/salesnav/engine";
import type { EngineState } from "@/lib/salesnav/engine";

/**
 * Whether the engine is actually running.
 *
 * A light, not a settings summary. The failure this exists for is the one that
 * lasted from July to September: everything configured correctly, every page
 * green, and no clock — so nothing was ever queued and nothing said so.
 *
 * "Running" therefore means a heartbeat in the last few minutes, never a
 * correct configuration.
 */
const TONE: Record<EngineState, { dot: string; word: string; text: string }> = {
  running: { dot: "bg-lime", word: "Online", text: "text-lime-deep" },
  idle: { dot: "bg-indigo", word: "Waiting", text: "text-indigo" },
  stopped: { dot: "bg-amber", word: "Stopped", text: "text-amber-deep" },
  "no-clock": { dot: "bg-amber", word: "No clock", text: "text-amber-deep" },
};

export function EngineLight({ now }: { now?: Date }) {
  const status = engineStatus(now);
  const tone = TONE[status.state];

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      <span className={`eyebrow ${tone.text}`}>{tone.word}</span>
      <span className="text-[12px] text-slate">
        {status.detail}
        {status.state === "stopped" ? (
          <>
            {" "}
            <Link href="/salesnav" className="text-indigo underline underline-offset-2">
              Clear it
            </Link>
            .
          </>
        ) : null}
        {status.state === "no-clock" ? (
          <> Run <span className="font-mono text-[11px]">stride install</span>.</>
        ) : null}
      </span>
    </span>
  );
}
