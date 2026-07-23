// Stage 5 — publishing, copy-open flow. Produces the final per-destination text
// and records who posted what. Nothing ever auto-posts.

import type { Destination, Draft } from "../types.ts";
import { appendPostLog, getDraft, saveDraft } from "../store.ts";

export const LINKEDIN_SHARE_URL = "https://www.linkedin.com/feed/?shareActive=true";

export const DESTINATION_LABELS: Record<Destination, string> = {
  page: "Company page",
  founderA: "Founder A",
  founderB: "Founder B",
};

/** The exact text to paste into LinkedIn for a destination. */
export function finalText(draft: Draft, destination: Destination): string {
  return draft.variants[destination];
}

export function markPosted(
  draftId: string,
  destination: Destination,
  who: string,
): Draft | undefined {
  const draft = getDraft(draftId);
  if (!draft) return undefined;
  const at = new Date().toISOString();
  if (!draft.posted.some((p) => p.destination === destination)) {
    draft.posted.push({ destination, who, at });
  }
  draft.status = "posted";
  saveDraft(draft);
  appendPostLog({ draftId, recipe: draft.recipe, destination, who, at });
  return draft;
}
