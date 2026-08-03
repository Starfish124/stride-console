// The FAQ layer: the long tail answered on pages that already exist.
//
// The obvious way to chase a thousand long-tail questions is a page each. That
// is the doorway pattern with a question mark on it, and it is what gets a
// domain penalised. The version that works is the opposite shape: take the
// questions people actually ask, group them by the page that already covers the
// subject, and answer them there. Fifty answers on one strong page beat fifty
// thin pages, and an answer block is what an AI assistant quotes when somebody
// asks the question out loud.
//
// Questions come from the keyword store, never from a model's imagination. A
// question nobody was measured asking is not a question worth answering, which
// is the same rule the demand gate runs on.
//
// One thing deliberately NOT claimed: FAQPage rich results. Google restricted
// those to health and government sites, so the stars are not coming. This is for
// readers and for the engines that quote pages, and the schema is emitted
// because it is true, not because it wins a badge.

import fs from "node:fs";
import path from "node:path";
import { callClaudeCli, writerMode } from "../pipeline/write.ts";
import { BANNED_WORDS, phraseRegex } from "../pipeline/lint.ts";
import type { Keyword, Locale } from "./types.ts";

/** A question shape in either language. */
const QUESTION = new RegExp(
  [
    // English
    "^(what|why|how|when|which|who|can|does|do|is|are|should)\\b",
    // Dutch. "Wat kost een chatbot" is a question with no question mark and no
    // auxiliary at the front, so the interrogatives carry it.
    "^(wat|waarom|hoe|wanneer|welke|wie|kan|kun|kunt|moet|is|zijn|heeft)\\b",
  ].join("|"),
  "i",
);

export interface FaqQuestion {
  question: string;
  /** The keyword this came from, so an answer is traceable to real demand. */
  term: string;
  locale: Locale;
  /** Impressions behind it, when Search Console has measured any. */
  impressions?: number;
}

export interface FaqEntry {
  route: string;
  locale: Locale;
  items: { question: string; answer: string }[];
  updatedAt: string;
}

/** Keyed by `route` then locale, which is the shape the website reads. */
export type FaqFile = {
  updatedAt: string;
  entries: FaqEntry[];
};

/**
 * Turn a keyword into the question somebody would type, capitalised and
 * punctuated. "wat kost een ai chatbot" becomes "Wat kost een AI chatbot?".
 *
 * Only the first letter is touched, plus the acronyms this business lives on.
 * Title-casing the whole thing produces "What Is An AI Agent?", which reads
 * like a slide deck and is what makes machine-written FAQs recognisable.
 */
export function asQuestion(term: string): string {
  const cleaned = term.trim().replace(/\s+/g, " ").replace(/\?+$/, "");
  if (!cleaned) return "";
  const acronyms = cleaned
    .replace(/\bai\b/gi, "AI")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bapi\b/gi, "API")
    .replace(/\brpa\b/gi, "RPA")
    .replace(/\bmkb\b/gi, "MKB")
    .replace(/\bmvp\b/gi, "MVP");
  return `${acronyms.charAt(0).toUpperCase()}${acronyms.slice(1)}?`;
}

/**
 * The questions worth answering on a given route.
 *
 * Assigned keywords only: the organiser already decided which page owns which
 * term, and answering "what does an AI consultant cost" on the portfolio page
 * would be putting the answer where nobody asked it.
 *
 * MEASURED demand only, by default, and that was a correction. The first
 * version allowed unmeasured questions on the theory that a paragraph on a page
 * that already ranks is cheap and reversible. Then it was pointed at the real
 * keyword store and proposed putting these on the homepage:
 *
 *   "What is AI agency?"  "How to AI agency?"  "How to start AI agency?"
 *
 * The first is a fragment, the second is not a sentence, and the third is aimed
 * at somebody who wants to BECOME an agency — the audience the whole filter
 * chain exists to keep out. Autocomplete fragments read as questions without
 * being questions, and no amount of prompt care fixes a bad question. So the
 * same rule as everywhere else: something outside this engine has to have seen
 * a person ask it.
 */
export function questionsForRoute(
  keywords: Keyword[],
  route: string,
  locale: Locale,
  limit = 6,
  options: { requireMeasured?: boolean; minImpressions?: number } = {},
): FaqQuestion[] {
  const { requireMeasured = true, minImpressions = 3 } = options;
  return keywords
    .filter((k) => k.assignedRoute === route && k.locale === locale)
    .filter((k) => QUESTION.test(k.term))
    .filter(
      (k) =>
        !requireMeasured ||
        k.discoveredVia === "search-console" ||
        (k.stats?.impressions ?? 0) >= minImpressions,
    )
    .sort(
      (a, b) =>
        (b.stats?.impressions ?? 0) - (a.stats?.impressions ?? 0) ||
        b.opportunity - a.opportunity,
    )
    .slice(0, limit)
    .map((k) => ({
      question: asQuestion(k.term),
      term: k.term,
      locale,
      impressions: k.stats?.impressions,
    }));
}

/**
 * Answers that are safe to publish unread.
 *
 * Short and factual, no marketing, and — the part that matters — no invented
 * specifics. A model asked for an answer about price will name a number if
 * nothing stops it, and a fabricated "from €2,500" on a live consultancy site is
 * a promise somebody has to honour on a call.
 */
export function buildPrompt(questions: FaqQuestion[], locale: Locale): string {
  const language = locale === "nl" ? "Dutch" : "English";
  return `You are answering frequently asked questions for Stride AI, a Dutch AI consultancy that builds chatbots, custom agents and workflow automation for businesses.

Answer each question in ${language}, in 2 to 3 sentences, maximum 55 words. Plain and direct, as one specialist explaining something to a busy client.

Hard rules:
- NEVER invent a price, a percentage, a timeline, a client name or a statistic. If a question asks what something costs, explain what the cost depends on and say it is quoted per project. A number you cannot source is worse than no answer.
- No marketing language. No "cutting-edge", "seamless", "unlock", "empower", "revolutionise", "in today's landscape".
- No rhetorical questions, no "let's be honest", no "at its core".
- Do not open with the question restated.
- Write for a buyer, not a practitioner.

Return ONLY a JSON array, no prose around it, in this exact shape:
[{"question": "...", "answer": "..."}]

Keep the questions verbatim as given. The questions:

${questions.map((q) => `- ${q.question}`).join("\n")}`;
}

/**
 * Parse the model's answer array, keeping only entries that match a question we
 * asked and survive the vocabulary check.
 *
 * Salvages a JSON array out of surrounding prose, because a model told to
 * return only JSON will occasionally explain itself first, and losing an entire
 * page of answers to a preamble is a waste of a call.
 */
export function parseAnswers(
  raw: string,
  asked: FaqQuestion[],
): { items: { question: string; answer: string }[]; rejected: string[] } {
  const wanted = new Map(asked.map((q) => [q.question.toLowerCase(), q.question]));
  const rejected: string[] = [];

  let parsed: unknown;
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return { items: [], rejected: ["the answer was not JSON"] };
  }
  if (!Array.isArray(parsed)) return { items: [], rejected: ["the answer was not a list"] };

  const items: { question: string; answer: string }[] = [];

  for (const row of parsed) {
    const question = typeof (row as { question?: unknown })?.question === "string"
      ? String((row as { question: string }).question).trim()
      : "";
    const answer = typeof (row as { answer?: unknown })?.answer === "string"
      ? String((row as { answer: string }).answer).trim()
      : "";
    if (!question || !answer) continue;

    const canonical = wanted.get(question.toLowerCase());
    if (!canonical) {
      // A question we did not ask is a question nobody was measured asking.
      rejected.push(`not asked: ${question}`);
      continue;
    }
    if (answer.split(/\s+/).length > 90) {
      rejected.push(`too long: ${canonical}`);
      continue;
    }
    // The house vocabulary, shared with every other gate in the console so one
    // edit moves them all.
    const banned = BANNED_WORDS.filter((w) => phraseRegex(w).test(answer));
    if (banned.length > 0) {
      rejected.push(`${canonical}: ${banned.join(", ")}`);
      continue;
    }
    // A number the answer cannot source is the failure mode that matters: a
    // price on a live consultancy site is a promise somebody has to honour.
    if (/(?:€|\$|£)\s?\d|(?:\d+[.,]?\d*)\s?(?:%|procent|percent)/i.test(answer)) {
      rejected.push(`${canonical}: names a figure`);
      continue;
    }

    items.push({ question: canonical, answer });
  }

  return { items, rejected };
}

export interface FaqResult {
  route: string;
  locale: Locale;
  written: number;
  rejected: string[];
  message: string;
}

/**
 * Write the FAQ block for one route. One Claude call for the whole page, not one
 * per question.
 */
export async function answerQuestions(
  questions: FaqQuestion[],
  route: string,
  locale: Locale,
  options: { timeoutMs?: number } = {},
): Promise<{ entry?: FaqEntry; result: FaqResult }> {
  if (questions.length === 0) {
    return {
      result: {
        route,
        locale,
        written: 0,
        rejected: [],
        message: `No questions assigned to ${route} in ${locale}.`,
      },
    };
  }

  const raw = await callClaudeCli(buildPrompt(questions, locale), {
    // Six short answers is nothing like a 2,500-word article, but the default
    // four minutes has been wrong here before.
    timeoutMs: options.timeoutMs ?? 300_000,
  });
  const { items, rejected } = parseAnswers(raw, questions);

  if (items.length === 0) {
    return {
      result: {
        route,
        locale,
        written: 0,
        rejected,
        message: `Nothing usable came back for ${route} (${locale}). ${rejected.length} rejected.`,
      },
    };
  }

  return {
    entry: { route, locale, items, updatedAt: new Date().toISOString() },
    result: {
      route,
      locale,
      written: items.length,
      rejected,
      message: `${items.length} answers for ${route} (${locale})${
        rejected.length > 0 ? `, ${rejected.length} rejected` : ""
      }. Written by ${writerMode()}.`,
    },
  };
}

/** Merge an entry into the file, replacing any previous answers for that route. */
export function mergeEntry(file: FaqFile, entry: FaqEntry): FaqFile {
  return {
    updatedAt: entry.updatedAt,
    entries: [
      ...file.entries.filter((e) => !(e.route === entry.route && e.locale === entry.locale)),
      entry,
    ].sort((a, b) => a.route.localeCompare(b.route) || a.locale.localeCompare(b.locale)),
  };
}

/** Where the website reads its answers from. Agent-owned, like pages.json. */
export function faqFilePath(siteRepo: string): string {
  return path.join(siteRepo, "content", "seo", "faq.json");
}

export function readFaqFile(siteRepo: string): FaqFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(faqFilePath(siteRepo), "utf8")) as FaqFile;
    return Array.isArray(parsed?.entries) ? parsed : { updatedAt: "", entries: [] };
  } catch {
    return { updatedAt: "", entries: [] };
  }
}

export function writeFaqFile(siteRepo: string, file: FaqFile): void {
  const target = faqFilePath(siteRepo);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, target);
}

/**
 * The route whose answers are most out of date, or undefined when every route
 * with questions has a block newer than `staleAfterDays`.
 *
 * One route per sweep on purpose. Answering nine routes in one night is nine
 * Claude calls and nine sections of the site changing at once; one a night fills
 * the same nine in a week and keeps each change small enough to read in a diff.
 */
export function nextRouteToAnswer(
  candidates: { route: string; locale: Locale; questions: number }[],
  file: FaqFile,
  now: Date,
  staleAfterDays = 30,
): { route: string; locale: Locale } | undefined {
  const cutoff = now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;

  const scored = candidates
    .filter((c) => c.questions >= 3)
    .map((c) => {
      const existing = file.entries.find((e) => e.route === c.route && e.locale === c.locale);
      return { ...c, updatedAt: existing ? Date.parse(existing.updatedAt) : 0 };
    })
    // Never answered comes first, then the oldest. A route answered inside the
    // window is not a candidate at all, so a stable site stops calling Claude.
    .filter((c) => c.updatedAt === 0 || c.updatedAt <= cutoff)
    .sort((a, b) => a.updatedAt - b.updatedAt || b.questions - a.questions);

  return scored[0] ? { route: scored[0].route, locale: scored[0].locale } : undefined;
}
