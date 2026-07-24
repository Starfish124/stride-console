// The library: every draft ever made, joined with what actually went out.
// Framework-free so Node tests can import it.

import { RECIPE_LABELS, isEventRecipe } from "./types.ts";
import type { Draft, PostLogEntry, RecipeId, DraftStatus } from "./types.ts";

/** Filter chips: the three content recipes stand alone, events fold into one. */
export type RecipeFilter = RecipeId | "all" | "events";

export interface LibraryEntry {
  draft: Draft;
  /** Post-log entries for this draft (one per destination it went out to). */
  postings: PostLogEntry[];
  /** Sum of manually recorded impressions across postings, if any were recorded. */
  impressions?: number;
  reactions?: number;
}

export interface LibrarySummary {
  total: number;
  posted: number;
  approved: number;
  /** Sum over every posting with recorded stats. */
  impressions: number;
  /** Draft id of the best performer by impressions, when stats exist. */
  bestDraftId?: string;
  bestImpressions?: number;
}

/** Join drafts with their post-log entries, newest draft first. */
export function buildLibrary(
  drafts: Draft[],
  postlog: PostLogEntry[],
): LibraryEntry[] {
  const byDraft = new Map<string, PostLogEntry[]>();
  for (const entry of postlog) {
    const list = byDraft.get(entry.draftId) ?? [];
    list.push(entry);
    byDraft.set(entry.draftId, list);
  }
  return [...drafts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((draft) => {
      const postings = byDraft.get(draft.id) ?? [];
      const withStats = postings.filter((p) => p.stats);
      const sum = (pick: (p: PostLogEntry) => number) =>
        withStats.reduce((acc, p) => acc + pick(p), 0);
      return {
        draft,
        postings,
        impressions: withStats.length ? sum((p) => p.stats!.impressions) : undefined,
        reactions: withStats.length ? sum((p) => p.stats!.reactions) : undefined,
      };
    });
}

export function librarySummary(entries: LibraryEntry[]): LibrarySummary {
  const summary: LibrarySummary = {
    total: entries.length,
    posted: entries.filter((e) => e.draft.status === "posted").length,
    approved: entries.filter((e) => e.draft.status === "approved").length,
    impressions: 0,
  };
  for (const entry of entries) {
    if (entry.impressions === undefined) continue;
    summary.impressions += entry.impressions;
    if (
      summary.bestImpressions === undefined ||
      entry.impressions > summary.bestImpressions
    ) {
      summary.bestImpressions = entry.impressions;
      summary.bestDraftId = entry.draft.id;
    }
  }
  return summary;
}

/** "2026-07-23T…" → "July 2026", the library's shelf label. */
export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Case-insensitive match across the post text, hashtags, and recipe label. */
export function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    RECIPE_LABELS[entry.draft.recipe],
    ...Object.values(entry.draft.variants),
    ...entry.draft.hashtags,
    entry.draft.imageHeadline,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function matchesFilters(
  entry: LibraryEntry,
  recipe: RecipeFilter,
  status: DraftStatus | "all",
): boolean {
  if (recipe === "events") {
    if (!isEventRecipe(entry.draft.recipe)) return false;
  } else if (recipe !== "all" && entry.draft.recipe !== recipe) {
    return false;
  }
  if (status !== "all" && entry.draft.status !== status) return false;
  return true;
}
