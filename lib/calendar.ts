// One grid for everything with a date on it.
//
// The console already knows when things happen — it just knows it in six
// different files. This derives a single dated list from them and stores
// nothing of its own, so there is no second copy to fall out of step: move a
// client's next step and the calendar has already moved.
//
// Framework-free, and the derivation is a pure function of what is passed in,
// so the tests can hand it fixtures instead of a filesystem.

import type { Client, Draft, PitchSignup, PostLogEntry, StrideEvent } from "./types.ts";

export type CalendarKind =
  | "followUp"
  | "event"
  | "prep"
  | "signup"
  | "touch"
  | "posted"
  | "deadline";

export interface CalendarEntry {
  id: string;
  /** yyyy-mm-dd. Everything on this grid is a day, not a moment. */
  date: string;
  kind: CalendarKind;
  title: string;
  detail?: string;
  href?: string;
  /** True for things nobody has done yet, which is what the agenda leads with. */
  actionable: boolean;
}

export const KIND_LABELS: Record<CalendarKind, string> = {
  followUp: "Follow up",
  event: "Event",
  prep: "Prep",
  signup: "Signup",
  touch: "Contact",
  posted: "Posted",
  deadline: "Deadline",
};

/** yyyy-mm-dd from anything date-shaped. Empty string when it is not a date. */
export function day(value: string | undefined): string {
  if (!value) return "";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "";
  // Slice the ISO string rather than using local getters: the store writes
  // ISO, the date inputs write yyyy-mm-dd, and both should land on the same
  // square without a timezone turning one of them into the day before.
  return value.length === 10 ? value : new Date(t).toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * n days after a yyyy-mm-dd date.
 *
 * Takes the day rather than reading the clock, so a page that has already
 * decided what "today" is derives every other date from that one decision.
 * Two calls to the clock in one render can straddle midnight, and the pair of
 * dates that comes back cannot both be right.
 */
export function addDays(from: string, n: number): string {
  const t = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(t)) return "";
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

export interface CalendarInput {
  clients?: Client[];
  events?: StrideEvent[];
  signups?: PitchSignup[];
  drafts?: Draft[];
  postLog?: PostLogEntry[];
  /** ISO date the Linked Helper licence lapses, when it is known. */
  licenceExpiry?: string;
}

/**
 * Everything dated, in one list, oldest first.
 *
 * Actionable means nobody has done it yet — a follow-up owed, an event still
 * ahead, an unticked prep item. Things that already happened stay on the grid
 * as history but never nag.
 */
export function buildCalendar(
  input: CalendarInput,
  today: string = todayISO(),
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const c of input.clients ?? []) {
    if (c.nextStep && c.stage !== "past") {
      const date = day(c.nextStep);
      if (date) {
        entries.push({
          id: `followup_${c.id}`,
          date,
          kind: "followUp",
          title: c.nextStepNote ?? `Follow up with ${c.company}`,
          detail: `${c.company} · ${c.name}`,
          href: `/clients/${c.id}`,
          actionable: true,
        });
      }
    }
    for (const t of c.touches) {
      const date = day(t.at);
      if (!date) continue;
      entries.push({
        id: `touch_${t.id}`,
        date,
        kind: "touch",
        title: t.note,
        detail: c.company,
        href: `/clients/${c.id}`,
        actionable: false,
      });
    }
  }

  for (const e of input.events ?? []) {
    const date = day(e.date);
    if (date) {
      entries.push({
        id: `event_${e.id}`,
        date,
        kind: "event",
        title: e.title,
        detail: `${e.venue} · ${e.capacity} places`,
        href: `/events`,
        actionable: date >= today,
      });
    }
    for (const item of e.checklist) {
      const due = day(item.due);
      if (!due) continue;
      entries.push({
        id: `prep_${e.id}_${item.id}`,
        date: due,
        kind: "prep",
        title: item.label,
        detail: e.title,
        href: `/events`,
        actionable: !item.done,
      });
    }
  }

  for (const s of input.signups ?? []) {
    const date = day(s.at);
    if (!date) continue;
    entries.push({
      id: `signup_${s.id}`,
      date,
      kind: "signup",
      title: `${s.name} signed up`,
      detail: s.startup,
      href: "/events",
      actionable: false,
    });
  }

  for (const p of input.postLog ?? []) {
    const date = day(p.at);
    if (!date) continue;
    entries.push({
      id: `posted_${p.draftId}_${p.destination}`,
      date,
      kind: "posted",
      title: "Posted to LinkedIn",
      detail: p.destination,
      href: `/drafts/${p.draftId}`,
      actionable: false,
    });
  }

  const licence = day(input.licenceExpiry);
  if (licence) {
    entries.push({
      id: "deadline_licence",
      date: licence,
      kind: "deadline",
      title: "Linked Helper licence lapses",
      detail: "Everything on LinkedIn stops on this date.",
      href: "/campaigns",
      actionable: licence >= today,
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Group by day, for painting squares. */
export function byDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

/**
 * The squares of one month, padded to whole weeks starting Monday — Dutch
 * calendars start on Monday and both founders are in the Netherlands.
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay is 0 for Sunday; shift so Monday is 0 and Sunday is 6.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - lead));
  const squares: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    squares.push(d.toISOString().slice(0, 10));
    // Stop at the end of the week that contains the last day of the month.
    if (i % 7 === 6 && d.getUTCMonth() !== month && i >= 27) break;
  }
  return squares;
}

/** What is coming, from today, for the agenda beside the grid. */
export function upcoming(
  entries: CalendarEntry[],
  today: string = todayISO(),
  limit = 12,
): CalendarEntry[] {
  return entries.filter((e) => e.date >= today).slice(0, limit);
}

/** Owed and overdue: actionable, and the date has passed. Worst first. */
export function overdue(
  entries: CalendarEntry[],
  today: string = todayISO(),
): CalendarEntry[] {
  return entries.filter((e) => e.actionable && e.date < today);
}
