// The front page's numbers, derived in one place.
//
// The dashboard used to open with three buttons and a sentence, which told a
// founder what they could do and nothing about where anything stood. This
// works out the handful of figures that answer "how are we doing" across all
// four channels, so the page can lead with the state and keep the buttons.
//
// Everything is derived from the existing stores. Nothing new is written.

import type { Client, PostLogEntry } from "./types.ts";

export interface Stat {
  label: string;
  /** Already formatted — the tile prints it, it does not do arithmetic. */
  value: string;
  /** The supporting line under the number. */
  note: string;
  href: string;
  /** Set only where a number carries state a founder should act on. */
  tone?: "good" | "warn";
  /** Shown beside a toned number, so state is never colour alone. */
  icon?: string;
}

/** Same month and year as the reference date. */
function inMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth();
}

export function postsThisMonth(log: PostLogEntry[], now = new Date()): number {
  return log.filter((p) => inMonth(p.at, now)).length;
}

/**
 * Median engagement across posts that have numbers, or null when too few do.
 *
 * Median rather than mean: one post that happened to travel drags an average
 * far enough that it stops describing a typical week, which is the only thing
 * this number is for.
 */
export function medianEngagement(log: PostLogEntry[]): number | null {
  const rates = log
    .filter((p) => p.stats && p.stats.impressions > 0)
    .map((p) => {
      const s = p.stats!;
      return ((s.reactions + s.comments + s.saves) / s.impressions) * 100;
    })
    .sort((a, b) => a - b);
  // Two samples is a coincidence, not a rate.
  if (rates.length < 3) return null;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 === 0 ? (rates[mid - 1] + rates[mid]) / 2 : rates[mid];
}

/**
 * Compact for the tile: 1,284 stays, 12,900 becomes 12.9k, 45,000 becomes 45k.
 *
 * The trailing zero has to go. A tile reading "45.0k" claims a precision the
 * number does not have and costs two characters to say nothing.
 */
export function compact(n: number): string {
  if (n < 10_000) return n.toLocaleString("en-GB");
  const [value, suffix] =
    n < 1_000_000 ? [n / 1000, "k"] : [n / 1_000_000, "m"];
  const rounded = value < 100 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}${suffix}`;
}

export function euros(n: number): string {
  if (n >= 10_000) return `€${compact(n)}`;
  return `€${n.toLocaleString("en-GB")}`;
}

export interface DashboardInput {
  clients: Client[];
  postLog: PostLogEntry[];
  /** Overdue count from the calendar, already derived there. */
  owed: number;
  /** Null when Linked Helper could not be reached, which is not the same as zero. */
  queued: number | null;
  running: number | null;
  /** Null when no page has been audited yet. */
  siteScore: number | null;
  pages: number;
  drafts: number;
  awaitingApproval: number;
}

export function buildStats(input: DashboardInput, now = new Date()): Stat[] {
  const inPlay = input.clients
    .filter((c) => c.stage === "lead" || c.stage === "talking" || c.stage === "proposal")
    .reduce((sum, c) => sum + (c.value ?? 0), 0);
  const talking = input.clients.filter(
    (c) => c.stage === "talking" || c.stage === "proposal",
  ).length;
  const posts = postsThisMonth(input.postLog, now);
  const rate = medianEngagement(input.postLog);

  return [
    {
      label: "In play",
      value: euros(inPlay),
      note:
        input.clients.length === 0
          ? "Nobody in the book yet"
          : `${talking} in a live conversation, ${input.clients.length} in the book`,
      href: "/clients",
    },
    {
      label: "Queued on LinkedIn",
      // Unreachable is its own answer. A dash is honest where a 0 would lie.
      value: input.queued === null ? "—" : compact(input.queued),
      note:
        input.queued === null
          ? "Linked Helper is out of reach"
          : `${input.running ?? 0} campaign${input.running === 1 ? "" : "s"} running`,
      href: "/campaigns",
    },
    {
      label: "Posted this month",
      value: String(posts),
      note:
        rate === null
          ? `${input.awaitingApproval} drafts waiting on you`
          : `${rate.toFixed(1)}% typical engagement`,
      href: "/library",
    },
    {
      label: "Site score",
      value: input.siteScore === null ? "—" : String(input.siteScore),
      note:
        input.siteScore === null
          ? "No page has been checked yet"
          : `across ${input.pages} pages, out of 100`,
      href: "/seo",
    },
    {
      label: "Owed a reply",
      value: String(input.owed),
      note: input.owed === 0 ? "Nothing is late" : "Follow-ups past their date",
      tone: input.owed === 0 ? "good" : "warn",
      icon: input.owed === 0 ? "IconApproved" : "IconEscalate",
      href: "/calendar",
    },
  ];
}
