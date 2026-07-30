"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The two buttons that matter on the sequencer page.
 *
 * Stopping is one tap, because the moment somebody wants to stop cold email is
 * not the moment to ask them a question. Resuming needs a typed confirmation,
 * because a thumb on a phone must not be able to restart it by accident. That
 * asymmetry is enforced in the route as well as here, so a curl cannot skip it.
 */
export function SalesNavControls({ stopped }: { stopped: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function post(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? "" : (json.error ?? "That did not work.");
  }

  function act(label: string, run: () => Promise<string>) {
    setBusy(label);
    setNote("");
    startTransition(async () => {
      const problem = await run();
      setBusy("");
      setNote(problem);
      if (!problem) {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {stopped ? (
          confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act("resume", () => post("/api/salesnav", { stop: false, confirm: "resume" }))
                }
                className="pressable rounded-input bg-ink px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
              >
                {busy === "resume" ? "Starting." : "Yes, start sending again"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="pressable rounded-input border border-line px-5 py-2.5 text-[15px] text-ink"
              >
                Keep it stopped
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="pressable rounded-input border border-line px-5 py-2.5 text-[15px] font-semibold text-ink"
            >
              Resume sending
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => act("stop", () => post("/api/salesnav", { stop: true }))}
            className="pressable rounded-input bg-ink px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "stop" ? "Stopping." : "Stop all sending"}
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => act("run", () => post("/api/salesnav/run"))}
          className="pressable rounded-input border border-line px-5 py-2.5 text-[15px] text-ink disabled:opacity-50"
        >
          {busy === "run" ? "Running." : "Run now"}
        </button>
      </div>

      {note ? <p className="mt-3 text-[13px] text-amber">{note}</p> : null}
    </div>
  );
}
