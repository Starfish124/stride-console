// Writing one email step, through the same gate as everything else.
//
// The drafting engine already exists, so none of it is rebuilt here: this
// calls callClaudeCli() with a sales prompt and reuses the write, lint, one
// rewrite loop from lib/pipeline/run.ts. It deliberately does NOT go through
// buildFullPrompt or cliWrite, which are typed to a RecipeId and return a
// LinkedIn post shape (hook, hashtags, slides). An email is not that.
//
// There is no template fallback. Everywhere else in this console a dead CLI
// falls back to a deterministic draft so the button never breaks, and that is
// right for a post a founder reads before publishing. It is wrong here,
// because the output of this function can be sent to a stranger by a timer.
// On a dead CLI the draft comes back marked needsPolish and cannot be queued.

import { callClaudeCli, writerMode } from "../pipeline/write.ts";
import { formatViolations } from "../pipeline/lint.ts";
import type { LintResult } from "../types.ts";
import type { Client } from "../types.ts";
import type { OutreachSequence } from "../outreach/sequence.ts";
import { lintEmailStep } from "./guard.ts";
import { researchFor } from "./store.ts";

export { lintEmailStep };

export interface EmailDraft {
  subject: string;
  body: string;
  lint: LintResult;
  /** True when no model wrote this. It cannot be queued in that state. */
  needsPolish: boolean;
  problem?: string;
}

const RULES = [
  "Write a cold B2B email in English, from one founder of a small Dutch AI consultancy to one person.",
  "Plain sentences. No em dashes, no exclamation marks, no emoji, no hashtags.",
  "No ceremony verbs (leverage, utilise, unlock), no filler openers (I hope this finds you well).",
  "Do not ask for a call, a meeting or fifteen minutes in a first email. Earn the reply first.",
  "Use {first_name} at least once. The other fields available are {company}, {role}, {need}.",
  "Body under 900 characters. Subject under 65 characters, lower case, no Re: and no Fwd:.",
  "One concrete claim with a number, or none at all. Never invent a number.",
].join("\n");

/** Brace-slice the answer, because a model likes to explain itself first. */
function sliceJson(raw: string): { subject?: string; body?: string } | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as { subject?: string; body?: string };
  } catch {
    return undefined;
  }
}

function prompt(
  client: Client,
  sequence: OutreachSequence,
  stepIndex: number,
  previous: string[],
  research: string,
): string {
  return [
    RULES,
    "",
    `AUDIENCE: ${sequence.audience || "small Dutch businesses"}`,
    `PERSON: ${client.name}, ${client.role ?? "role unknown"} at ${client.company}`,
    client.need ? `WHAT THEY NEED: ${client.need}` : "",
    research ? `WHAT WE KNOW ABOUT THE ACCOUNT:\n${research}` : "",
    stepIndex === 0
      ? "This is the first email. They have never heard from us."
      : `This is email ${stepIndex + 1}. Earlier ones, which they did not answer:\n${previous.join("\n---\n")}`,
    "",
    'Answer with JSON only: {"subject": "...", "body": "..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftEmail(
  client: Client,
  sequence: OutreachSequence,
  stepIndex: number,
): Promise<EmailDraft> {
  const isFirstTouch = stepIndex === 0;
  const previous = sequence.steps.slice(0, stepIndex).map((s) => `${s.subject ?? ""}\n${s.body}`);
  const found = researchFor(client.id);
  const research = found ? [found.summary, ...found.angles].join("\n") : "";

  if (writerMode() !== "subscription") {
    const draft = { subject: "", body: "" };
    return {
      ...draft,
      lint: lintEmailStep(draft, { isFirstTouch }),
      needsPolish: true,
      problem:
        "The Claude CLI is not available on this Mac, so nothing wrote this. There is no safe template for a cold email, so write it by hand or fix the CLI.",
    };
  }

  let raw: string;
  try {
    raw = await callClaudeCli(prompt(client, sequence, stepIndex, previous, research));
  } catch (err) {
    const draft = { subject: "", body: "" };
    return {
      ...draft,
      lint: lintEmailStep(draft, { isFirstTouch }),
      needsPolish: true,
      problem: err instanceof Error ? err.message : String(err),
    };
  }

  let parsed = sliceJson(raw);
  let draft = { subject: (parsed?.subject ?? "").trim(), body: (parsed?.body ?? "").trim() };
  let verdict = lintEmailStep(draft, { isFirstTouch });

  // Exactly one rewrite, with the deterministic violations listed. A second
  // pass has never been worth the wait in this codebase.
  if (!verdict.ok) {
    try {
      raw = await callClaudeCli(
        [
          prompt(client, sequence, stepIndex, previous, research),
          "",
          "Your previous answer was refused for these exact reasons. Fix all of them and answer with JSON only.",
          JSON.stringify(draft),
          formatViolations(verdict),
        ].join("\n"),
      );
      parsed = sliceJson(raw);
      if (parsed?.body) {
        draft = { subject: (parsed.subject ?? "").trim(), body: parsed.body.trim() };
        verdict = lintEmailStep(draft, { isFirstTouch });
      }
    } catch {
      // Keep the first draft and its verdict. The gate still refuses to queue.
    }
  }

  return { ...draft, lint: verdict, needsPolish: false };
}
