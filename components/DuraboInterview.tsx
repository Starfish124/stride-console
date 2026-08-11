"use client";

import { useEffect, useState } from "react";
import type { CardStep } from "@/lib/durabo/parse";
import type { LiveInterview } from "@/lib/durabo/io";
import { DuraboRecorder } from "@/components/DuraboRecorder";

// One interview, live: the 40-minute field card as a tickable checklist with
// the clock running against each step's cumulative budget, the prep brief,
// and typed notes that land in the discovery repo. Polls every 5s so the
// other phone sees the same state.

type Tab = "kaart" | "prep" | "notities" | "opname";

export function DuraboInterview({
  slug,
  steps,
  initialLive,
  initialNotes,
  initialTranscript,
  prepHtml,
}: {
  slug: string;
  steps: CardStep[];
  initialLive: LiveInterview;
  initialNotes: string;
  initialTranscript: string;
  prepHtml: string;
}) {
  const [live, setLive] = useState(initialLive);
  const [notes, setNotes] = useState(initialNotes);
  const [transcript, setTranscript] = useState(initialTranscript);
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
        // The recording phone has fresher text from its own uploads; never
        // let a stale poll shrink the transcript under it.
        if (typeof data.transcript === "string")
          setTranscript((cur) => (data.transcript.length > cur.length ? data.transcript : cur));
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
    if (res.ok) {
      const data = await res.json();
      setLive(data.live);
      if (typeof data.notes === "string") setNotes(data.notes);
    }
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
    `rounded-full px-3 py-1.5 text-sm ${tab === t ? "bg-ink text-white" : "text-slate"}`;

  // The notes file is a title line plus one bold-stamped block per note.
  // Split on the stamps so each note can be shown — and removed — on its own.
  const noteBlocks = notes
    .split(/\n(?=\*\*)/)
    .map((b) => b.replace(/^#[^\n]*\n?/, "").trim())
    .filter(Boolean);

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
          <>
            <button
              className="pressable rounded-full border border-line px-3 py-2 text-sm font-medium text-amber disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (confirm("Interview stoppen? De klok bevriest en het rooster zegt 'gestopt'.")) {
                  void act({ action: "stop" });
                }
              }}
            >
              Stop
            </button>
            <button
              className="pressable rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => void act({ action: "finish" })}
            >
              Rond af
            </button>
          </>
        )}
      </div>

      {/* What happened, and the ways to say otherwise. Only the states that
          make sense right now are offered: a no-show before the clock ran,
          a redo once anything is on the record. Notes stay — opnieuw wist de
          klok en de vinkjes, niet wat er is opgeschreven. */}
      {!running && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {live.status === "gestopt" && <span className="rounded-full bg-amber/15 px-2.5 py-1 text-xs text-amber">gestopt</span>}
          {live.status === "niet-verschenen" && <span className="rounded-full bg-line/40 px-2.5 py-1 text-xs text-slate">niet verschenen</span>}
          {!live.startedAt && live.status !== "niet-verschenen" && (
            <button
              className="pressable rounded-full border border-line px-3 py-1.5 text-xs text-slate disabled:opacity-50"
              disabled={busy}
              onClick={() => void act({ action: "status", status: "niet-verschenen" })}
            >
              Niet verschenen
            </button>
          )}
          {(live.startedAt || live.status) && (
            <button
              className="pressable rounded-full border border-line px-3 py-1.5 text-xs text-slate disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (confirm("Opnieuw beginnen? Klok, vinkjes en status gaan terug naar nul. Notities blijven staan.")) {
                  void act({ action: "reset" });
                }
              }}
            >
              Opnieuw
            </button>
          )}
        </div>
      )}

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
        <button className={tabBtn("opname")} onClick={() => setTab("opname")}>
          Opname
        </button>
      </div>

      {/* Mounted whatever the tab, only hidden — unmounting kills the recorder. */}
      <div className={tab === "opname" ? "" : "hidden"}>
        <DuraboRecorder slug={slug} transcript={transcript} onTranscript={setTranscript} />
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
          {noteBlocks.length > 0 ? (
            <ul className="inset-group">
              {noteBlocks.map((block, i) => (
                <li key={i} className="flex items-start gap-2 px-4 py-3">
                  <pre className="min-w-0 flex-1 whitespace-pre-wrap font-sans text-sm text-ink">{block}</pre>
                  <button
                    type="button"
                    title="Verwijder deze notitie"
                    className="pressable -mr-1 shrink-0 rounded px-1.5 py-0.5 text-sm text-mute hover:text-amber disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Deze notitie verwijderen? Ook uit de repo.")) {
                        void act({ action: "unnote", text: block });
                      }
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">Nog geen notities voor vandaag.</p>
          )}
        </div>
      )}
    </div>
  );
}
