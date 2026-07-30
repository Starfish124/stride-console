// What a reply actually means.
//
// Regex first, following lib/seo/expand.ts: most of what comes back from a
// cold email is an out of office, a mailer-daemon or the word unsubscribe, and
// twenty lines of pattern settles those with no round trip and no model to be
// running. Only genuinely ambiguous prose is worth a call to the local model.
//
// It never guesses. When Ollama is down the answer is "undecided" with the
// sentence saying why, because an unreachable classifier and a confident
// classifier are opposite things.

import { chat, modelReady } from "../ask/ollama.ts";

export type ReplyLabel =
  | "interested"
  | "not-now"
  | "not-interested"
  | "wrong-person"
  | "unsubscribe"
  | "auto-reply"
  | "bounce"
  | "undecided";

export interface Classification {
  label: ReplyLabel;
  engine: "regex" | "model" | "none";
  /** 1 when a pattern matched outright, lower when a model guessed. */
  confidence: number;
  problem?: string;
}

const PATTERNS: Array<[RegExp, ReplyLabel]> = [
  [/mailer-daemon|delivery status notification|undeliverable|address not found|550 5\.\d/i, "bounce"],
  [/out of (the )?office|auto(matic)?[- ]repl|automatisch antwoord|afwezig/i, "auto-reply"],
  [/unsubscribe|remove me|opt.?out|uitschrijven|geen mail meer/i, "unsubscribe"],
  [/no longer with|has left the company|niet meer werkzaam|wrong person|not the right person/i, "wrong-person"],
  [/not interested|no thanks|geen interesse|stop contacting/i, "not-interested"],
];

const SYSTEM =
  'Classify one reply to a cold business email. Answer JSON only: {"label": one of interested, not-now, not-interested, wrong-person, unsubscribe}. Nothing else.';

const LABELS: ReplyLabel[] = ["interested", "not-now", "not-interested", "wrong-person", "unsubscribe"];

export async function classifyReply(text: string): Promise<Classification> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { label: "undecided", engine: "none", confidence: 0, problem: "The reply is empty." };

  for (const [pattern, label] of PATTERNS) {
    if (pattern.test(trimmed)) return { label, engine: "regex", confidence: 1 };
  }

  const ready = await modelReady();
  if (!ready.ok) {
    return { label: "undecided", engine: "none", confidence: 0, problem: ready.problem };
  }

  try {
    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: trimmed.slice(0, 2000) },
      ],
      { format: "json", temperature: 0 },
    );
    const parsed = JSON.parse(raw) as { label?: string };
    const label = LABELS.find((l) => l === parsed.label);
    return label
      ? { label, engine: "model", confidence: 0.7 }
      : { label: "undecided", engine: "model", confidence: 0, problem: "The model answered with something that is not a label." };
  } catch (err) {
    return {
      label: "undecided",
      engine: "none",
      confidence: 0,
      problem: err instanceof Error ? err.message : String(err),
    };
  }
}
