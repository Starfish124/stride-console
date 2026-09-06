"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface QueuedStep {
  key: string;
  kind: "connect" | "message" | "inmail";
  who: string;
  profileUrl?: string;
  body: string;
  dueAt: string;
}

const LABEL: Record<QueuedStep["kind"], string> = {
  connect: "Connection note",
  message: "Message",
  inmail: "InMail",
};

/** The reasons a founder actually types, as buttons. */
const SKIP_REASONS = ["Not a fit", "Wrong person"];

/**
 * The LinkedIn steps, worked by hand, one at a time.
 *
 * One card because this is a phone loop: copy, switch to LinkedIn, paste, send,
 * come back, mark it. A list of fifteen on a phone is a list you scroll past;
 * one card with a count is a job with an end.
 *
 * Sent and skip are optimistic — the card leaves on the tap. The founder is
 * standing in LinkedIn having already sent the thing, and waiting on a tailnet
 * round trip to admit it is the difference between an instrument and a form. A
 * failed write puts the card back and says why, because a silent revert here
 * reads as "did it record that, and will it write to this person again?"
 *
 * "They replied" is NOT optimistic. It withdraws the whole enrolment, and a
 * lost write there means the sequence keeps messaging somebody who answered —
 * the rudest bug this system can have. That one waits for the server.
 */
export function ManualQueue({ steps }: { steps: QueuedStep[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  // Purely client side, so a server error can never trap somebody on one card.
  const [passed, setPassed] = useState<string[]>([]);

  const [settled, settle] = useOptimistic(
    [] as string[],
    (state, key: string) => [...state, key],
  );

  const left = steps.filter((s) => !settled.includes(s.key) && !passed.includes(s.key));
  const step = left[0];
  const worked = steps.length - left.length;

  function act(key: string, action: "sent" | "skipped" | "replied", why?: string) {
    setNote("");
    startTransition(async () => {
      // Optimistic for the two that only settle one step. Not for a reply.
      if (action !== "replied") settle(key);

      const res = await fetch("/api/salesnav/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action, reason: why }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; already?: boolean };

      if (!res.ok) {
        // The optimistic removal unwinds when the transition ends, so the card
        // comes back on its own — this only has to explain why.
        setNote(json.error ?? "That did not reach the console. The card is still yours to send.");
        return;
      }
      setSkipping(false);
      setReason("");
      if (action === "replied") toast.success("Sequence stopped. They answered.");
      else if (!json.already) toast.success(action === "sent" ? "Marked as sent." : "Skipped.");
      router.refresh();
    });
  }

  async function copy(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Copied.");
      setNote("");
    } catch {
      // Insecure origin, or the browser refused. Copy is the load-bearing step
      // of this whole loop, so it says so where it failed rather than as a
      // toast that vanishes.
      setNote("The browser would not take it. Select the text above and copy it by hand.");
    }
  }

  if (!step) {
    return (
      <p className="text-[15px] text-slate">
        {steps.length === 0
          ? "Nothing waiting. Messages appear here when they come due, already written."
          : "That is all of them. Nothing else is waiting on you."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <article className="rounded-card border border-line bg-white p-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="min-w-0 truncate text-[15px] text-ink">{step.who}</p>
          <p className="shrink-0 font-mono text-[12px] text-slate">{LABEL[step.kind]}</p>
        </div>

        <pre className="mt-3 whitespace-pre-wrap rounded-input border border-line bg-paper px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink">
          {step.body}
        </pre>

        {/* Thumb order: the two taps that do the work, then the answer. */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copy(step.body)}
              className="pressable min-h-[44px] flex-1 rounded-input border border-line px-4 text-[15px] text-ink"
            >
              Copy
            </button>
            {step.profileUrl ? (
              <a
                href={step.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="pressable flex min-h-[44px] flex-1 items-center justify-center rounded-input border border-line px-4 text-[15px] text-ink"
              >
                Open in LinkedIn
              </a>
            ) : null}
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => act(step.key, "sent")}
            className="pressable min-h-[44px] rounded-input bg-ink px-4 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            I sent it
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(step.key, "replied")}
              className="pressable min-h-[44px] flex-1 rounded-input border border-line px-4 text-[14px] text-ink disabled:opacity-50"
            >
              They replied
            </button>
            <button
              type="button"
              onClick={() => setSkipping(!skipping)}
              className="pressable min-h-[44px] flex-1 rounded-input border border-line px-4 text-[14px] text-slate"
            >
              Skip
            </button>
          </div>
        </div>

        {skipping ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            {/* Buttons, because the escape hatch from a card should not need a
                keyboard on a phone. Free text is still there underneath. */}
            <div className="flex flex-wrap gap-2">
              {SKIP_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={pending}
                  onClick={() => act(step.key, "skipped", r)}
                  className="pressable min-h-[44px] rounded-input border border-line px-4 text-[14px] text-ink disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Or say why, in a few words"
                className="min-h-[44px] min-w-0 flex-1 rounded-input border border-line px-3 text-[15px] text-ink"
              />
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() => act(step.key, "skipped", reason)}
                className="pressable min-h-[44px] rounded-input border border-line px-4 text-[14px] text-ink disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate">
          {worked > 0 ? `${worked} of ${steps.length} done` : `${steps.length} waiting`}
        </p>
        {left.length > 1 ? (
          <button
            type="button"
            onClick={() => setPassed((p) => [...p, step.key])}
            className="pressable text-[13px] text-indigo"
          >
            Leave this one, next →
          </button>
        ) : null}
      </div>

      {note ? <p className="text-[13px] text-amber-deep">{note}</p> : null}
    </div>
  );
}
