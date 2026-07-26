// The long-form voice gate.
//
// A separate gate from lib/pipeline/lint.ts, because the rules genuinely
// differ: a LinkedIn post must fit 2,000 characters and lead with a hook
// inside the mobile fold, while a 1,200-word article must not. What does not
// differ is the vocabulary, so the phrase lists are IMPORTED rather than
// copied. One edit to the banned-word list updates posts, DMs and articles at
// once, which is the only way three gates stay in agreement over time.
//
// Rules come from Wikipedia's WikiProject AI Cleanup list, the same source as
// the post gate, extended to the patterns that only show up at article length:
// title-case headings, inline-header bullet lists, "challenges and future
// prospects" sections, signposting, fragmented headers, and manufactured
// conclusions.

import {
  BANNED_WORDS,
  CEREMONY_VERBS,
  FALSE_DEPTH,
  FAKE_CANDOUR,
  PHANTOM_SOURCES,
  excerptAround,
  phraseRegex,
} from "../pipeline/lint.ts";
import type { LintViolation } from "./types.ts";

export interface ArticleLintResult {
  violations: LintViolation[];
  errors: number;
  warns: number;
  ok: boolean;
}

/** Signposting: announcing the writing instead of doing it. */
export const SIGNPOSTING: string[] = [
  "let's dive in",
  "let's dive into",
  "let's explore",
  "let's break this down",
  "let's take a look",
  "here's what you need to know",
  "without further ado",
  "in this article we will",
  "in this post we will",
  "we duiken erin",
  "laten we eens kijken",
];

/** Aphorism formulas that sound profound and add no precision. */
export const APHORISM: string[] = [
  "is the language of",
  "is the currency of",
  "is the architecture of",
  "becomes a trap",
  "is not a tool but",
];

/** Knowledge-cutoff disclaimers and speculative gap-filling. */
export const GAP_FILLING: string[] = [
  "as of my last",
  "up to my last training",
  "while specific details are limited",
  "while specific details are scarce",
  "based on available information",
  "is not publicly available",
  "maintains a low profile",
  "prefers to stay out of the spotlight",
];

/** Chatbot correspondence pasted in as content. */
export const CHAT_ARTIFACTS: string[] = [
  "i hope this helps",
  "let me know if",
  "would you like me to",
  "want me to",
  "here is an overview of",
  "certainly!",
  "great question",
];

/** Vague upbeat endings that state nothing. */
export const EMPTY_CONCLUSIONS: string[] = [
  "the future looks bright",
  "exciting times lie ahead",
  "a step in the right direction",
  "only time will tell",
  "the possibilities are endless",
  "watch this space",
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Markdown body minus code blocks, which must never be linted as prose. */
function prose(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    // Link targets are not prose either; the anchor text is.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

function headings(markdown: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  markdown.split("\n").forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

/**
 * Sentence case, not title case. "Strategic Negotiations And Global
 * Partnerships" is a chatbot heading; a person writes "Strategic negotiations
 * and global partnerships".
 *
 * Counting capitals alone would flag legitimate headings full of proper nouns,
 * so a word is only suspicious when its lowercase form is an ordinary word.
 */
const ALWAYS_CAPITALISED = new Set([
  "ai", "api", "gdpr", "eu", "uk", "us", "llm", "gpt", "crm", "erp", "mvp",
  "seo", "saas", "kpi", "roi", "rpa", "b2b", "b2c", "nl", "avg", "mkb",
  "google", "claude", "openai", "anthropic", "stride", "linkedin", "netherlands",
  "dutch", "amsterdam", "rotterdam", "january", "february", "march", "april",
  "may", "june", "july", "august", "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday",
]);

export function isTitleCase(heading: string): boolean {
  const words = heading.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length < 3) return false;
  // Skip the first word: a capital there is just a sentence starting.
  const rest = words.slice(1);
  const capitalised = rest.filter((w) => {
    const bare = w.replace(/[^a-zA-Z]/g, "");
    if (bare.length < 4) return false;
    if (ALWAYS_CAPITALISED.has(bare.toLowerCase())) return false;
    return /^[A-Z][a-z]/.test(bare);
  });
  const eligible = rest.filter((w) => {
    const bare = w.replace(/[^a-zA-Z]/g, "");
    return bare.length >= 4 && !ALWAYS_CAPITALISED.has(bare.toLowerCase());
  });
  return eligible.length >= 2 && capitalised.length === eligible.length;
}

export function lintArticle(
  markdown: string,
  options: { minWords?: number; maxWords?: number } = {},
): ArticleLintResult {
  const { minWords = 600, maxWords = 4000 } = options;
  const violations: LintViolation[] = [];
  const add = (v: LintViolation) => violations.push(v);
  const text = prose(markdown);

  // ---------- shared vocabulary ----------

  const phraseRules: [string, string[], LintViolation["severity"], string][] = [
    ["bannedWords", BANNED_WORDS, "error", "Cut it. Say it plainly."],
    ["ceremonyVerbs", CEREMONY_VERBS, "error", 'Write "is" or "has".'],
    ["falseDepth", FALSE_DEPTH, "error", "Make the actual claim."],
    ["fakeCandour", FAKE_CANDOUR, "error", "Just say the thing."],
    ["phantomSources", PHANTOM_SOURCES, "error", "Name the source or cut the claim."],
    ["signposting", SIGNPOSTING, "error", "Do the thing instead of announcing it."],
    ["aphorism", APHORISM, "error", "Replace the formula with the concrete claim."],
    ["gapFilling", GAP_FILLING, "error", "Say what is not known, or cut the sentence."],
    ["chatArtifacts", CHAT_ARTIFACTS, "error", "This is chat, not an article. Delete it."],
    ["emptyConclusion", EMPTY_CONCLUSIONS, "error", "End on the last concrete fact."],
  ];

  for (const [rule, list, severity, fix] of phraseRules) {
    for (const phrase of list) {
      const m = phraseRegex(phrase).exec(text);
      if (m) {
        add({ rule, severity, excerpt: excerptAround(text, m.index, m[0].length), fix });
        break; // one report per rule keeps the rewrite prompt readable
      }
    }
  }

  // ---------- negation pivots ----------

  const pivot =
    /it['’]?s not (just )?(about )?\w[^.!?\n]{0,60}[,;—-]\s*(it['’]?s|but)|not (just|only) [^.!?\n]{0,50}(,| —| -|;) (but|it['’]s)/i.exec(
      text,
    );
  if (pivot) {
    add({
      rule: "negationPivot",
      severity: "error",
      excerpt: excerptAround(text, pivot.index, pivot[0].length),
      fix: "State the positive claim directly.",
    });
  }

  // ---------- participle clauses bolted on a finished sentence ----------

  const ing =
    /,\s+(highlighting|underscoring|emphasizing|emphasising|showcasing|reflecting|symbolizing|symbolising|demonstrating|illustrating|ensuring|fostering|cultivating|contributing to|encompassing|solidifying|cementing)\b/i.exec(
      text,
    );
  if (ing) {
    add({
      rule: "ingAnalysis",
      severity: "error",
      excerpt: excerptAround(text, ing.index, ing[0].length),
      fix: "Cut the clause, or make the point its own sentence.",
    });
  }

  // ---------- em dashes ----------

  const emDashes = (text.match(/[—–]/g) ?? []).length;
  if (emDashes > 0) {
    add({
      rule: "emDash",
      severity: "error",
      excerpt: `${emDashes} em or en dash${emDashes === 1 ? "" : "es"} found.`,
      fix: "Replace each with a full stop, a comma, or a colon.",
    });
  }

  // ---------- curly quotes ----------

  const curly = /[“”‘’]/.exec(text);
  if (curly) {
    add({
      rule: "curlyQuotes",
      severity: "warn",
      excerpt: excerptAround(text, curly.index, 1),
      fix: "Use straight quotes.",
    });
  }

  // ---------- emoji ----------

  const emoji = /(?![©®™])\p{Extended_Pictographic}/u.exec(markdown);
  if (emoji) {
    add({
      rule: "emoji",
      severity: "error",
      excerpt: excerptAround(markdown, emoji.index, emoji[0].length),
      fix: "No emoji.",
    });
  }

  // ---------- headings ----------

  const heads = headings(markdown);

  for (const h of heads) {
    if (isTitleCase(h.text)) {
      add({
        rule: "titleCaseHeading",
        severity: "error",
        excerpt: h.text,
        fix: "Sentence case. Capitalise the first word and proper nouns only.",
      });
      break;
    }
  }

  // Find once and test the result: `some` then `find` reads as safe but does
  // not narrow, so the build failed on a value that can never be undefined.
  const bodyH1 = heads.find((h) => h.level === 1);
  if (bodyH1) {
    add({
      rule: "h1InBody",
      severity: "error",
      excerpt: bodyH1.text,
      fix: "The page renders the title as the H1. Start body headings at H2.",
    });
  }

  const formulaic = heads.find((h) =>
    /^(challenges( and (future )?(prospects|legacy))?|future outlook|conclusion|final thoughts|in conclusion|key takeaways|wrapping up|summary)$/i.test(
      h.text.trim(),
    ),
  );
  if (formulaic) {
    add({
      rule: "formulaicSection",
      severity: "error",
      excerpt: formulaic.text,
      fix: "Cut the section. If it holds a real point, fold it into the argument.",
    });
  }

  // Fragmented header: a heading answered by a one-line paragraph that only
  // restates it before the real content starts.
  const lines = markdown.split("\n");
  for (const h of heads) {
    let i = h.line + 1;
    while (i < lines.length && lines[i].trim() === "") i++;
    const first = (lines[i] ?? "").trim();
    if (!first || /^[#\-*>|]/.test(first)) continue;
    const words = first.split(/\s+/).filter(Boolean);
    const next = (lines[i + 1] ?? "").trim();
    if (words.length <= 5 && next === "") {
      add({
        rule: "fragmentedHeader",
        severity: "warn",
        excerpt: `"${h.text}" then "${first}"`,
        fix: "Cut the warm-up line and start with the content.",
      });
      break;
    }
  }

  // ---------- inline-header bullet lists ----------

  // Both spellings occur: "**Header:** text" puts the colon inside the bold,
  // "**Header**: text" outside. Matching only one was letting half of them past.
  const inlineHeaderBullets = lines.filter((l) =>
    /^\s*[-*]\s+\*\*[^*]+(\*\*\s*:|:\s*\*\*)/.test(l),
  ).length;
  if (inlineHeaderBullets >= 3) {
    add({
      rule: "inlineHeaderList",
      severity: "error",
      excerpt: `${inlineHeaderBullets} bullets shaped "**Header:** explanation".`,
      fix: "Write it as prose, or drop the bolded labels.",
    });
  }

  // ---------- boldface spam ----------

  const bolds = (markdown.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
  if (bolds > 6) {
    add({
      rule: "boldSpam",
      severity: "warn",
      excerpt: `${bolds} bolded phrases.`,
      fix: "Emphasis that appears everywhere emphasises nothing.",
    });
  }

  // ---------- boosters without numbers ----------

  const boosterRe = /\b(significantly|remarkably|substantially|notably|dramatically)\b/gi;
  let bm: RegExpExecArray | null;
  while ((bm = boosterRe.exec(text)) !== null) {
    const tail = text.slice(bm.index + bm[0].length).trim().split(/\s+/).slice(0, 6).join(" ");
    if (!/\d/.test(tail)) {
      add({
        rule: "unanchoredBoosters",
        severity: "error",
        excerpt: excerptAround(text, bm.index, bm[0].length),
        fix: "Attach a real number or cut the booster.",
      });
      break;
    }
  }

  // ---------- staccato drama ----------

  const sentences = splitSentences(text);
  let run = 0;
  for (let i = 0; i < sentences.length; i++) {
    const words = sentences[i].split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length <= 4) {
      run++;
      if (run === 3) {
        add({
          rule: "staccatoRun",
          severity: "error",
          excerpt: sentences.slice(i - 2, i + 1).join(" "),
          fix: "Vary the rhythm. Merge or lengthen one of the three.",
        });
        break;
      }
    } else {
      run = 0;
    }
  }

  // ---------- rhythm ----------

  if (sentences.length >= 12) {
    const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(
      lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length,
    );
    // Human prose alternates short and long. An even mid-length cadence across
    // a whole article is the most durable machine tell, because it survives
    // every vocabulary edit.
    if (sd < 4.5) {
      add({
        rule: "flatRhythm",
        severity: "warn",
        excerpt: `Sentence length varies by only ${sd.toFixed(1)} words around a mean of ${mean.toFixed(0)}.`,
        fix: "Break one long sentence in two and let another run.",
      });
    }
  }

  // ---------- length ----------

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) {
    add({
      rule: "length",
      severity: "error",
      excerpt: `${wordCount} words, under the ${minWords} floor.`,
      fix: "Thin content does not rank. Add substance or drop the article.",
    });
  } else if (wordCount > maxWords) {
    add({
      rule: "length",
      severity: "warn",
      excerpt: `${wordCount} words, over the ${maxWords} ceiling.`,
      fix: "Tighten.",
    });
  }

  // ---------- concreteness ----------

  if (!/\d/.test(text)) {
    add({
      rule: "needsNumber",
      severity: "warn",
      excerpt: "(no digits anywhere in the article)",
      fix: "At least one real number. Specific beats abstract.",
    });
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  const warns = violations.filter((v) => v.severity === "warn").length;
  return { violations, errors, warns, ok: errors === 0 };
}

/** Human-readable violation list for the rewrite prompt. */
export function formatArticleViolations(result: ArticleLintResult): string {
  return result.violations
    .map((v) => `- [${v.severity}] ${v.rule}: ${v.excerpt}${v.fix ? ` (fix: ${v.fix})` : ""}`)
    .join("\n");
}
