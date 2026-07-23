// Phase 2 — feedback memory. Turns manually entered post stats into a handful
// of plain-language lessons that ride along in the writer prompt. Deterministic:
// a lesson only appears when both sides of a comparison have enough samples and
// the gap is real. The analysis is pure; lessons() reads the store.

import {
  RECIPE_LABELS,
  type Destination,
  type Draft,
  type PostLogEntry,
  type RecipeId,
} from "../types.ts";
import { listDrafts, listPostLog } from "../store.ts";

export interface StatSample {
  recipe: RecipeId;
  destination: Destination;
  hook: string;
  length: number;
  impressions: number;
  engagement: number;
  saves: number;
}

/** Join the post log with its drafts; only entries with recorded stats count. */
export function samplesFrom(log: PostLogEntry[], drafts: Draft[]): StatSample[] {
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const samples: StatSample[] = [];
  for (const entry of log) {
    if (!entry.stats) continue;
    const draft = byId.get(entry.draftId);
    if (!draft) continue;
    const text = draft.variants[entry.destination] ?? "";
    samples.push({
      recipe: entry.recipe,
      destination: entry.destination,
      hook: (text.split("\n")[0] ?? "").trim(),
      length: text.length,
      impressions: entry.stats.impressions,
      engagement:
        entry.stats.reactions + entry.stats.comments + entry.stats.saves,
      saves: entry.stats.saves,
    });
  }
  return samples;
}

const MIN_SIDE = 2;
const MIN_GAP = 1.25;

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** avg impressions for both sides when each has enough samples and a real gap. */
function compare(
  a: StatSample[],
  b: StatSample[],
): { a: number; b: number; aWins: boolean } | undefined {
  if (a.length < MIN_SIDE || b.length < MIN_SIDE) return undefined;
  const avgA = avg(a.map((s) => s.impressions));
  const avgB = avg(b.map((s) => s.impressions));
  if (avgA === 0 && avgB === 0) return undefined;
  const hi = Math.max(avgA, avgB);
  const lo = Math.min(avgA, avgB);
  if (lo > 0 && hi / lo < MIN_GAP) return undefined;
  return { a: avgA, b: avgB, aWins: avgA > avgB };
}

/** 3-5 lessons, or fewer while the log is thin. Honest beats plentiful. */
export function lessonsFromSamples(samples: StatSample[]): string[] {
  const lessons: string[] = [];

  // Numbers in the hook.
  const withDigit = samples.filter((s) => /\d/.test(s.hook));
  const withoutDigit = samples.filter((s) => !/\d/.test(s.hook));
  const digitCmp = compare(withDigit, withoutDigit);
  if (digitCmp) {
    lessons.push(
      digitCmp.aWins
        ? `Hooks with a number averaged ${fmt(digitCmp.a)} impressions against ${fmt(digitCmp.b)} without one. Keep a number in the first line.`
        : `Hooks without a number averaged ${fmt(digitCmp.b)} impressions against ${fmt(digitCmp.a)} with one. The claim can carry the first line on its own.`,
    );
  }

  // Strongest recipe.
  const recipes: RecipeId[] = ["tldr", "news", "myth"];
  const perRecipe = recipes
    .map((r) => ({ recipe: r, group: samples.filter((s) => s.recipe === r) }))
    .filter((g) => g.group.length >= MIN_SIDE);
  if (perRecipe.length >= 2) {
    const ranked = perRecipe
      .map((g) => ({ ...g, avg: avg(g.group.map((s) => s.impressions)) }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked[1].avg === 0 || ranked[0].avg / Math.max(1, ranked[1].avg) >= MIN_GAP) {
      lessons.push(
        `${RECIPE_LABELS[ranked[0].recipe]} posts averaged ${fmt(ranked[0].avg)} impressions, the strongest of the formats with enough data.`,
      );
    }
  }

  // Length band.
  const short = samples.filter((s) => s.length <= 1600);
  const long = samples.filter((s) => s.length > 1600);
  const lenCmp = compare(short, long);
  if (lenCmp) {
    lessons.push(
      lenCmp.aWins
        ? `Posts under 1,600 characters averaged ${fmt(lenCmp.a)} impressions against ${fmt(lenCmp.b)} for longer ones. Tighter wins.`
        : `Posts over 1,600 characters averaged ${fmt(lenCmp.b)} impressions against ${fmt(lenCmp.a)} for shorter ones. This audience reads the long ones.`,
    );
  }

  // Founder profiles vs the company page.
  const founder = samples.filter((s) => s.destination !== "page");
  const page = samples.filter((s) => s.destination === "page");
  const destCmp = compare(founder, page);
  if (destCmp) {
    lessons.push(
      destCmp.aWins
        ? `Founder-profile posts averaged ${fmt(destCmp.a)} impressions against ${fmt(destCmp.b)} on the company page. Founder reach carries the machine.`
        : `Company-page posts averaged ${fmt(destCmp.b)} impressions against ${fmt(destCmp.a)} on founder profiles.`,
    );
  }

  // Saves, the strongest signal that an ending earned its line.
  const carousel = samples.filter((s) => s.recipe === "myth");
  const rest = samples.filter((s) => s.recipe !== "myth");
  if (carousel.length >= MIN_SIDE && rest.length >= MIN_SIDE) {
    const a = avg(carousel.map((s) => s.saves));
    const b = avg(rest.map((s) => s.saves));
    if (a >= b * 1.5 && a >= 1) {
      lessons.push(
        `Myth carousels collect ${fmt(a)} saves per post against ${fmt(b)} for the single-image formats. Save-worthy endings earn their line.`,
      );
    }
  }

  return lessons.slice(0, 5);
}

/** The live lessons, from everything recorded so far. */
export function lessons(): string[] {
  return lessonsFromSamples(samplesFrom(listPostLog(), listDrafts()));
}

/** Prompt block appended to the writer prompt. Empty while the log is thin. */
export function lessonsBlock(): string {
  const found = lessons();
  if (found.length === 0) return "";
  return `WHAT OUR OWN NUMBERS TAUGHT US (manually recorded LinkedIn results; the voice guide always wins on conflict):\n${found
    .map((l) => `- ${l}`)
    .join("\n")}`;
}
