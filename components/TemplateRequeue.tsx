"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Rewriting the queue after the copy changed.
 *
 * The count is in the button on purpose. "Rewrite the queue" is frightening
 * next to a ledger; "rewrite the 14 still waiting" says exactly how far it
 * reaches, and the line underneath says where it stops.
 */
export function TemplateRequeue({ sequenceId, waiting }: { sequenceId: string; waiting: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  if (waiting === 0) {
    return (
      <p className="text-[13px] text-slate">
        Nothing is waiting, so a change to the words applies to everyone from here on.
      </p>
    );
  }

  function requeue() {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/salesnav/requeue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId }),
      });
      const json = (await res.json().catch(() => ({}))) as { dropped?: number; error?: string };
      setNote(
        res.ok
          ? `${json.dropped ?? 0} rewritten. They come back in the new words on the next run.`
          : (json.error ?? "That did not work."),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={requeue}
        className="pressable self-start rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
      >
        {pending ? "Rewriting." : `Rewrite the ${waiting} still waiting`}
      </button>
      <p className="text-[13px] text-slate">
        Only messages nobody has sent yet. Anything already sent stays exactly as it went out.
      </p>
      {note ? <p className="text-[13px] text-ink">{note}</p> : null}
    </div>
  );
}
