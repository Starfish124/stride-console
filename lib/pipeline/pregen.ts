// Phase 2 — scheduled pre-generation. The decisions live here as pure functions
// so they can be tested; scripts/pregen.mjs is the thin shell launchd calls.

import { RECIPE_LABELS, type Draft, type RecipeId } from "../types.ts";
import { listDrafts, pushInbox } from "../store.ts";
import { isoWeek } from "./source.ts";
import { runRecipe } from "./run.ts";

/** getDay() index -> recipe. Monday writes the TLDR, Wednesday the news post. */
export const PREGEN_SCHEDULE: Partial<Record<number, RecipeId>> = {
  1: "tldr",
  3: "news",
};

export function recipeForDay(date: Date): RecipeId | undefined {
  return PREGEN_SCHEDULE[date.getDay()];
}

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * True when a draft of this recipe already exists for the ref date's ISO week.
 * The 10-day recency check keeps week 3 of this year from matching week 3 of
 * last year.
 */
export function hasDraftForWeek(
  drafts: Draft[],
  recipe: RecipeId,
  ref: Date = new Date(),
): boolean {
  const week = isoWeek(ref);
  return drafts.some(
    (d) =>
      d.recipe === recipe &&
      d.weekNumber === week &&
      Math.abs(ref.getTime() - Date.parse(d.createdAt)) < TEN_DAYS_MS,
  );
}

export interface PregenResult {
  outcome: "skipped-day" | "skipped-exists" | "created" | "failed";
  recipe?: RecipeId;
  draftId?: string;
  message: string;
}

/** Run the scheduled recipe headlessly. Safe to run twice: one draft per week. */
export async function pregen(
  now: Date = new Date(),
  forcedRecipe?: RecipeId,
): Promise<PregenResult> {
  const recipe = forcedRecipe ?? recipeForDay(now);
  if (!recipe) {
    return {
      outcome: "skipped-day",
      message:
        "Nothing scheduled today. Mondays write the TLDR, Wednesdays the news post.",
    };
  }
  const week = isoWeek(now);
  if (hasDraftForWeek(listDrafts(), recipe, now)) {
    return {
      outcome: "skipped-exists",
      recipe,
      message: `The ${RECIPE_LABELS[recipe]} draft for week ${week} already exists. Nothing to do.`,
    };
  }
  try {
    const draft = await runRecipe(recipe);
    const message = `The ${RECIPE_LABELS[recipe]} draft for week ${draft.weekNumber} is ready to review.`;
    pushInbox({ draftId: draft.id, recipe, message });
    // Phone push, self-hosted. A push failure never fails the pregen run.
    try {
      const { sendToAll } = await import("../push.ts");
      const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
      await sendToAll({
        title: "Stride Console",
        body: `Your ${weekday} ${RECIPE_LABELS[recipe]} is ready to approve.`,
        url: `/drafts/${draft.id}`,
      });
    } catch {
      // No subscriptions or no web-push module: the inbox banner still lands.
    }
    return { outcome: "created", recipe, draftId: draft.id, message };
  } catch (err) {
    return {
      outcome: "failed",
      recipe,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
