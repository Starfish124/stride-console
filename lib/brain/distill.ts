// The distillation step: a source document in, a handful of durable memories
// out. The prompt and the defensive parse are pure so they can be pinned by
// tests; the actual Claude call lives in scripts/brain-distill.mjs.

export interface DistilledMemory {
  subject: string;
  body: string;
}

/** A source yields at most this many memories. */
export const MAX_MEMORIES = 5;

const SOURCE_CAP = 8_000;

export function distillPrompt(kind: "session" | "run", title: string, content: string): string {
  const what =
    kind === "session"
      ? "notes from a Claude Code working session on the Stride systems"
      : "the record of an automated coding run on a client project";
  return `You are Hermes, the memory keeper for Stride AI's console. Below are ${what}.

Extract ONLY durable knowledge worth remembering months from now: decisions and why they were made, gotchas and traps discovered, what was tried and failed, facts about clients or systems that are not obvious from the code. Skip routine activity ("ran tests", "edited a file"), anything temporary, and anything a reader could trivially rediscover.

Reply with a bare JSON array of 0 to ${MAX_MEMORIES} objects, each {"subject": "one short headline", "body": "two or three sentences of the lesson itself"}. An empty array is a correct answer for a routine source. No prose outside the JSON.

SOURCE: ${title}

${content.slice(0, SOURCE_CAP)}`;
}

/**
 * Parse the model's reply. Same posture as parseIssues: try the whole thing,
 * salvage the outermost array, then give up quietly — a source that produced
 * nonsense is a source with no memories, not a crash.
 */
export function parseMemories(raw: string): DistilledMemory[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const memories: DistilledMemory[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.trim() : "";
    const body = typeof o.body === "string" ? o.body.trim() : "";
    if (!subject || !body) continue;
    memories.push({ subject: subject.slice(0, 200), body: body.slice(0, 2000) });
    if (memories.length >= MAX_MEMORIES) break;
  }
  return memories;
}
