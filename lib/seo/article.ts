// The article agent.
//
// Takes a brief from the keyword organiser, gathers real source material
// through the console's existing 19-source news pipeline, writes with the
// local Claude CLI, then holds the draft against the long-form voice gate and
// the on-page placement rules until both pass.
//
// The news pipeline is what stops these reading like every other AI blog. A
// model asked to write 1,200 words on "workflow automation" from nothing
// produces a confident summary of its own training data. Given three real
// articles from this week, with the full text attached by the Jina reader, it
// has something specific to say and something to cite.

import { callClaudeCli, writerMode } from "../pipeline/write.ts";
import { enrichItems } from "../pipeline/reader.ts";
import { checkPlacement } from "./audit.ts";
import { formatArticleViolations, lintArticle } from "./lint.ts";
import { newId } from "./store.ts";
import type { SourcedItem } from "../types.ts";
import {
  type ArticleBrief,
  type Locale,
  type PlacementResult,
  type SeoArticle,
} from "./types.ts";

const LANGUAGE: Record<Locale, string> = { en: "English", nl: "Dutch" };

/**
 * Twelve minutes. A 2,500-word pillar article with source material attached
 * does not finish inside the four-minute default the post pipeline uses, and
 * the first live batch proved it by timing out on every attempt.
 */
const ARTICLE_TIMEOUT_MS = 720_000;

/**
 * Source material for a brief. Reuses the console's feeds, filtered to items
 * whose text actually overlaps the brief's keywords, then enriched with full
 * article text for the few that survive.
 */
export async function gatherIntel(
  brief: ArticleBrief,
  options: { max?: number; enrich?: number } = {},
): Promise<SourcedItem[]> {
  const { max = 12, enrich = 3 } = options;

  const terms = [brief.primaryKeyword, ...brief.secondaryKeywords]
    .flatMap((t) => t.split(/\s+/))
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 3);
  const unique = [...new Set(terms)];

  let items: SourcedItem[] = [];
  try {
    // Import lazily: sourcing reaches the network, and a caller that only
    // wants to lint a draft should not pay for feed parsing.
    //
    // previewItems, not pullItems: preview marks nothing as seen, so writing
    // an article never consumes a story the Monday LinkedIn post was going to
    // use. The two pipelines read the same feeds and must not compete.
    const { previewItems } = await import("../pipeline/source.ts");
    const collected = await previewItems(60);
    items = Array.isArray(collected?.items) ? collected.items : [];
  } catch {
    // No feeds reachable. The article still gets written, from the brief
    // alone, and simply carries no source list.
    return [];
  }

  const scored = items
    .map((item) => {
      const hay = `${item.title} ${item.summary ?? ""}`.toLowerCase();
      const hits = unique.filter((t) => hay.includes(t)).length;
      return { item, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.item.score - a.item.score)
    .slice(0, max)
    .map((s) => s.item);

  if (scored.length === 0) return [];

  try {
    // enrichItems attaches full article text in place and returns a count,
    // not the items.
    await enrichItems(scored, enrich);
  } catch {
    // Jina unreachable. Headlines and summaries are still real source material.
  }
  return scored;
}

function sourceBlock(items: SourcedItem[]): string {
  if (items.length === 0) {
    return "No current source material was available. Write from the brief. Do not invent statistics, studies, or client results.";
  }
  return items
    .map((i, n) =>
      [
        `[${n + 1}] ${i.title}`,
        `    source: ${i.source}`,
        `    url: ${i.url}`,
        i.publishedAt ? `    published: ${i.publishedAt}` : undefined,
        i.summary ? `    summary: ${i.summary}` : undefined,
        i.content ? `    full text: ${i.content.slice(0, 4000)}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function buildArticlePrompt(brief: ArticleBrief, items: SourcedItem[]): string {
  const lang = LANGUAGE[brief.locale];

  return `You write for Stride AI, an AI consultancy in the Netherlands run by two people who build the systems themselves. You are writing one article.

LANGUAGE: ${lang}. Write the entire article, including the title and description, in ${lang} only.

THE BRIEF
Primary keyword, which the article must genuinely be about: "${brief.primaryKeyword}"
Secondary keywords to cover where they fit naturally: ${brief.secondaryKeywords.join(", ") || "(none)"}
Search intent: ${brief.intent}
Shape: ${brief.template}
Role: ${brief.role === "pillar" ? "pillar article, covers the whole subtopic" : "spoke article, answers one question well"}
Target length: about ${brief.wordCountTarget} words.

REQUIRED PLACEMENT
- The primary keyword appears in the title, in the description, in the first 100 words, and in at least one H2.
- It appears where it helps a reader understand the topic, and nowhere it does not. There is no density target. Repeating it to hit a count is the failure mode, not the goal.
- The keyword is stored lowercase. Capitalise it the way a person writing English would: "AI", not "ai", and a capital at the start of a sentence or heading. Matching is case-insensitive, so correct capitalisation costs you nothing and lowercase "ai" mid-sentence looks like a typo.
- Bend the phrase to fit the sentence. "An AI consultant for a small business will" reads properly; the rigid phrase jammed in unchanged does not. Say it the way you would out loud.
- Do not repeat the keyword as an H2 when the title already says it. Headings say what the section covers.

INTERNAL LINKS
Place each of these as a markdown link inside the body, in a sentence where it belongs:
${brief.internalLinks.map((l) => `- [${l.anchor}](${l.href})`).join("\n") || "- (none)"}

VOICE
Direct, confident, concrete. You are two people who do this work talking to an operator who runs a business. Contractions. It has to pass the read-aloud test.

NEVER, all enforced by a linter that will reject the draft:
- Em dashes and en dashes. Use a full stop, a comma, or a colon.
- These words: delve, leverage, harness, unlock, empower, elevate, foster, embark, tapestry, realm, landscape, game-changer, paradigm, synergy, robust, seamless, holistic, multifaceted, pivotal, cutting-edge, ever-evolving, transformative, revolutionise, utilise, facilitate, journey, navigate the, in today's, fast-paced world, in conclusion, ultimately, moreover, furthermore, additionally.
- Negation pivots: "it's not X, it's Y", "not just X but Y". State the positive claim.
- Verbs of ceremony where "is" belongs: serves as, stands as, boasts a, represents a shift.
- Participle clauses bolted onto a finished sentence: ", highlighting the value of", ", ensuring reliability", ", underscoring our commitment".
- False depth: "the real question is", "at its core", "what really matters", "make no mistake".
- Announced honesty: "let's be honest", "hot take", "unpopular opinion".
- Phantom sources: "studies show", "experts say", "research shows". Name the source or cut the claim.
- Signposting: "let's dive in", "here's what you need to know", "in this article we will".
- Aphorism formulas: "X is the currency of Y", "X is the language of Y".
- A "Challenges", "Conclusion", "Key takeaways" or "Future outlook" section. End on the last concrete point.
- Vague upbeat endings: "the future looks bright", "the possibilities are endless".
- Emoji, exclamation marks, curly quotes, title case in headings, and bullet lists shaped "**Header:** explanation".
- Boosters without a number beside them: significantly, remarkably, substantially, notably.
- Three or more very short sentences in a row.

ALWAYS:
- Sentence case headings, starting at H2. The page renders the title as the H1, so never write one.
- Vary sentence length. Short ones land. Then a longer one that gives the reader room.
- At least one real number, and only numbers you can point at in the source material or that are true by definition.
- Specific beats abstract. "The ops lead who spends 6 hours a week copying invoices" beats "inefficient workflows".
- First person where it is honest: what we built, what we noticed, what surprised us, what we would skip.
- Say the useful thing plainly, including when it is that the reader probably should not buy this yet.

FABRICATION IS THE ONE UNFORGIVABLE ERROR
Do not invent a statistic, a study, a client, a result, a quote, or a date. If you want a number and the sources do not have one, write the sentence without it. Every factual claim must trace to the source material below or be something generally true about how the technology works. Client results in particular: we have not given you any, so there are none to cite.

SOURCE MATERIAL
${sourceBlock(items)}

OUTPUT
Reply with JSON only. No prose before or after it.
{
  "title": "under 60 characters, contains the primary keyword, sentence case",
  "description": "110 to 160 characters, contains the primary keyword, gives a reason to click",
  "body": "the article in markdown, starting at an H2, no H1",
  "sources": [{"title": "...", "url": "...", "publisher": "..."}]
}
The sources array lists only items from the source material that you actually drew on. An empty array is correct if you used none.`;
}

export interface ParsedArticle {
  title: string;
  description: string;
  body: string;
  sources: { title: string; url: string; publisher?: string }[];
}

export function parseArticleJson(raw: string): ParsedArticle | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const o = parsed as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!title || !body) return undefined;

  const sources = Array.isArray(o.sources)
    ? o.sources
        .filter(
          (s): s is { title: string; url: string; publisher?: string } =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as Record<string, unknown>).title === "string" &&
            typeof (s as Record<string, unknown>).url === "string",
        )
        .slice(0, 10)
    : [];

  return { title, description, body, sources };
}

/**
 * Guard against the model citing a URL nobody gave it. A fabricated citation
 * is worse than none: it looks like diligence and survives review because
 * nobody clicks every link.
 */
export function filterSources(
  claimed: { title: string; url: string; publisher?: string }[],
  offered: SourcedItem[],
): { kept: { title: string; url: string; publisher?: string }[]; dropped: string[] } {
  const allowed = new Set(offered.map((i) => i.url));
  const kept: { title: string; url: string; publisher?: string }[] = [];
  const dropped: string[] = [];
  for (const s of claimed) {
    if (allowed.has(s.url)) kept.push(s);
    else dropped.push(s.url);
  }
  return { kept, dropped };
}

function placementFor(brief: ArticleBrief, draft: ParsedArticle): PlacementResult {
  return checkPlacement(brief.primaryKeyword, {
    title: draft.title,
    description: draft.description,
    // The rendered page turns the title into the H1, so the title is what the
    // H1 check must read.
    h1: draft.title,
    slug: brief.suggestedSlug,
    text: draft.body,
    headings: [...draft.body.matchAll(/^#{2,6}\s+(.*)$/gm)].map((m) => m[1]),
  });
}

export interface WriteArticleResult {
  article?: SeoArticle;
  attempts: number;
  failure?: string;
}

/**
 * Write one article for a brief.
 *
 * Up to three passes: write, then rewrite against the exact violations. The
 * loop exists because the linter is deterministic, so telling the model
 * precisely what failed is far more effective than asking it to try harder.
 * A draft that still fails after the last pass is stored anyway, marked with
 * its violations, so a human can see what happened rather than finding an
 * empty queue on Monday.
 */
export async function writeArticle(
  brief: ArticleBrief,
  options: { maxAttempts?: number; now?: Date } = {},
): Promise<WriteArticleResult> {
  const { maxAttempts = 3, now = new Date() } = options;

  const items = await gatherIntel(brief);
  const basePrompt = buildArticlePrompt(brief, items);
  let prompt = basePrompt;
  let last: ParsedArticle | undefined;
  let lastLint = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string;
    try {
      // Long-form needs a bigger budget than the shared default.
      raw = await callClaudeCli(prompt, { timeoutMs: ARTICLE_TIMEOUT_MS });
    } catch (error) {
      return {
        attempts: attempt,
        failure: error instanceof Error ? error.message : String(error),
      };
    }

    const draft = parseArticleJson(raw);
    if (!draft) {
      prompt = `${basePrompt}\n\nYour last reply was not valid JSON. Reply with the JSON object only.`;
      continue;
    }
    last = draft;

    const lintResult = lintArticle(draft.body, {
      minWords: Math.round(brief.wordCountTarget * 0.6),
      maxWords: Math.round(brief.wordCountTarget * 1.8),
    });
    const placement = placementFor(brief, draft);
    lastLint = formatArticleViolations(lintResult);

    const placementProblems = placement.missing.filter((m) => m !== "url slug");

    if (lintResult.ok && placementProblems.length === 0) {
      const { kept, dropped } = filterSources(draft.sources, items);
      return {
        attempts: attempt,
        article: buildArticle(brief, draft, kept, lintResult, placement, now, dropped),
      };
    }

    const notes = [
      lintResult.violations.length > 0 ? `Voice gate violations:\n${lastLint}` : "",
      placementProblems.length > 0
        ? `The primary keyword "${brief.primaryKeyword}" is missing from: ${placementProblems.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    prompt = `${basePrompt}

Your previous draft:
${JSON.stringify({ title: draft.title, description: draft.description, body: draft.body }, null, 2)}

It was rejected. Fix exactly these problems and change nothing else:

${notes}

Reply with the corrected JSON only.`;
  }

  if (!last) return { attempts: maxAttempts, failure: "no parseable draft" };

  // Store the failing draft rather than dropping it. An article that needs a
  // human edit is more useful than a silent gap in the queue.
  const lintResult = lintArticle(last.body, {
    minWords: Math.round(brief.wordCountTarget * 0.6),
    maxWords: Math.round(brief.wordCountTarget * 1.8),
  });
  const placement = placementFor(brief, last);
  const { kept, dropped } = filterSources(last.sources, items);
  return {
    attempts: maxAttempts,
    article: buildArticle(brief, last, kept, lintResult, placement, now, dropped),
    failure: `still failing after ${maxAttempts} attempts`,
  };
}

export function buildArticle(
  brief: ArticleBrief,
  draft: ParsedArticle,
  sources: { title: string; url: string; publisher?: string }[],
  lintResult: ReturnType<typeof lintArticle>,
  placement: PlacementResult,
  now: Date,
  droppedSources: string[],
): SeoArticle {
  const violations = [...lintResult.violations];
  // An article citing nothing is the writer's own memory presented as fact.
  // Four of the Dutch articles reached the site this way; the uurtarief piece
  // invented terms of business inside one of them. The sources are gathered
  // before the draft is written, so having none is a failure of the draft, not
  // a fact about the world.
  if (sources.length === 0) {
    violations.push({
      rule: "uncited",
      severity: "error",
      excerpt: "(the article cites no sources at all)",
      fix: "Cite the source material the brief was researched from, or cut the claims that need one.",
    });
  }
  if (droppedSources.length > 0) {
    violations.push({
      rule: "fabricatedSource",
      severity: "error",
      excerpt: droppedSources.join(", "),
      fix: "These URLs were not in the source material and have been removed from the article.",
    });
  }

  return {
    id: newId("art"),
    briefId: brief.id,
    slug: brief.suggestedSlug,
    locale: brief.locale,
    title: draft.title,
    description: draft.description,
    body: draft.body,
    primaryKeyword: brief.primaryKeyword,
    secondaryKeywords: brief.secondaryKeywords,
    cluster: brief.clusterId,
    role: brief.role,
    internalLinks: brief.internalLinks,
    sources,
    wordCount: draft.body.split(/\s+/).filter(Boolean).length,
    status: "drafted",
    lint: {
      errors: violations.filter((v) => v.severity === "error").length,
      warns: violations.filter((v) => v.severity === "warn").length,
      violations,
    },
    placement,
    createdAt: now.toISOString(),
    writerMode: writerMode(),
  };
}
