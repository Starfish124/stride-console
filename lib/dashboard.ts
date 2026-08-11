// The front page's numbers, derived in one place.
//
// The dashboard used to open with three buttons and a sentence, which told a
// founder what they could do and nothing about where anything stood. This
// works out the handful of figures that answer "how are we doing" across all
// four channels, so the page can lead with the state and keep the buttons.
//
// Everything is derived from the existing stores. Nothing new is written.

import type { Client, ClientStage, PostLogEntry } from "./types.ts";
import { STAGE_LABELS } from "./types.ts";

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
  /** Present only while Durabo interview slots fall today or tomorrow. */
  interviews?: { done: number; total: number };
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
  // Interview days outrank everything else on the grid while they last —
  // the tile exists only when input.interviews does, so it removes itself.
  const interviews: QuickTile[] = input.interviews
    ? [
        {
          label: "Durabo",
          href: "/durabo",
          icon: "IconTime",
          count: input.interviews.total - input.interviews.done,
          note:
            input.interviews.total - input.interviews.done === 0
              ? "all interviewed"
              : "interviews to go",
          tone: input.interviews.total - input.interviews.done === 0 ? "good" : "warn",
        },
      ]
    : [];
  return [
    ...interviews,
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

/**
 * A money tile only prints a number when somebody has actually named one.
 *
 * Deal size is optional on a client, because it is only known once it has been
 * said out loud. Summing a book where nobody has quoted yet gives €0, which
 * reads as "we have nothing on" rather than "we have not priced it" — the same
 * lie a 0 tells for an unreachable Linked Helper.
 */
function money(clients: Client[]): string {
  const quoted = clients.filter((c) => typeof c.value === "number");
  if (quoted.length === 0) return "—";
  return euros(quoted.reduce((sum, c) => sum + (c.value ?? 0), 0));
}

// ---------- the deck's own figures ----------

export interface PipelineStage {
  stage: ClientStage;
  label: string;
  count: number;
  /** Already formatted, and an em dash where nobody has quoted yet. */
  value: string;
}

/**
 * The book by stage, for the pipeline panel.
 *
 * Past is left out. It is not a stage of the pipeline, it is what happens
 * after one, and a bar showing it alongside the live stages makes a dead deal
 * look like work in progress.
 */
export function pipelineStages(clients: Client[]): PipelineStage[] {
  const stages: ClientStage[] = ["lead", "talking", "proposal", "client"];
  return stages.map((stage) => {
    const inStage = clients.filter((c) => c.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: inStage.length,
      value: money(inStage),
    };
  });
}

/**
 * Posts per week, oldest first, for the sparkline.
 *
 * A zero here is a real zero: nothing was posted that week. That is a fact
 * rather than an unknown, so the em dash rule does not apply.
 */
export function weeklyPosts(log: PostLogEntry[], weeks = 12, now = new Date()): number[] {
  const week = 7 * 24 * 60 * 60 * 1000;
  const end = now.getTime();
  const start = end - weeks * week;
  const buckets = new Array<number>(weeks).fill(0);

  for (const entry of log) {
    const at = new Date(entry.at).getTime();
    if (Number.isNaN(at) || at <= start || at > end) continue;
    // The newest week is the last bucket, so the line reads left to right.
    const index = weeks - 1 - Math.floor((end - at) / week);
    buckets[Math.min(weeks - 1, Math.max(0, index))] += 1;
  }

  return buckets;
}

/**
 * The sparkline's `points` attribute, in the box the SVG declares.
 *
 * A flat series has no range to scale against, so it draws down the middle
 * rather than dividing by zero or slamming every point to the floor.
 */
export function sparkPoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
      return `${round(i * step)},${round(h - t * h)}`;
    })
    .join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildStats(input: DashboardInput, now = new Date()): Stat[] {
  const open = input.clients.filter(
    (c) => c.stage === "lead" || c.stage === "talking" || c.stage === "proposal",
  );
  const talking = input.clients.filter(
    (c) => c.stage === "talking" || c.stage === "proposal",
  ).length;
  const paying = input.clients.filter((c) => c.stage === "client");
  const clientCount = paying.length;
  const posts = postsThisMonth(input.postLog, now);
  const rate = medianEngagement(input.postLog);

  return [
    {
      label: "In play",
      value: money(open),
      note:
        input.clients.length === 0
          ? "Nobody in the book yet"
          // Short on purpose. A tile in a grid is as tall as the wordiest note
          // in its row, so a sentence here added a line to four tiles that had
          // nothing more to say.
          : `${talking} talking, ${input.clients.length} in the book`,
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
          : `${input.pages} pages, out of 100`,
      href: "/seo",
    },
    {
      label: "Won",
      value: money(paying),
      note: clientCount === 0 ? "No clients yet" : `${clientCount} paying`,
      href: "/clients",
    },
  ];
}
