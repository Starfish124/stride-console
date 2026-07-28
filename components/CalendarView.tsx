"use client";

import Link from "next/link";
import { useState } from "react";
import {
  byDay,
  monthGrid,
  KIND_LABELS,
  type CalendarEntry,
  type CalendarKind,
} from "@/lib/calendar";

/**
 * A month, and what is owed.
 *
 * The grid is the month; the column beside it is the part that matters —
 * overdue first, then what is coming. A calendar that only draws squares makes
 * you hunt for the one thing you are late on, which is the single question
 * anybody opens a calendar to answer.
 */

const KIND_TONE: Record<CalendarKind, string> = {
  followUp: "bg-indigo",
  event: "bg-lime",
  prep: "bg-violet",
  signup: "bg-signal",
  touch: "bg-mute",
  posted: "bg-slate",
  deadline: "bg-amber",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  entries,
  today,
}: {
  entries: CalendarEntry[];
  today: string;
}) {
  const now = new Date(`${today}T00:00:00Z`);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [picked, setPicked] = useState<string | null>(null);

  const days = byDay(entries);
  const squares = monthGrid(year, month);
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  function shift(by: number) {
    const d = new Date(Date.UTC(year, month + by, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
    setPicked(null);
  }

  const overdueList = entries.filter((e) => e.actionable && e.date < today);
  const ahead = entries.filter((e) => e.date >= today).slice(0, 14);
  // A picked day takes over the column; otherwise it shows what is owed and
  // what is next, which is the view that is right the other 99% of the time.
  const column = picked ? (days.get(picked) ?? []) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="display text-[22px] text-ink">{monthName}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="The month before"
              className="pressable flex size-8 items-center justify-center rounded-full border border-line bg-white text-slate hover:text-indigo"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                setYear(now.getUTCFullYear());
                setMonth(now.getUTCMonth());
                setPicked(null);
              }}
              className="eyebrow rounded-full border border-line bg-white px-3 py-1.5 text-slate hover:text-indigo"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="The month after"
              className="pressable flex size-8 items-center justify-center rounded-full border border-line bg-white text-slate hover:text-indigo"
            >
              ›
            </button>
          </div>
        </div>

        <div className="card-glass overflow-hidden rounded-card border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((d) => (
              <span key={d} className="eyebrow px-1 py-2 text-center text-mute">
                {d.slice(0, 1)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {squares.map((date, i) => {
              const on = days.get(date) ?? [];
              const thisMonth = Number(date.slice(5, 7)) - 1 === month;
              const isToday = date === today;
              const isPicked = date === picked;
              const owed = on.some((e) => e.actionable && e.date < today);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setPicked(isPicked ? null : date)}
                  aria-label={`${date}, ${on.length} things`}
                  className={`relative flex min-h-[62px] flex-col items-center gap-1 border-line pt-1.5 text-center ${
                    i % 7 !== 6 ? "border-r" : ""
                  } ${i >= 7 ? "border-t" : ""} ${
                    isPicked ? "bg-indigo-tint" : on.length > 0 ? "hover:bg-paper" : ""
                  }`}
                >
                  <span
                    className={`tabular flex size-6 items-center justify-center rounded-full text-[12px] ${
                      isToday
                        ? "bg-ink font-semibold text-white"
                        : thisMonth
                          ? "text-ink"
                          : "text-mute/60"
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                  </span>
                  {/* Dots, not counts: at this size a number is unreadable and
                      the only question a square answers is "is there anything". */}
                  <span className="flex flex-wrap justify-center gap-[3px] px-1">
                    {on.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={`size-[5px] rounded-full ${KIND_TONE[e.kind]} ${
                          e.actionable ? "" : "opacity-40"
                        }`}
                      />
                    ))}
                    {on.length > 4 && (
                      <span className="text-[9px] leading-none text-mute">+{on.length - 4}</span>
                    )}
                  </span>
                  {owed && (
                    <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {(Object.keys(KIND_LABELS) as CalendarKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[12px] text-slate">
              <span className={`size-[6px] rounded-full ${KIND_TONE[k]}`} />
              {KIND_LABELS[k]}
            </span>
          ))}
        </div>
      </div>

      <div>
        {column ? (
          <>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="display text-[22px] text-ink">
                {new Date(`${picked}T00:00:00Z`).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h2>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="eyebrow text-slate hover:text-indigo"
              >
                Back
              </button>
            </div>
            {column.length === 0 ? (
              <p className="text-[15px] text-slate">Nothing on this day.</p>
            ) : (
              <EntryList entries={column} today={today} />
            )}
          </>
        ) : (
          <>
            {overdueList.length > 0 && (
              <section className="mb-8">
                <h2 className="display text-[22px] text-amber">Owed.</h2>
                <div className="slant-rule mb-4 mt-2 w-8 text-amber" />
                <EntryList entries={overdueList} today={today} />
              </section>
            )}
            <section>
              <h2 className="display text-[22px] text-ink">What is coming.</h2>
              <div className="slant-rule mb-4 mt-2 w-8 text-indigo" />
              {ahead.length === 0 ? (
                <p className="text-[15px] text-slate">
                  Nothing ahead. Set a next step on a lead and it lands here.
                </p>
              ) : (
                <EntryList entries={ahead} today={today} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function EntryList({ entries, today }: { entries: CalendarEntry[]; today: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((e) => {
        const late = e.actionable && e.date < today;
        const body = (
          <>
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND_TONE[e.kind]}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug text-ink">
                {e.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                {new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
                {e.detail && ` · ${e.detail}`}
              </span>
            </span>
          </>
        );
        const shell = `card-lift flex items-start gap-3 rounded-card border px-4 py-3.5 ${
          late ? "border-amber/40 bg-amber/[0.06]" : "border-line bg-white"
        }`;
        return (
          <li key={e.id}>
            {e.href ? (
              <Link href={e.href} className={shell}>
                {body}
              </Link>
            ) : (
              <div className={shell}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
