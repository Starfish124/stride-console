"use client";

import { useEffect, useState } from "react";
import type { CardStep } from "@/lib/durabo/parse";
import type { LiveInterview } from "@/lib/durabo/io";

// One interview, live: the 40-minute field card as a tickable checklist with
// the clock running against each step's cumulative budget, the prep brief,
// and typed notes that land in the discovery repo. Polls every 5s so the
// other phone sees the same state.

type Tab = "kaart" | "prep" | "notities";

export function DuraboInterview({
  slug,
  steps,
  initialLive,
  initialNotes,
  prepHtml,
}: {
  slug: string;
  steps: CardStep[];
  initialLive: LiveInterview;
  initialNotes: string;
  prepHtml: string;
}) {
  const [live, setLive] = useState(initialLive);
  const [notes, setNotes] = useState(initialNotes);
  const [tab, setTab] = useState<Tab>(live.startedAt && !live.finishedAt ? "kaart" : "prep");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/durabo?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const data = await res.json();
        setLive(data.live);
        setNotes(data.notes);
      } catch {
        // next poll catches up
      }
    }, 5000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [slug]);

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    const res = await fetch("/api/durabo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...body }),
    });
    setBusy(false);
    if (res.ok) setLive((await res.json()).live);
    return res.ok;
  }

  const running = Boolean(live.startedAt) && !live.finishedAt;
  const elapsedMin = live.startedAt
    ? ((live.finishedAt ? Date.parse(live.finishedAt) : now) - Date.parse(live.startedAt)) / 60000
    : 0;
  const mm = String(Math.floor(elapsedMin)).padStart(2, "0");
  const ss = String(Math.floor((elapsedMin * 60) % 60)).padStart(2, "0");
  const ticked = Object.keys(live.checked ?? {}).length;
  const firstOpen = steps.find((s) => !live.checked?.[String(s.num)])?.num;

  const tabBtn = (t: Tab) =>
    `rounded-full px-3 py-1.5 text-sm ${tab === t ? "bg-ink text-paper" : "text-slate"}`;

  return (
    <div>
      {/* clock + controls, sticky so the timer is on screen mid-conversation */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center gap-3 border-b border-line bg-paper/95 px-6 py-3 backdrop-blur">
        <span
          className={`font-mono text-2xl font-semibold tabular-nums ${
            !live.startedAt ? "text-slate" : elapsedMin > 33 ? "text-amber" : "text-ink"
          }`}
        >
          {live.startedAt ? `${mm}:${ss}` : "—:—"}
        </span>
        <span className="text-xs text-slate">
          {ticked}/{steps.length} punten
          {live.by ? ` · ${live.by}` : ""}
          {running && elapsedMin > 40 ? " · over tijd" : ""}
        </span>
        <span className="flex-1" />
        {!running ? (
          <button
            className="pressable rounded-full bg-indigo px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              void act({ action: "start" });
              setTab("kaart");
            }}
          >
            {live.finishedAt ? "Hervat" : "Start interview"}
          </button>
        ) : (
          <button
            className="pressable rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
            disabled={busy}
            onClick={() => void act({ action: "finish" })}
          >
            Rond af
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-1">
        <button className={tabBtn("kaart")} onClick={() => setTab("kaart")}>
          Kaart
        </button>
        <button className={tabBtn("prep")} onClick={() => setTab("prep")}>
          Voorbereiding
        </button>
        <button className={tabBtn("notities")} onClick={() => setTab("notities")}>
          Notities
        </button>
      </div>

      {tab === "kaart" && (
        <div className="space-y-2">
          {steps.map((s) => {
            const key = String(s.num);
            const done = Boolean(live.checked?.[key]);
            const overdue = running && !done && elapsedMin > s.endsBy;
            return (
              <details
                key={s.num}
                open={s.num === firstOpen}
                className="rounded-card border border-line bg-white"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => void act({ action: "check", step: key, on: e.target.checked })}
                    onClick={(e) => e.stopPropagation()}
                    className="size-5 shrink-0 accent-indigo"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${done ? "text-slate line-through" : "text-ink"}`}>
                      {s.num} · {s.title}
                    </span>
                    <span className={`block text-xs ${overdue ? "text-amber" : "text-slate"}`}>
                      {s.minutes} min · klaar vóór min {s.endsBy}
                      {s.flag ? ` · ${s.flag}` : ""}
                    </span>
                  </span>
                </summary>
                <div className="md-doc border-t border-line px-4 py-3" dangerouslySetInnerHTML={{ __html: s.html }} />
              </details>
            );
          })}
        </div>
      )}

      {tab === "prep" && <div className="md-doc" dangerouslySetInnerHTML={{ __html: prepHtml }} />}

      {tab === "notities" && (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              void act({ action: "note", text: draft }).then((ok) => ok && setDraft(""));
            }}
            className="mb-4 flex flex-col gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Notitie — landt met tijd en naam in de repo bij deze persoon."
              className="rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo"
            />
            <button
              className="pressable self-end rounded-full bg-indigo px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy || !draft.trim()}
            >
              Bewaar
            </button>
          </form>
          {notes ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-ink">{notes}</pre>
          ) : (
            <p className="text-sm text-slate">Nog geen notities voor vandaag.</p>
          )}
        </div>
      )}
    </div>
  );
}
