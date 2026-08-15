"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SCOUT_CATEGORIES,
  SCOUT_CATEGORY_LABELS,
  SCOUT_STATUSES,
  SCOUT_STATUS_LABELS,
  scoutScore,
  type ScoutCategory,
  type ScoutCriteria,
  type ScoutEvent,
} from "@/lib/types";
import { DeleteX } from "@/components/DeleteX";

/**
 * The scout board: every event we might attend, ranked by one number.
 *
 * The ranking is the whole point. Two founders cannot go to everything, so the
 * list is sorted by the rubric score and the score is recomputed live as the
 * sliders move — the board should always answer "which one, if we can only do
 * one" without anyone doing arithmetic. Past and skipped events drop to the
 * bottom rather than deleting themselves: "we skipped that fair last year" is
 * an answer someone will want.
 */

const CRITERIA: { key: keyof ScoutCriteria; label: string; hint: string }[] = [
  { key: "audienceFit", label: "Audience", hint: "Are our buyers in the room?" },
  { key: "leadPotential", label: "Leads", hint: "Conversations that can become clients" },
  { key: "visibility", label: "Visibility", hint: "Speak, demo, or work the floor" },
  { key: "affordability", label: "Cost fit", hint: "5 = cheap and close" },
];

const CATEGORY_TONE: Record<ScoutCategory, string> = {
  ai: "bg-indigo/10 text-indigo",
  retail: "bg-amber/15 text-amber",
  tech: "bg-violet/10 text-violet",
  business: "bg-lime/15 text-lime",
  other: "bg-line/60 text-slate",
};

/** The score, painted like a verdict: green go, amber maybe, grey pass. */
function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 3.8 ? "bg-lime/20 text-ink" : value >= 2.8 ? "bg-amber/20 text-ink" : "bg-line/50 text-slate";
  return (
    <span
      title="Fit score, 0–5: audience ×0.35, leads ×0.30, visibility ×0.20, cost ×0.15"
      className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${tone}`}
    >
      {value.toFixed(1)}
    </span>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Upcoming (or undated) and still in play sorts by score; the rest sinks. */
function isLive(e: ScoutEvent): boolean {
  const past = (e.endDate ?? e.date) !== undefined && (e.endDate ?? e.date)! < today();
  return !past && e.status !== "skipped" && e.status !== "attended";
}

function CriteriaSliders({
  value,
  onChange,
  compact,
}: {
  value: ScoutCriteria;
  onChange: (next: Partial<ScoutCriteria>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-x-4 gap-y-1 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
      {CRITERIA.map(({ key, label, hint }) => (
        <label key={key} title={hint} className="flex items-center gap-2 text-xs text-slate">
          <span className="w-14 shrink-0">{label}</span>
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={value[key]}
            onChange={(ev) => onChange({ [key]: Number(ev.target.value) })}
            className="w-full accent-indigo"
          />
          <span className="w-3 shrink-0 text-right tabular-nums text-ink">{value[key]}</span>
        </label>
      ))}
    </div>
  );
}

function AddForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [cat, setCat] = useState<ScoutCategory>("ai");
  const [crit, setCrit] = useState<ScoutCriteria>({
    audienceFit: 3,
    leadPotential: 3,
    visibility: 3,
    affordability: 3,
  });
  const [busy, setBusy] = useState(false);

  const field =
    "w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-indigo/40";

  return (
    <form
      className="mt-4 space-y-3 rounded-card border border-line bg-white p-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        const res = await fetch("/api/scout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            url,
            date: date || undefined,
            location,
            cost,
            notes,
            category: cat,
            criteria: crit,
          }),
        });
        setBusy(false);
        if (res.ok) {
          done();
          router.refresh();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" aria-label="Event name" className={field} autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Event website" className={field} />
        <input type="date" aria-label="Event date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / venue" aria-label="Location" className={field} />
        <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost — €450 ticket, free, …" aria-label="Cost" className={field} />
        <select value={cat} onChange={(e) => setCat(e.target.value as ScoutCategory)} className={field}>
          {SCOUT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SCOUT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Why this one — who is there, what we would do"
        rows={2}
        className={field}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-64 flex-1">
          <CriteriaSliders compact value={crit} onChange={(next) => setCrit((c) => ({ ...c, ...next }))} />
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge value={scoutScore(crit)} />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="pressable rounded-full bg-indigo px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Track it
          </button>
        </div>
      </div>
    </form>
  );
}

function EventCard({ event }: { event: ScoutEvent }) {
  const router = useRouter();
  // Sliders write through on release; the score in the corner updates as they
  // move, so scoring an event feels like turning knobs, not filling a form.
  const [crit, setCrit] = useState<ScoutCriteria>(event.criteria);
  const [saveFailed, setSaveFailed] = useState(false);

  async function patch(body: Record<string, unknown>) {
    let ok = false;
    try {
      const res = await fetch("/api/scout", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, ...body }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (ok) {
      setSaveFailed(false);
      router.refresh();
    } else {
      // A failed save must never masquerade as a slow one: put the sliders
      // back where the disk has them and say what happened.
      setCrit(event.criteria);
      setSaveFailed(true);
    }
  }

  const when = event.date
    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date tbd";

  return (
    <li className="rounded-card border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`eyebrow rounded-full px-2 py-0.5 text-[10px] ${CATEGORY_TONE[event.category]}`}>
              {SCOUT_CATEGORY_LABELS[event.category]}
            </span>
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="display truncate text-lg text-ink underline-offset-2 hover:text-indigo hover:underline"
              >
                {event.name}
              </a>
            ) : (
              <span className="display truncate text-lg text-ink">{event.name}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate">
            {when}
            {event.location ? ` · ${event.location}` : ""}
            {event.cost ? ` · ${event.cost}` : ""}
            {event.by ? ` · added by ${event.by}` : ""}
          </p>
          {event.notes && <p className="mt-1 text-sm text-slate">{event.notes}</p>}
          {saveFailed && (
            <p className="mt-1 text-sm font-semibold text-amber-deep">
              That change did not save. Check the connection and try again.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ScoreBadge value={scoutScore(crit)} />
          <DeleteX url={`/api/scout?id=${event.id}`} ask={`Drop "${event.name}" from the board?`} label="Remove event" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-64 flex-1">
          <CriteriaSliders
            compact
            value={crit}
            onChange={(next) => {
              const merged = { ...crit, ...next };
              setCrit(merged);
              void patch({ criteria: merged });
            }}
          />
        </div>
        <div className="flex gap-1">
          {SCOUT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void patch({ status: s })}
              aria-pressed={event.status === s}
              className={`pressable min-h-[36px] rounded-full px-3 py-1.5 text-xs font-semibold ${
                event.status === s ? "bg-ink text-white" : "bg-line/40 text-slate hover:text-ink"
              }`}
            >
              {SCOUT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

export function EventScout({ events }: { events: ScoutEvent[] }) {
  const [adding, setAdding] = useState(false);

  const live = events.filter(isLive).sort((a, b) => scoutScore(b.criteria) - scoutScore(a.criteria));
  const rest = events
    .filter((e) => !isLive(e))
    .sort((a, b) => (b.endDate ?? b.date ?? "").localeCompare(a.endDate ?? a.date ?? ""));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-slate">
          {live.length} in play · ranked by fit
        </p>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="pressable rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo"
        >
          {adding ? "Close" : "Add event"}
        </button>
      </div>

      {adding && <AddForm done={() => setAdding(false)} />}

      {live.length === 0 && !adding && (
        <div className="mt-6 rounded-card border border-dashed border-line bg-white/60 p-8 text-center text-slate">
          <p className="display text-lg text-ink">Nothing on the radar.</p>
          <p className="mt-1 text-sm">
            Add the next AI meetup, retail fair or founder event — score it in a minute, and the board
            keeps the best bet on top.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {live.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="mt-8">
          <summary className="eyebrow cursor-pointer text-slate">
            Past, attended and skipped ({rest.length})
          </summary>
          <ul className="mt-4 space-y-3">
            {rest.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
