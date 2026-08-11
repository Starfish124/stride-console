"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RosterRow } from "@/lib/durabo/parse";
import type { LiveInterview } from "@/lib/durabo/io";

// The interview-day board. Grouped per day, ordered by slot, polled every 5s
// so Sarvesh's phone shows what Jort just ticked and vice versa.

const TONE: Record<string, string> = {
  live: "bg-amber/15 text-amber",
  interviewed: "bg-lime/15 text-lime",
  "artifacts-received": "bg-indigo/15 text-indigo",
  synthesized: "bg-violet/15 text-violet",
  scheduled: "bg-line/40 text-slate",
  excluded: "bg-line/40 text-slate/60",
};

export function DuraboRoster({
  initialRoster,
  initialLive,
}: {
  initialRoster: RosterRow[];
  initialLive: Record<string, LiveInterview>;
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [live, setLive] = useState(initialLive);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/durabo");
        if (!res.ok) return;
        const data = await res.json();
        setRoster(data.roster);
        setLive(data.live);
      } catch {
        // offline moment in the room; the next poll catches up
      }
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const status = (r: RosterRow) => live[r.slug]?.status ?? r.status;
  const scheduled = roster.filter((r) => r.date);
  const days = [...new Set(scheduled.map((r) => r.date))].sort();
  const done = roster.filter((r) => ["interviewed", "artifacts-received", "synthesized"].includes(status(r))).length;
  const excluded = roster.filter((r) => !r.date);

  return (
    <div className="space-y-8">
      <p className="eyebrow text-slate">
        {done} van {scheduled.length} gedaan
      </p>
      {days.map((day) => (
        <section key={day}>
          <h2 className="eyebrow mb-3 text-ink">
            {new Date(`${day}T00:00:00`).toLocaleDateString("nl-NL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <div className="inset-group">
            {scheduled
              .filter((r) => r.date === day)
              .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
              .map((r) => {
                const s = status(r);
                return (
                  <Link
                    key={r.slug}
                    href={`/durabo/${r.slug}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-3"
                  >
                    <span className="w-12 shrink-0 font-mono text-sm text-slate">{r.time}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      <span className="block truncate text-xs text-slate">
                        {r.department}
                        {r.interviewer ? ` · ${r.interviewer}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TONE[s] ?? TONE.scheduled}`}>
                      {s}
                    </span>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
      {excluded.length > 0 && (
        <p className="text-xs text-slate">
          Niet in deze ronde: {excluded.map((r) => `${r.name} (${r.statusNote || r.status})`).join(" · ")}
        </p>
      )}
    </div>
  );
}
