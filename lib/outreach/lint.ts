// The voice gate for outbound messages.
//
// A post and a connection request fail in different ways, so they cannot share
// a linter. A post is judged on whether anyone stops scrolling. A message is
// judged by one person who can see it was sent to four hundred others, and who
// will hold it against the sender personally.
//
// Everything the post gate bans is banned here too: the phrase lists are
// imported rather than copied, so a word cut from the brand voice is cut from
// both at once. What differs is the shape rules, and one failure mode posts
// do not have — sounding like a template.

import type { LintResult, LintViolation } from "../types.ts";
import {
  BANNED_WORDS,
  CEREMONY_VERBS,
  FAKE_CANDOUR,
  FALSE_DEPTH,
  PHANTOM_SOURCES,
  excerptAround,
  phraseRegex,
} from "../pipeline/lint.ts";

export type OutreachStepKind = "connect" | "message" | "inmail" | "email";

/**
 * LinkedIn's real limits, not our preferences. A connection note over 300
 * characters is refused by LinkedIn itself, so this is a hard error rather
 * than a matter of taste.
 *
 * The email numbers are the exception: nothing refuses a long email, so 5000
 * and 900 are a judgement about what a stranger reads, not a measured ceiling.
 * Expect to tune them once real emails exist.
 */
export const LIMITS: Record<OutreachStepKind, { hard: number; aim: number; label: string }> = {
  connect: { hard: 300, aim: 220, label: "connection note" },
  message: { hard: 8000, aim: 600, label: "message" },
  inmail: { hard: 1900, aim: 700, label: "InMail" },
  email: { hard: 5000, aim: 900, label: "email" },
};

/**
 * The tells of a mail merge. Every one of these is a phrase people write when
 * they are addressing a list and pretending to address a person.
 */
const TEMPLATE_TELLS: string[] = [
  "i hope this message finds you well",
  "i hope you're doing well",
  "i came across your profile",
  "i stumbled upon your profile",
  "your impressive background",
  "your impressive profile",
  "i'd love to connect and explore",
  "explore synergies",
  "mutually beneficial",
  "quick question for you",
  "pick your brain",
  "reaching out because i noticed",
  "as a fellow",
  "i wanted to reach out",
  "does that sound like something",
  "worth a quick chat",
  "let me know if this resonates",
  "circle back",
  "touch base",
];

/** A pitch in the first message is the fastest way to be ignored. */
const PREMATURE_PITCH: string[] = [
  "15 minutes of your time",
  "15-minute call",
  "calendly.com",
  "our solution",
  "our platform",
  "we help companies like yours",
];

/**
 * Asking for the diary, in any conjugation. Listing phrases was too brittle:
 * "book a call" caught nothing when the draft said "worth booking a call".
 */
const CALL_REQUEST =
  /\b(book|booking|schedul\w*|arrang\w*|set\s+up|setting\s+up|hop\s+on|jump\s+on|grab)\s+(a\s+|an\s+|some\s+)?(quick\s+|short\s+|brief\s+|\d+[-\s]?min\w*\s+)?(call|chat|coffee|meeting|catch[-\s]?up)\b/i;

/**
 * Lint one step of an outreach sequence.
 *
 * `merge` lists the personalisation fields the step uses, e.g. ["first_name"].
 * A message with no merge field at all is a broadcast, and reads like one.
 */
export function lintMessage(
  text: string,
  kind: OutreachStepKind,
  options: { isFirstTouch?: boolean } = {},
): LintResult {
  const violations: LintViolation[] = [];
  const add = (v: LintViolation) => violations.push(v);
  const trimmed = text.trim();
  const limit = LIMITS[kind];

  // --- shared brand bans, identical to the post gate ---
  for (const [list, rule, fix] of [
    [BANNED_WORDS, "bannedWords", "Cut it. Say it plainly."],
    [CEREMONY_VERBS, "ceremonyVerbs", 'Write "is" or "has".'],
    [FALSE_DEPTH, "falseDepth", "Make the actual claim."],
    [FAKE_CANDOUR, "fakeCandour", "Just say the thing."],
    [PHANTOM_SOURCES, "phantomSources", "Name the source or cut the claim."],
  ] as const) {
    for (const phrase of list) {
      const m = phraseRegex(phrase).exec(trimmed);
      if (m) {
        add({
          rule,
          severity: "error",
          excerpt: excerptAround(trimmed, m.index, m[0].length),
          fix,
        });
        break; // one report per list keeps the panel readable
      }
    }
  }

  // --- templateTells ---
  for (const phrase of TEMPLATE_TELLS) {
    const m = phraseRegex(phrase).exec(trimmed);
    if (m) {
      add({
        rule: "templateTells",
        severity: "error",
        excerpt: excerptAround(trimmed, m.index, m[0].length),
        fix: "This is what a mail merge sounds like. Say why you are writing to this person.",
      });
    }
  }

  // --- prematurePitch: only on the opener ---
  if (options.isFirstTouch) {
    for (const phrase of PREMATURE_PITCH) {
      const m = phraseRegex(phrase).exec(trimmed);
      if (m) {
        add({
          rule: "prematurePitch",
          severity: "error",
          excerpt: excerptAround(trimmed, m.index, m[0].length),
          fix: "Not in the first touch. Earn the reply before asking for the diary.",
        });
      }
    }
    const call = CALL_REQUEST.exec(trimmed);
    if (call) {
      add({
        rule: "prematurePitch",
        severity: "error",
        excerpt: excerptAround(trimmed, call.index, call[0].length),
        fix: "Asking for the diary before they have answered once. Give them a reason to reply instead.",
      });
    }
  }

  // --- length ---
  if (trimmed.length > limit.hard) {
    add({
      rule: "length",
      severity: "error",
      excerpt: `${trimmed.length} characters`,
      fix:
        kind === "email"
          ? `Nobody reads an ${limit.label} of ${trimmed.length} characters. Cut ${trimmed.length - limit.hard}.`
          : `LinkedIn refuses a ${limit.label} over ${limit.hard}. Cut ${trimmed.length - limit.hard}.`,
    });
  } else if (trimmed.length > limit.aim) {
    add({
      rule: "length",
      severity: "warn",
      excerpt: `${trimmed.length} characters`,
      fix: `Aim under ${limit.aim} for a ${limit.label}. Short gets read.`,
    });
  }
  if (trimmed.length === 0) {
    add({ rule: "length", severity: "error", excerpt: "(empty)", fix: "Write the message." });
  }

  // --- personalisation ---
  const mergeFields = trimmed.match(/\{[a-z_]+\}/gi) ?? [];
  if (trimmed.length > 0 && mergeFields.length === 0) {
    add({
      rule: "personalisation",
      severity: "warn",
      excerpt: "no merge field",
      fix: "Nothing here is about them. Add {first_name} at least, or a line only this person would get.",
    });
  }

  // --- links: never in a connection note ---
  if (kind === "connect" && /https?:\/\/|www\./i.test(trimmed)) {
    add({
      rule: "links",
      severity: "error",
      excerpt: "link in a connection note",
      fix: "A link before they have accepted reads as spam. Move it to a later step.",
    });
  }

  // --- shape: no hashtags, no emoji in outbound ---
  if (/#[\p{L}\p{N}_]+/u.test(trimmed)) {
    add({
      rule: "hashtags",
      severity: "error",
      excerpt: "hashtag in a message",
      fix: "Hashtags belong in posts. In a message they read as automation.",
    });
  }
  if (/\p{Extended_Pictographic}/u.test(trimmed)) {
    add({
      rule: "emoji",
      severity: "error",
      excerpt: "emoji",
      fix: "No emoji in outbound.",
    });
  }
  if ((trimmed.match(/—/g) ?? []).length > 0) {
    add({
      rule: "emDash",
      severity: "error",
      excerpt: "em dash",
      fix: "Use a full stop or a comma.",
    });
  }
  if (/!/.test(trimmed)) {
    add({
      rule: "exclamation",
      severity: "error",
      excerpt: "exclamation mark",
      fix: "Drop it. Enthusiasm in a cold message reads as a script.",
    });
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  const warns = violations.length - errors;
  return { ok: errors === 0, errors, warns, violations };
}

/**
 * The subject line, which is a different object to the body.
 *
 * It is the only part most recipients ever read, it is what a spam filter
 * scores first, and it is where the two worst tricks live: faking a reply with
 * "Re:" and shouting in capitals. Same phrase lists as everything else, so a
 * word cut from the brand voice is cut here too.
 */
export function lintSubject(subject: string): LintResult {
  const violations: LintViolation[] = [];
  const add = (v: LintViolation) => violations.push(v);
  const trimmed = subject.trim();

  if (trimmed.length === 0) {
    add({ rule: "length", severity: "error", excerpt: "(empty)", fix: "Write the subject line." });
  } else if (trimmed.length > 120) {
    add({
      rule: "length",
      severity: "error",
      excerpt: `${trimmed.length} characters`,
      fix: `A subject that long is a paragraph. Cut ${trimmed.length - 120}.`,
    });
  } else if (trimmed.length > 65) {
    add({
      rule: "length",
      severity: "warn",
      excerpt: `${trimmed.length} characters`,
      fix: "A phone shows about 65 characters. The rest is not read.",
    });
  }

  for (const [list, rule, fix] of [
    [BANNED_WORDS, "bannedWords", "Cut it. Say it plainly."],
    [CEREMONY_VERBS, "ceremonyVerbs", 'Write "is" or "has".'],
    [FALSE_DEPTH, "falseDepth", "Make the actual claim."],
    [FAKE_CANDOUR, "fakeCandour", "Just say the thing."],
    [PHANTOM_SOURCES, "phantomSources", "Name the source or cut the claim."],
  ] as const) {
    for (const phrase of list) {
      const m = phraseRegex(phrase).exec(trimmed);
      if (m) {
        add({ rule, severity: "error", excerpt: excerptAround(trimmed, m.index, m[0].length), fix });
        break;
      }
    }
  }

  if (/^(re|fwd|fw)\s*:/i.test(trimmed)) {
    add({
      rule: "fakeThread",
      severity: "error",
      excerpt: trimmed.slice(0, 20),
      fix: "Faking a reply is the fastest way to be reported.",
    });
  }
  if (/\p{Extended_Pictographic}/u.test(trimmed)) {
    add({ rule: "emoji", severity: "error", excerpt: "emoji", fix: "No emoji in a subject line." });
  }
  if (trimmed.includes("—")) {
    add({ rule: "emDash", severity: "error", excerpt: "em dash", fix: "Use a full stop or a comma." });
  }
  if (trimmed.includes("!")) {
    add({
      rule: "exclamation",
      severity: "error",
      excerpt: "exclamation mark",
      fix: "Drop it. It scores as spam and reads as a script.",
    });
  }
  if (/#[\p{L}\p{N}_]+/u.test(trimmed)) {
    add({ rule: "hashtags", severity: "error", excerpt: "hashtag", fix: "Hashtags belong in posts." });
  }
  const shout = /\b[A-Z]{4,}\b/.exec(trimmed);
  if (shout) {
    add({
      rule: "shouting",
      severity: "warn",
      excerpt: shout[0],
      fix: "Capitals read as a sale. Write it normally.",
    });
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  return { ok: errors === 0, errors, warns: violations.length - errors, violations };
}
