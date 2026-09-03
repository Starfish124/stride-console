"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "@/lib/outreach/lint";
import type { Touch } from "@/lib/outreach/touch";
import type { QueueCounts } from "@/lib/outreach/queue";

/**
 * The LinkedIn queue: one message, one person, one thumb.
 *
 * This is the whole of the assisted model on screen. The console writes the
 * words, checks them against the voice gate, holds the caps and keeps the
 * ledger; a founder does the ten seconds LinkedIn will not let a machine do
 * safely. Copy, open the profile, paste, send, mark it.
 *
 * "Sent." is a claim, not an observation — nothing here can see LinkedIn — so
 * the button says what it does and the footnote says what it does not.
 */
export function TouchQueue({
  touches,
  counts,
  now,
}: {
  touches: Touch[];
  counts: QueueCounts;
  /**
   * The server's clock, as an ISO string.
   *
   * Passed in rather than read here so the render stays pure and the age of a
   * touch is the same on the server and in the browser. Reading Date.now()
   * during render is both a React purity violation and a hydration mismatch
   * waiting to happen.
   */
  now: string;
}) {
  const renderedAt = new Date(now).getTime();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function copy(touch: Touch) {
    await navigator.clipboard.writeText(touch.text);
    setCopied(touch.id);
    setTimeout(() => setCopied((c) => (c === touch.id ? null : c)), 2000);
  }

  async function settle(touch: Touch, action: "done" | "skip") {
    setBusy(touch.id);
    setProblem(null);
    try {
      const res = await fetch("/api/outreach/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: touch.id, action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem(body.error ?? "That did not go through.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const invitesLeft = Math.max(0, counts.invitesPerWeek - counts.invitesSentThisWeek);

  return (
    <section id="queue" className="mb-10 pb-28 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] text-ink">Waiting on you.</h2>
        <p className="tabular text-[13px] text-slate">
          {counts.invitesSentThisWeek} of {counts.invitesPerWeek} invitations sent this week
        </p>
      </div>

      {problem ? (
        <p className="mb-4 rounded-input border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800">
          {problem}
        </p>
      ) : null}

      {touches.length === 0 ? (
        <div className="card-glass rounded-card border border-line bg-white p-5">
          <p className="text-[15px] text-ink">
            Nothing waiting. LinkedIn steps land here when a sequence reaches
            one, at most {counts.invitesPerDay} invitations and{" "}
            {counts.messagesPerDay} messages a day.
          </p>
          <p className="mt-2 text-[13px] text-slate">
            Nothing on this channel sends itself. That is deliberate: a script
            driving linkedin.com breaks LinkedIn&rsquo;s terms and puts the
            account — and the Sales Navigator seat on it — at risk, to save
            about ten seconds a message.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {touches.map((touch) => {
            const limit = LIMITS[touch.kind];
            const length = touch.text.length;
            const over = length > limit.hard;
            const waitingHours = Math.floor(
              (renderedAt - new Date(touch.queuedAt).getTime()) / 3_600_000,
            );

            return (
              <li key={touch.id} className="card-glass rounded-card border border-line bg-white p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15px] font-semibold text-ink">{touch.name}</span>
                  <span className="text-[13px] text-slate">{touch.company}</span>
                  <span className="eyebrow ml-auto text-slate">{limit.label}</span>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                  {touch.text}
                </p>

                <p className="tabular mt-2 text-[12px] text-slate">
                  <span className={over ? "text-red-600" : undefined}>
                    {length} / {limit.hard} characters
                  </span>
                  {waitingHours >= 1 ? ` · waiting ${waitingHours}h` : " · just queued"}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => copy(touch)}
                    className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
                  >
                    {copied === touch.id ? "Copied." : "Copy text."}
                  </button>
                  <a
                    href={`https://${touch.profileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
                  >
                    Open profile.
                  </a>
                  <button
                    onClick={() => settle(touch, "done")}
                    disabled={busy === touch.id}
                    className="rounded-input bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-50"
                  >
                    Sent.
                  </button>
                  <button
                    onClick={() => settle(touch, "skip")}
                    disabled={busy === touch.id}
                    className="rounded-input border border-line px-3 py-1.5 text-sm font-semibold text-slate hover:bg-paper disabled:opacity-50"
                  >
                    Skip.
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {touches.length > 0 ? (
        <p className="mt-4 text-[13px] text-slate">
          &ldquo;Sent.&rdquo; records that you say you sent it and moves the
          sequence on. Nothing here can see LinkedIn, so it is your word that
          goes in the ledger.{" "}
          {invitesLeft === 0
            ? "The weekly invitation cap is spent — stop here."
            : `${invitesLeft} invitation${invitesLeft === 1 ? "" : "s"} left this week.`}
        </p>
      ) : null}

      {/* Phone action bar: the queue is worked from a pocket, so the two
          decisions that matter sit in thumb reach on the first one waiting. */}
      {touches.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl gap-2">
            <button
              onClick={() => copy(touches[0])}
              className="flex-1 rounded-input border border-ink py-3 text-sm font-semibold text-ink"
            >
              {copied === touches[0].id ? "Copied." : "Copy first."}
            </button>
            <a
              href={`https://${touches[0].profileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-input border border-ink py-3 text-center text-sm font-semibold text-ink"
            >
              Open.
            </a>
            <button
              onClick={() => settle(touches[0], "done")}
              disabled={busy === touches[0].id}
              className="flex-1 rounded-input bg-indigo py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Sent.
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
