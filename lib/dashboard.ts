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
}

// Deliberately no status tone here. The band reports measures; what is waiting
// on a person is the quick menu's job, and a figure asked to do both ends up
// saying the same thing twice on one screen.

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
  /** Null when no page has been audited yet. */
  siteScore: number | null;
  pages: number;
  drafts: number;
  awaitingApproval: number;
}

/** One destination in the quick menu, with however much work is waiting there. */
export interface QuickTile {
  label: string;
  href: string;
  icon: string;
  /** Null means the number is not knowable right now. Undefined means the
   *  destination is a tool rather than a queue, so it never carries one. */
  count?: number | null;
  /** What the number counts, in two or three words. */
  note: string;
  /** Set only where the count means somebody has to do something. */
  tone?: "good" | "warn";
}

export interface QuickMenuInput {
  replies: number;
  clients: number;
  late: number;
  draftsWaiting: number;
  seoFindings: number;
  toBuild: number;
}

/**
 * The jump-off grid under the numbers.
 *
 * Every tile is somewhere to go and how much is waiting there, which is the
 * pair of facts that decides where a founder taps next. Warn is reserved for
 * counts that mean a person is holding something up — a queue length is not a
 * problem, an unanswered reply is.
 */
export function buildQuickMenu(input: QuickMenuInput): QuickTile[] {
  return [
    {
      label: "Replies",
      href: "/outreach",
      icon: "IconEscalate",
      count: input.replies,
      note: input.replies === 0 ? "all answered" : "waiting on you",
      tone: input.replies > 0 ? "warn" : undefined,
    },
    {
      label: "Clients",
      href: "/clients",
      icon: "IconTeam",
      count: input.clients,
      note: "in the book",
    },
    {
      label: "Calendar",
      href: "/calendar",
      icon: "IconTime",
      count: input.late,
      note: input.late === 0 ? "nothing late" : "past their date",
      tone: input.late > 0 ? "warn" : "good",
    },
    {
      label: "Library",
      href: "/library",
      icon: "IconLayers",
      count: input.draftsWaiting,
      note: input.draftsWaiting === 0 ? "all approved" : "drafts to read",
    },
    {
      label: "Search",
      href: "/seo",
      icon: "IconTrend",
      count: input.seoFindings,
      note: input.seoFindings === 0 ? "nothing serious" : "serious findings",
    },
    {
      label: "Notes",
      href: "/notes",
      icon: "IconBranch",
      count: input.toBuild,
      note: "to build",
    },
    {
      label: "Ask Stride",
      href: "/ask",
      icon: "IconAskStride",
      note: "anything about this",
    },
  ];
}

/**
 * The one figure that costs a round trip to Linked Helper.
 *
 * Split out from the rest so the dashboard can paint without it and let it
 * arrive a moment later. Null means the bridge did not answer, which is not
 * the same as nothing being queued.
 */
export function linkedInStat(queued: number | null, running: number | null): Stat {
  return {
    label: "Queued on LinkedIn",
    // Unreachable is its own answer. A dash is honest where a 0 would lie.
    value: queued === null ? "—" : compact(queued),
    note:
      queued === null
        ? "Linked Helper is out of reach"
        : `${running ?? 0} campaign${running === 1 ? "" : "s"} running`,
    href: "/campaigns",
  };
}

/** The quick menu's Campaigns tile, for the same reason. */
export function campaignsTile(running: number | null): QuickTile {
  return {
    label: "Campaigns",
    href: "/campaigns",
    icon: "IconPipeline",
    count: running,
    note: running === null ? "out of reach" : "running now",
  };
}

export function buildStats(input: DashboardInput, now = new Date()): Stat[] {
  const inPlay = input.clients
    .filter((c) => c.stage === "lead" || c.stage === "talking" || c.stage === "proposal")
    .reduce((sum, c) => sum + (c.value ?? 0), 0);
  const talking = input.clients.filter(
    (c) => c.stage === "talking" || c.stage === "proposal",
  ).length;
  const paying = input.clients.filter((c) => c.stage === "client");
  const won = paying.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const clientCount = paying.length;
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
      label: "Won",
      value: euros(won),
      note: clientCount === 0 ? "No clients yet" : `${clientCount} paying`,
      href: "/clients",
    },
  ];
}
