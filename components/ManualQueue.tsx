"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

/**
 * The LinkedIn steps, worked by hand.
 *
 * Copy, open the profile, paste, send, mark it. Ten seconds a touch, and the
 * ten seconds are the point: nothing in this repo clicks Connect, because the
 * account that would get restricted is a founder's own and the Sales Navigator
 * seat hangs off it.
 *
 * Sent is a claim a person makes. Nothing here can see LinkedIn, so the button
 * records what somebody says happened rather than pretending to verify it. So
 * is "They replied", which stops the whole sequence rather than this one step —
 * the inbox webhook only sees email, so a LinkedIn answer is invisible here
 * unless somebody says so, and following up on it would be the rudest bug in
 * the system.
 */
export function ManualQueue({ steps }: { steps: QueuedStep[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState("");
  const [skipping, setSkipping] = useState("");
  const [reason, setReason] = useState("");

  function act(key: string, action: "sent" | "skipped" | "replied", why?: string) {
    setBusy(`${key}:${action}`);
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/salesnav/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action, reason: why }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setBusy("");
      if (!res.ok) {
        setNote(json.error ?? "That did not work.");
        return;
      }
      setSkipping("");
      setReason("");
      router.refresh();
    });
  }

  async function copy(step: QueuedStep) {
    try {
      await navigator.clipboard.writeText(step.body);
      setCopied(step.key);
      setNote("");
    } catch {
      // Insecure origin, or the clipboard refused. The words are on screen
      // either way, so say so rather than failing silently.
      setNote("The browser would not take it. Select the text and copy it.");
    }
  }

  if (steps.length === 0) {
    return (
      <p className="text-[15px] text-slate">
        Nothing waiting. LinkedIn steps appear here when they come due, with the
        words already written.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step) => (
        <article key={step.key} className="rounded-card border border-line bg-white p-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="min-w-0 truncate text-[15px] text-ink">{step.who}</p>
            <p className="shrink-0 font-mono text-[12px] text-slate">{LABEL[step.kind]}</p>
          </div>

          <pre className="mt-3 whitespace-pre-wrap rounded-input border border-line bg-paper px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink">
            {step.body}
          </pre>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(step)}
              className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink"
            >
              {copied === step.key ? "Copied." : "Copy"}
            </button>

            {step.profileUrl ? (
              <a
                href={step.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink"
              >
                Open profile
              </a>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() => act(step.key, "sent")}
              className="pressable rounded-input bg-ink px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy === `${step.key}:sent` ? "Marking." : "I sent it"}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => act(step.key, "replied")}
              className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
            >
              {busy === `${step.key}:replied` ? "Stopping." : "They replied"}
            </button>

            <button
              type="button"
              onClick={() => setSkipping(skipping === step.key ? "" : step.key)}
              className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-slate"
            >
              Skip
            </button>
          </div>

          {skipping === step.key ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why not, in a few words"
                className="min-w-0 flex-1 rounded-input border border-line px-3 py-2 text-[14px] text-ink"
              />
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() => act(step.key, "skipped", reason)}
                className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
              >
                {busy === `${step.key}:skipped` ? "Skipping." : "Skip this step"}
              </button>
            </div>
          ) : null}
        </article>
      ))}

      {note ? <p className="text-[13px] text-amber">{note}</p> : null}
    </div>
  );
}
