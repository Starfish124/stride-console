// The shared 5-stage runner. Recipes are configs; this is the one pipeline.

import path from "node:path";
import {
  isEventRecipe,
  type Destination,
  type Draft,
  type EventWriteInfo,
  type LintResult,
  type Myth,
  type RecipeId,
  type SourceReportEntry,
  type SourcedItem,
  type WriterOutput,
} from "../types.ts";
import {
  RENDERS_DIR,
  getEvent,
  listDrafts,
  listSignups,
  newId,
  saveDraft,
} from "../store.ts";
import { isoWeek, sourceMyth, sourceNews, sourceTldr } from "./source.ts";
import {
  apiRewrite,
  apiWrite,
  buildFullPrompt,
  cliRewrite,
  cliWrite,
  templateWrite,
  writerMode,
  type WriteInput,
} from "./write.ts";
import { formatViolations, lint } from "./lint.ts";
import { renderToDir } from "./design.ts";

export function assembleVariant(body: string, hashtags: string[], intro?: string): string {
  const tags = hashtags.slice(0, 3).map((h) => `#${h.replace(/^#/, "")}`);
  const parts = [intro?.trim(), body.trim(), tags.length ? tags.join(" ") : undefined];
  return parts.filter(Boolean).join("\n\n");
}

export function buildVariants(out: WriterOutput): Record<Destination, string> {
  return {
    page: assembleVariant(out.body, out.hashtags),
    founderA: assembleVariant(out.body, out.hashtags, out.founderIntroA),
    founderB: assembleVariant(out.body, out.hashtags, out.founderIntroB),
  };
}

export function lintVariants(
  variants: Record<Destination, string>,
): Record<Destination, LintResult> {
  return {
    page: lint(variants.page),
    founderA: lint(variants.founderA),
    founderB: lint(variants.founderB),
  };
}

async function writeStage(
  recipe: RecipeId,
  input: WriteInput,
): Promise<{ out: WriterOutput; needsPolish: boolean }> {
  const mode = writerMode();
  if (mode === "template") {
    return { out: templateWrite(recipe, input), needsPolish: true };
  }
  const write = mode === "subscription" ? cliWrite : apiWrite;
  const rewrite = mode === "subscription" ? cliRewrite : apiRewrite;
  let out: WriterOutput;
  try {
    out = await write(recipe, input);
  } catch {
    // A dead CLI or API never breaks the button — fall back to the template.
    return { out: templateWrite(recipe, input), needsPolish: true };
  }
  // Auto-fix loop: one rewrite pass with the exact violations listed.
  const firstLint = lint(assembleVariant(out.body, out.hashtags));
  if (!firstLint.ok) {
    out = await rewrite(recipe, input, out, formatViolations(firstLint));
  }
  return { out, needsPolish: false };
}

/** Event recipes source from the event record and the signup list. No network. */
function eventWriteInfo(eventId: string | undefined): EventWriteInfo | undefined {
  const event = eventId ? getEvent(eventId) : undefined;
  if (!event) return undefined;
  return {
    title: event.title,
    date: event.date,
    venue: event.venue,
    capacity: event.capacity,
    signups: listSignups().map((s) => ({
      name: s.name,
      startup: s.startup,
      idea: s.idea,
    })),
  };
}

const WEEK_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

/** Event posts are the promo slice, about 1 in 10. Warn on the third of a week. */
function promoWarningFor(recipe: RecipeId, weekNumber: number): string | undefined {
  if (!isEventRecipe(recipe)) return undefined;
  const thisWeek = listDrafts().filter(
    (d) =>
      d.weekNumber === weekNumber &&
      Math.abs(Date.now() - Date.parse(d.createdAt)) < WEEK_WINDOW_MS,
  ).length;
  if (thisWeek < 2) return undefined;
  return `This would be post ${thisWeek + 1} for week ${weekNumber}. Event posts are the promo slice, about 1 in 10. Consider holding it for next week.`;
}

export async function runRecipe(
  recipe: RecipeId,
  opts?: { eventId?: string },
): Promise<Draft> {
  // Stage 1 — source.
  let items: SourcedItem[] = [];
  let myth: Myth | undefined;
  let event: EventWriteInfo | undefined;
  let report: SourceReportEntry[] = [];
  if (recipe === "tldr") {
    ({ items, report } = await sourceTldr());
  } else if (recipe === "news") {
    ({ items, report } = await sourceNews());
  } else if (isEventRecipe(recipe)) {
    event = eventWriteInfo(opts?.eventId);
    if (!event) {
      throw new Error("Pick an event first. Event recipes run from the event page.");
    }
  } else {
    ({ myth } = sourceMyth());
    if (!myth) {
      throw new Error("The myth bank is empty. Add a myth on the dashboard first.");
    }
  }
  if ((recipe === "tldr" || recipe === "news") && items.length === 0) {
    throw new Error(
      "No fresh items survived sourcing. Check the sources on the settings page.",
    );
  }

  const weekNumber = isoWeek();
  const promoWarning = promoWarningFor(recipe, weekNumber);
  const input: WriteInput = { items, myth, event, weekNumber };

  // Stage 2 — write (+ stage 3 auto-fix loop inside).
  const { out, needsPolish } = await writeStage(recipe, input);

  // Stage 3 — voice gate on every destination variant.
  const variants = buildVariants(out);
  const lintResults = lintVariants(variants);

  const draft: Draft = {
    id: newId("draft"),
    recipe,
    createdAt: new Date().toISOString(),
    status: "draft",
    needsPolish,
    claudePrompt: needsPolish ? buildFullPrompt(recipe, input) : undefined,
    variants,
    hashtags: out.hashtags,
    imageHeadline: out.imageHeadline,
    imageStat: out.imageStat,
    slides: out.slides,
    items,
    mythId: myth?.id,
    eventId: opts?.eventId,
    promoWarning,
    weekNumber,
    lint: lintResults,
    renders: { images: [] },
    posted: [],
    sourceReport: report,
  };

  // Stage 4 — design. A render failure never loses the text.
  try {
    draft.renders = await renderDraft(draft);
  } catch (err) {
    draft.renders = {
      images: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  saveDraft(draft);
  return draft;
}

export async function renderDraft(draft: Draft) {
  const mythSeq =
    draft.recipe === "myth"
      ? listDrafts().filter((d) => d.recipe === "myth" && d.id !== draft.id).length + 1
      : undefined;
  const event = draft.eventId ? getEvent(draft.eventId) : undefined;
  const dateLabel = event
    ? new Date(event.date)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        .toUpperCase()
    : undefined;
  return renderToDir(
    {
      recipe: draft.recipe,
      weekNumber: draft.weekNumber,
      titles: draft.items.map((i) => i.title),
      imageHeadline: draft.imageHeadline,
      imageStat: draft.imageStat,
      slides: draft.slides,
      mythSeq,
      dateLabel,
    },
    path.join(RENDERS_DIR, draft.id),
  );
}

/** Re-run write + lint + design on an existing draft, keeping its sourced items. */
export async function regenerateDraft(draft: Draft): Promise<Draft> {
  const input: WriteInput = {
    items: draft.items,
    myth: draft.mythId
      ? { id: draft.mythId, text: extractMythText(draft), addedAt: "", used: true }
      : undefined,
    event: eventWriteInfo(draft.eventId),
    weekNumber: draft.weekNumber,
  };
  const { out, needsPolish } = await writeStage(draft.recipe, input);
  draft.variants = buildVariants(out);
  draft.hashtags = out.hashtags;
  draft.imageHeadline = out.imageHeadline;
  draft.imageStat = out.imageStat;
  draft.slides = out.slides ?? draft.slides;
  draft.lint = lintVariants(draft.variants);
  draft.needsPolish = needsPolish;
  draft.claudePrompt = needsPolish ? buildFullPrompt(draft.recipe, input) : undefined;
  draft.status = "draft";
  try {
    draft.renders = await renderDraft(draft);
  } catch (err) {
    draft.renders = {
      images: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  saveDraft(draft);
  return draft;
}

function extractMythText(draft: Draft): string {
  // The first slide's myth is the original myth statement.
  return draft.slides?.[0]?.myth ?? "";
}
