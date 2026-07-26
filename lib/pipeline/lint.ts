// Stage 3 — the voice gate. Deterministic, pure, no I/O.
// Errors block approval. Warns show amber in the review UI.

import type { LintResult, LintViolation } from "../types.ts";

export const BANNED_WORDS: string[] = [
  "delve",
  "leverage",
  "leveraging",
  "harness",
  "unlock",
  "empower",
  "elevate",
  "foster",
  "embark",
  "tapestry",
  "realm",
  "landscape",
  "game-changer",
  "game changing",
  "paradigm",
  "synergy",
  "synergies",
  "robust",
  "seamless",
  "seamlessly",
  "holistic",
  "multifaceted",
  "pivotal",
  "cutting-edge",
  "ever-evolving",
  "transformative",
  "revolutionize",
  "revolutionary",
  "utilize",
  "facilitate",
  "journey",
  "navigate the",
  "in today's",
  "fast-paced world",
  "here's the thing",
  "in conclusion",
  "ultimately",
  "to wrap",
  "the future is bright",
  "it's worth noting",
  "that being said",
  "moreover",
  "furthermore",
  "additionally",
  "stands as a testament",
  "plays a significant role",
];

/**
 * Copula avoidance. A model reaches for a verb of ceremony where a person
 * would write "is". Wikipedia's AI-cleanup project lists this as one of the
 * most reliable tells, and it survives every other edit because it never
 * looks like a mistake.
 */
export const CEREMONY_VERBS: string[] = [
  "serves as",
  "stands as",
  "acts as a bridge",
  "boasts a",
  "boasts an",
  "boasts over",
  "represents a shift",
  "marks a turning point",
];

/**
 * Phrases that pretend to cut through noise to a deeper truth, then restate
 * an ordinary point with ceremony. On LinkedIn they are everywhere, which is
 * exactly why they read as written by nobody.
 */
export const FALSE_DEPTH: string[] = [
  "the real question is",
  "at its core",
  "what really matters",
  "the deeper issue",
  "the heart of the matter",
  "make no mistake",
  "let that sink in",
  "here's the kicker",
  "the currency of",
  "the architecture of",
  "the language of trust",
];

/** Fake-candid hooks. A person being honest usually just says the thing. */
export const FAKE_CANDOUR: string[] = [
  "let's be honest",
  "real talk",
  "hot take",
  "unpopular opinion",
  "i'll be honest",
  "truth bomb",
];

export const PHANTOM_SOURCES: string[] = [
  "studies show",
  "experts say",
  "research shows",
  "many believe",
  "industry reports",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function phraseRegex(phrase: string): RegExp {
  // Word-boundary-ish matching that survives apostrophes and hyphens.
  const inner = escapeRegex(phrase).replace(/ /g, "\\s+").replace(/'/g, "['\u2019]");
  return new RegExp(`(?<![a-z0-9])${inner}(?![a-z0-9])`, "i");
}

export function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripHashtags(text: string): string {
  return text.replace(/#[\p{L}\p{N}_]+/gu, "").trim();
}

export function lint(text: string): LintResult {
  const violations: LintViolation[] = [];
  const add = (v: LintViolation) => violations.push(v);

  // --- negationPivot ---
  const pivotPatterns: RegExp[] = [
    /it['\u2019]?s not (just )?(about )?\w[^.!?\n]{0,60}[,;\u2014-]\s*(it['\u2019]?s|but)/i,
    /not (just|only) [^.!?\n]{0,50}(,| \u2014| -|;) (but|it['\u2019]s)/i,
  ];
  for (const re of pivotPatterns) {
    const m = re.exec(text);
    if (m) {
      add({
        rule: "negationPivot",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: "State the positive claim directly.",
      });
    }
  }
  // Standalone "It's not X. It's Y." across sentences: a sentence starting
  // "It's not" followed within 2 sentences by a sentence starting "It's ".
  const sentences = splitSentences(stripHashtags(text));
  for (let i = 0; i < sentences.length; i++) {
    if (/^it['\u2019]?s not\b/i.test(sentences[i])) {
      for (let j = i + 1; j <= i + 2 && j < sentences.length; j++) {
        if (/^it['\u2019]?s (?!not\b)/i.test(sentences[j])) {
          add({
            rule: "negationPivot",
            severity: "error",
            excerpt: `${sentences[i]} … ${sentences[j]}`.slice(0, 120),
            fix: "State the positive claim directly.",
          });
          i = j; // don't re-flag the same pair
          break;
        }
      }
    }
  }

  // --- bannedWords ---
  for (const word of BANNED_WORDS) {
    const m = phraseRegex(word).exec(text);
    if (m) {
      add({
        rule: "bannedWords",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: `Cut "${m[0]}". Say it plainly.`,
      });
    }
  }

  // --- ceremonyVerbs: "serves as" where a person writes "is" ---
  for (const phrase of CEREMONY_VERBS) {
    const m = phraseRegex(phrase).exec(text);
    if (m) {
      add({
        rule: "ceremonyVerbs",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: `Write "is" or "has". "${m[0]}" is a machine avoiding a plain verb.`,
      });
    }
  }

  // --- falseDepth ---
  for (const phrase of FALSE_DEPTH) {
    const m = phraseRegex(phrase).exec(text);
    if (m) {
      add({
        rule: "falseDepth",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: "Make the actual claim. This phrase promises a depth the next sentence never pays.",
      });
    }
  }

  // --- fakeCandour ---
  for (const phrase of FAKE_CANDOUR) {
    const m = phraseRegex(phrase).exec(text);
    if (m) {
      add({
        rule: "fakeCandour",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: "Just say the thing. Announcing honesty is not the same as being direct.",
      });
    }
  }

  /* --- ingAnalysis ---
   * A participle clause bolted onto a finished sentence to fake depth:
   * "...cut the review queue to 20 minutes, highlighting the value of
   * automation." The clause never carries information the sentence lacked. */
  const ingRe =
    /,\s+(highlighting|underscoring|emphasizing|showcasing|reflecting|symbolizing|demonstrating|illustrating|ensuring|fostering|cultivating|contributing to|encompassing|solidifying|cementing)\b/gi;
  let ingMatch: RegExpExecArray | null;
  while ((ingMatch = ingRe.exec(text)) !== null) {
    add({
      rule: "ingAnalysis",
      severity: "error",
      excerpt: excerptAround(text, ingMatch.index, ingMatch[0].length),
      fix: "Cut the clause. If it carries a real point, make it its own sentence.",
    });
  }

  /* --- falseRange ---
   * "from X to Y" where X and Y sit on no shared scale. Reads comprehensive,
   * says nothing. */
  const rangeRe = /\bfrom\s+[\w'-]+(?:\s+[\w'-]+){0,3}\s+to\s+[\w'-]+/gi;
  const rangeMatch = rangeRe.exec(text);
  if (rangeMatch && !/\d/.test(rangeMatch[0])) {
    add({
      rule: "falseRange",
      severity: "warn",
      excerpt: excerptAround(text, rangeMatch.index, rangeMatch[0].length),
      fix: "Name the two or three things you mean, or give the range real numbers.",
    });
  }

  /* --- curlyQuotes ---
   * Straight quotes everywhere: curled ones are a paste from a chat window. */
  const curly = /[“”‘’]/.exec(text);
  if (curly) {
    add({
      rule: "curlyQuotes",
      severity: "warn",
      excerpt: excerptAround(text, curly.index, 1),
      fix: "Use straight quotes.",
    });
  }

  // --- phantomSources ---
  for (const phrase of PHANTOM_SOURCES) {
    const m = phraseRegex(phrase).exec(text);
    if (m) {
      add({
        rule: "phantomSources",
        severity: "error",
        excerpt: excerptAround(text, m.index, m[0].length),
        fix: "Name the source or cut it.",
      });
    }
  }

  // --- unanchoredBoosters ---
  const boosterRe = /\b(significantly|remarkably|substantially|notably)\b/gi;
  let boosterMatch: RegExpExecArray | null;
  while ((boosterMatch = boosterRe.exec(text)) !== null) {
    const tail = text.slice(boosterMatch.index + boosterMatch[0].length);
    const nextWords = tail.trim().split(/\s+/).slice(0, 6).join(" ");
    if (!/\d/.test(nextWords)) {
      add({
        rule: "unanchoredBoosters",
        severity: "error",
        excerpt: excerptAround(text, boosterMatch.index, boosterMatch[0].length),
        fix: "Attach a real number or cut the booster.",
      });
    }
  }

  // --- emDash ---
  const emDashCount = (text.match(/\u2014/g) ?? []).length;
  if (emDashCount > 1) {
    add({
      rule: "emDash",
      severity: "error",
      excerpt: `${emDashCount} em-dashes found.`,
      fix: "Max 1 em-dash per post; target 0. Use a period.",
    });
  }

  // --- emoji ---
  const emojiRe = /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}/u;
  const emojiMatch = emojiRe.exec(text);
  if (emojiMatch) {
    add({
      rule: "emoji",
      severity: "error",
      excerpt: excerptAround(text, emojiMatch.index, emojiMatch[0].length),
      fix: "No emoji, ever.",
    });
  }

  // --- exclamation ---
  const bangIndex = text.indexOf("!");
  if (bangIndex >= 0) {
    add({
      rule: "exclamation",
      severity: "error",
      excerpt: excerptAround(text, bangIndex, 1),
      fix: "Full stops only.",
    });
  }

  // --- staccatoTriplet ---
  let shortRun = 0;
  for (let i = 0; i < sentences.length; i++) {
    const words = sentences[i]
      .replace(/[^\p{L}\p{N}'\u2019 ]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length > 0 && words.length <= 4) {
      shortRun++;
      if (shortRun === 3) {
        add({
          rule: "staccatoTriplet",
          severity: "error",
          excerpt: sentences.slice(i - 2, i + 1).join(" "),
          fix: "Vary the rhythm. Merge or lengthen one of the three.",
        });
      }
    } else {
      shortRun = 0;
    }
  }

  // --- hookFold ---
  const firstLine = (text.split("\n")[0] ?? "").trim();
  if (firstLine.length === 0) {
    add({
      rule: "hookFold",
      severity: "error",
      excerpt: "(empty first line)",
      fix: "Open with the hook.",
    });
  } else if (firstLine.length > 140) {
    add({
      rule: "hookFold",
      severity: "error",
      excerpt: `First line is ${firstLine.length} chars; the mobile fold is 140.`,
      fix: "Cut the hook to 140 characters.",
    });
  }

  // --- length ---
  const len = text.length;
  if (len < 900 || len > 2900) {
    add({
      rule: "length",
      severity: "error",
      excerpt: `${len.toLocaleString("en-US")} characters (hard band: 900-2,900).`,
      fix: "Target 1,200-2,000 characters.",
    });
  } else if (len < 1200 || len > 2000) {
    add({
      rule: "length",
      severity: "warn",
      excerpt: `${len.toLocaleString("en-US")} characters (sweet spot: 1,200-2,000).`,
      fix: "Tighter wins.",
    });
  }

  // --- paragraphs ---
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paragraphs) {
    const count = splitSentences(stripHashtags(p)).length;
    if (count > 2) {
      add({
        rule: "paragraphs",
        severity: "warn",
        excerpt: `${excerptAround(p, 0, 60)} (${count} sentences)`,
        fix: "Paragraphs of 1-2 sentences.",
      });
      break; // one warning is enough
    }
  }

  // --- hashtags ---
  const hashtagRe = /#[\p{L}\p{N}_]+/gu;
  const hashtagMatches = [...text.matchAll(hashtagRe)];
  if (hashtagMatches.length > 3) {
    add({
      rule: "hashtags",
      severity: "error",
      excerpt: hashtagMatches.map((m) => m[0]).join(" "),
      fix: "Max 3 hashtags.",
    });
  }
  if (hashtagMatches.length > 0) {
    const firstIndex = hashtagMatches[0].index ?? 0;
    const tail = text.slice(firstIndex);
    const tailWithoutTags = tail.replace(hashtagRe, "").trim();
    if (tailWithoutTags.length > 0) {
      add({
        rule: "hashtags",
        severity: "warn",
        excerpt: excerptAround(text, firstIndex, hashtagMatches[0][0].length),
        fix: "Hashtags go at the very end.",
      });
    }
  }

  // --- needsNumber ---
  if (!/\d/.test(stripHashtags(text))) {
    add({
      rule: "needsNumber",
      severity: "warn",
      excerpt: "(no digits found)",
      fix: "Add one concrete number.",
    });
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  const warns = violations.filter((v) => v.severity === "warn").length;
  return { violations, errors, warns, ok: errors === 0 };
}

/** Human-readable violation list, used in the auto-fix rewrite prompt. */
export function formatViolations(result: LintResult): string {
  return result.violations
    .map((v) => `- [${v.severity}] ${v.rule}: ${v.excerpt}${v.fix ? ` (fix: ${v.fix})` : ""}`)
    .join("\n");
}
