// Stage 2 — the writer. Three modes, best available wins:
//   "subscription" — shells out to the local Claude Code CLI (`claude -p`), so
//     writing runs on the founders' Claude subscription. No API key, no per-token bill.
//   "api" — ANTHROPIC_API_KEY set: calls the Anthropic API directly.
//   "template" — neither available: deterministic template draft (marked
//     needsPolish) so the console works before any account exists.
// Default preference: subscription > api > template. Override with STRIDE_WRITER.

import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import {
  isEventRecipe,
  type EventWriteInfo,
  type Myth,
  type RecipeId,
  type SourcedItem,
  type WriterOutput,
} from "../types.ts";
import { buildWriterPrompt } from "../voice/guide.ts";
import { lessonsBlock } from "./memory.ts";

export interface WriteInput {
  items: SourcedItem[];
  myth?: Myth;
  event?: EventWriteInfo;
  weekNumber: number;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------- writer mode selection ----------

export type WriterMode = "subscription" | "api" | "template";

let cachedCliPath: string | null | undefined;

/** Path to the Claude Code CLI, or null. CLAUDE_BIN overrides; result is cached. */
export function claudeCliPath(): string | null {
  if (cachedCliPath !== undefined) return cachedCliPath;
  const override = process.env.CLAUDE_BIN;
  if (override) {
    const probe = spawnSync(override, ["--version"], { timeout: 10_000 });
    cachedCliPath = probe.status === 0 ? override : null;
    return cachedCliPath;
  }
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], {
    timeout: 10_000,
    encoding: "utf8",
  });
  const found = which.status === 0 ? which.stdout.split("\n")[0]?.trim() : "";
  cachedCliPath = found ? found : null;
  return cachedCliPath;
}

/** For tests: forget the cached CLI lookup. */
export function resetCliCache(): void {
  cachedCliPath = undefined;
}

export function writerMode(): WriterMode {
  const forced = process.env.STRIDE_WRITER;
  if (forced === "template" || forced === "api" || forced === "subscription") {
    return forced;
  }
  if (claudeCliPath()) return "subscription";
  if (hasApiKey()) return "api";
  return "template";
}

export function userPayload(recipe: RecipeId, input: WriteInput): string {
  if (recipe === "myth") {
    return JSON.stringify(
      { myth: input.myth?.text ?? "", weekNumber: input.weekNumber },
      null,
      2,
    );
  }
  if (isEventRecipe(recipe)) {
    return JSON.stringify(
      { event: input.event, weekNumber: input.weekNumber },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      weekNumber: input.weekNumber,
      items: input.items.map((i) => ({
        title: i.title,
        source: i.source,
        url: i.url,
        summary: i.summary,
        publishedAt: i.publishedAt,
        // Top stories arrive with the full article attached. Write from it —
        // specifics beat headline paraphrase.
        fullArticle: i.content,
      })),
    },
    null,
    2,
  );
}

/** Voice guide + formula, plus the feedback-memory lessons once stats exist. */
export function systemPrompt(recipe: RecipeId): string {
  const block = lessonsBlock();
  const base = buildWriterPrompt(recipe);
  return block ? `${base}\n\n${block}` : base;
}

/** The full prompt, exposed in the UI so founders can run it manually in no-key mode. */
export function buildFullPrompt(recipe: RecipeId, input: WriteInput): string {
  return `${systemPrompt(recipe)}\n\nSOURCE MATERIAL:\n${userPayload(recipe, input)}`;
}

// ---------- defensive JSON parsing ----------

export function parseWriterJson(raw: string): WriterOutput | undefined {
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
  const body = typeof o.body === "string" ? o.body : undefined;
  if (!body) return undefined;
  const hook =
    typeof o.hook === "string" && o.hook.trim() ? o.hook.trim() : body.split("\n")[0];
  const hashtags = Array.isArray(o.hashtags)
    ? o.hashtags.filter((h): h is string => typeof h === "string").slice(0, 3)
    : [];
  const slides = Array.isArray(o.slides)
    ? o.slides
        .filter(
          (s): s is { myth: string; reality: string } =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as Record<string, unknown>).myth === "string" &&
            typeof (s as Record<string, unknown>).reality === "string",
        )
        .slice(0, 4)
    : undefined;
  return {
    hook,
    body,
    hashtags,
    imageHeadline:
      typeof o.imageHeadline === "string" && o.imageHeadline.trim()
        ? o.imageHeadline
        : hook,
    imageStat: typeof o.imageStat === "string" ? o.imageStat : undefined,
    slides,
    founderIntroA: typeof o.founderIntroA === "string" ? o.founderIntroA : undefined,
    founderIntroB: typeof o.founderIntroB === "string" ? o.founderIntroB : undefined,
  };
}

// ---------- subscription mode (Claude Code CLI, `claude -p`) ----------

const CLI_TIMEOUT_MS = 240_000;

/**
 * Run the local Claude Code CLI in print mode with the prompt on stdin.
 * Runs from the OS temp dir so it never picks up a project's CLAUDE.md or
 * permission prompts. Uses the founders' Claude subscription auth.
 */
export function callClaudeCli(
  prompt: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  // A LinkedIn post lands well inside four minutes. A 2,500-word pillar
  // article does not: the first live batch died at exactly 240s with nothing
  // to show, so callers that ask for long output pass their own budget.
  const timeoutMs = options.timeoutMs ?? CLI_TIMEOUT_MS;
  const bin = claudeCliPath();
  if (!bin) return Promise.reject(new Error("Claude Code CLI not found"));
  const args = ["-p", "--output-format", "json"];
  const model = process.env.CLAUDE_CLI_MODEL;
  if (model) args.push("--model", model);
  return new Promise<string>((resolve, reject) => {
    const env = { ...process.env };
    // The CLI should bill the subscription, never a stray key in the app's env.
    delete env.ANTHROPIC_API_KEY;
    const child = spawn(bin, args, { cwd: os.tmpdir(), env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      resolve(extractCliResult(stdout));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** `--output-format json` wraps the answer; unwrap defensively across CLI versions. */
export function extractCliResult(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (typeof o.result === "string") return o.result;
      // stream-json style: last message content.
      if (Array.isArray(o.content)) {
        const text = o.content
          .filter(
            (b): b is { type: string; text: string } =>
              typeof b === "object" && b !== null &&
              (b as Record<string, unknown>).type === "text" &&
              typeof (b as Record<string, unknown>).text === "string",
          )
          .map((b) => b.text)
          .join("\n");
        if (text) return text;
      }
    }
  } catch {
    // Not JSON — plain -p output.
  }
  return stdout;
}

export async function cliWrite(
  recipe: RecipeId,
  input: WriteInput,
): Promise<WriterOutput> {
  const raw = await callClaudeCli(buildFullPrompt(recipe, input));
  const parsed = parseWriterJson(raw);
  if (parsed) return parsed;
  return templateWrite(recipe, input);
}

/** One-shot rewrite with the lint violations listed, over the CLI. */
export async function cliRewrite(
  recipe: RecipeId,
  input: WriteInput,
  previous: WriterOutput,
  violations: string,
): Promise<WriterOutput> {
  const prompt = `${buildFullPrompt(recipe, input)}\n\nYour previous draft:\n${JSON.stringify(
    previous,
    null,
    2,
  )}\n\nThe voice linter found these violations. Rewrite the draft fixing exactly these, changing nothing else. Reply with the corrected JSON only:\n${violations}`;
  try {
    const raw = await callClaudeCli(prompt);
    return parseWriterJson(raw) ?? previous;
  } catch {
    return previous;
  }
}

// ---------- API mode ----------

async function callClaude(system: string, user: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: 4000,
    temperature: 1,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n");
}

export async function apiWrite(
  recipe: RecipeId,
  input: WriteInput,
): Promise<WriterOutput> {
  const raw = await callClaude(systemPrompt(recipe), userPayload(recipe, input));
  const parsed = parseWriterJson(raw);
  if (parsed) return parsed;
  // The model ignored the JSON spec; fall back to the deterministic template.
  return templateWrite(recipe, input);
}

/** One-shot rewrite with the lint violations listed. Used by the auto-fix loop. */
export async function apiRewrite(
  recipe: RecipeId,
  input: WriteInput,
  previous: WriterOutput,
  violations: string,
): Promise<WriterOutput> {
  const user = `${userPayload(recipe, input)}\n\nYour previous draft:\n${JSON.stringify(
    previous,
    null,
    2,
  )}\n\nThe voice linter found these violations. Rewrite the draft fixing exactly these, changing nothing else:\n${violations}`;
  const raw = await callClaude(systemPrompt(recipe), user);
  return parseWriterJson(raw) ?? previous;
}

// ---------- template mode (no key, deterministic, no network) ----------

const WHY_LINES = [
  "worth a look if your team touches this weekly",
  "changes what a small team can automate this quarter",
  "one to test before your competitors do",
  "practical today, on the tools you already run",
  "an operator move, priced for small teams",
  "the quiet kind of release that shows up in your margins",
  "check your current stack against this one",
];

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function cleanTitle(title: string): string {
  return title.replace(/!+/g, ".").replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

/** The opening sentences of an enriched article, for the template fallback. */
function firstSentences(text: string | undefined, n: number): string {
  if (!text) return "";
  const flat = text
    .split("\n")
    .map((l) => l.trim())
    // Headings and list markers are structure, not prose.
    .filter((l) => l.length > 0 && !/^[#>*•-]/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
  const matches = flat.match(/[^.!?]+[.!?]+/g);
  if (!matches) return "";
  return matches.slice(0, n).join(" ").trim();
}

const PAD_LINES: Record<string, string[]> = {
  tldr: [
    "We read the feeds so you can spend the hour on your business instead.",
    "Save this post. The next edition lands Tuesday at 08:30.",
    "If one of these touches your stack, forward it to the person who owns that workflow.",
  ],
  news: [
    "Our rule for weeks like this: no tool swap on day 1. A 2-hour test tells you more than a week of comment threads.",
    "We run this scan every week across 10 sources so it reaches you as one decision, and the links sit in the first comment.",
    "If the story touches a workflow you run today, forward this to the person who owns it.",
  ],
  myth: [
    "We scope the first build to 30 days on purpose, because a short clock forces everyone to pick the workflow that hurts most.",
    "Nobody on the client side lost their role in that rollout. The hours moved from copying data into the work the team was hired to do.",
    "The same pattern held across our last 4 rollouts: small scope, one owner, and a number everyone can see at the end.",
    "The team kept the review step. A person still signs off on anything unusual, which is exactly where people beat software.",
  ],
  eventAnnounce: [
    "We built the format after watching too many 20-minute pitches bury the one sentence that mattered.",
    "Investors in the room told us the same thing: the first minute decides the next thirty, so we made the first minute the whole show.",
    "Bring your co-founder if you like. The room is half the value, and the conversations after the pitches run longer than the pitches themselves.",
    "There is no jury and no prize money. There is a room that remembers a clear idea, which has outlasted every trophy we have seen handed out.",
    "Practicing takes one lunch break. Say the idea out loud, time it, cut everything past the first breath, and you are ready for the stage.",
  ],
  eventLineup: [
    "Every pitch gets the same honest 60 seconds, and the room hears them back to back, which makes the clear ones unmissable.",
    "The conversations after the pitches are where the evening earns its name, so plan to stay past the last timer.",
    "If your startup belongs on this list, the signup takes 2 minutes and the stage takes 1.",
    "We publish the lineup ahead of the night on purpose: investors read it, pick the pitches they want to hear, and come with questions ready.",
    "The order on the night is drawn from a hat, so the list above tells you who is coming, and the evening decides the rest.",
  ],
  eventReminder: [
    "The format stays honest: 60 seconds on the clock, one idea, and a room that came to listen rather than scroll.",
    "Founders who pitched last time told us the minute on stage was worth more than a month of cold emails, and the follow-ups proved them right.",
    "Come to listen even if you do not pitch. The room is operators and investors, and the batch is worth hearing.",
    "Doors open half an hour before the first pitch, and the timer starts on schedule because 80 people gave us their evening.",
    "One preparation tip from the last edition: say your idea out loud 3 times today, and the stage version finds itself.",
  ],
  eventRecap: [
    "The timer kept everyone honest, and the room repaid every founder who respected it with full attention.",
    "The conversations after the pitches ran past closing, which is the best review an evening like this gets.",
    "We took notes all evening, and half our myth bank for next quarter came from the questions investors asked between pitches.",
    "A pattern we noticed from the side of the stage: the pitches that landed opened with the customer, and the number followed within a sentence.",
  ],
};

// ---------- event templates (1 Min AI Pitch) ----------

function eventDateLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const FALLBACK_EVENT = {
  title: "1 Min AI Pitch",
  date: "",
  venue: "our stage",
  capacity: 60,
  signups: [] as { name: string; startup: string; idea: string }[],
};

function eventAnnounceTemplate(input: WriteInput): WriterOutput {
  const ev = input.event ?? FALLBACK_EVENT;
  const when = ev.date ? eventDateLabel(ev.date) : "soon";
  const hook = truncate(
    `${ev.title}: 1 minute on stage, ${ev.capacity} seats in the room, ${when}.`,
    140,
  );
  const paragraphs = padToBand(
    "eventAnnounce",
    [
      hook,
      "The format is simple. Each founder gets 60 seconds to pitch one idea to a room of operators and investors, and the timer is honest.",
      "There are no slides to polish for a week. You bring the one sentence your startup lives on, and you find out in a minute whether it lands.",
      `The details, in plain words: ${when} at ${ev.venue}, ${ev.capacity} seats, and the seats go to the founders who claim them first.`,
      "If you run a startup and can say what it does in one breath, take the stage.",
      "Signup link in the first comment.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "OneMinPitch"],
    imageHeadline: `1 minute. One *idea*.`,
    imageStat: `${ev.capacity} SEATS — 60 SECONDS EACH`,
  };
}

function eventLineupTemplate(input: WriteInput): WriterOutput {
  const ev = input.event ?? FALLBACK_EVENT;
  const picks = ev.signups.slice(0, 6);
  const n = picks.length > 0 ? picks.length : ev.signups.length;
  const when = ev.date ? eventDateLabel(ev.date) : "soon";
  const hook = truncate(
    `${n > 0 ? n : "The"} startups, 1 minute each: the ${ev.title} lineup is taking shape.`,
    140,
  );
  const lines = picks.map((s, i) => {
    const idx = String(i + 1).padStart(2, "0");
    return `${idx} ${truncate(cleanTitle(s.startup), 50)}: ${truncate(cleanTitle(s.idea), 100)}.`;
  });
  const paragraphs = padToBand(
    "eventLineup",
    [
      hook,
      lines.length > 0
        ? "One line per startup, the same line they get 60 seconds to prove on stage."
        : "The signups are open and the first founders are in. The lineup post gets sharper as the list fills.",
      ...lines,
      "What connects the batch: every one of these is a working idea a founder can state in one breath, which is exactly the bar the stage sets.",
      `${when} at ${ev.venue}. Come for the pitches, stay for the room.`,
      "Signup link in the first comment.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "OneMinPitch"],
    imageHeadline: `The *lineup*.`,
    imageStat: n > 0 ? `${n} STARTUPS — 1 MINUTE EACH` : `1 MINUTE EACH`,
  };
}

function eventReminderTemplate(input: WriteInput): WriterOutput {
  const ev = input.event ?? FALLBACK_EVENT;
  const when = ev.date ? eventDateLabel(ev.date) : "soon";
  const daysLeft = ev.date
    ? Math.max(1, Math.ceil((Date.parse(ev.date) - Date.now()) / (24 * 60 * 60 * 1000)))
    : 7;
  const hook = truncate(
    `${daysLeft} days until ${ev.title}. Here is what happens on the night.`,
    140,
  );
  const paragraphs = padToBand(
    "eventReminder",
    [
      hook,
      "The evening runs on one rule: each founder gets 60 seconds on stage for one idea, in front of a room of operators and investors who came to listen.",
      "If you are still deciding whether to pitch, here is the honest math. One minute on stage puts your idea in front of the whole room at once, which beats a month of one-at-a-time introductions.",
      `${when} at ${ev.venue}, ${ev.capacity} seats. The remaining ones go to the founders who claim them this week.`,
      "Signup link in the first comment.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "OneMinPitch"],
    imageHeadline: `${daysLeft} *days* out.`,
    imageStat: `${when.toUpperCase()} — ${ev.capacity} SEATS`,
  };
}

function eventRecapTemplate(input: WriteInput): WriterOutput {
  const ev = input.event ?? FALLBACK_EVENT;
  const n = ev.signups.length > 0 ? ev.signups.length : ev.capacity;
  const hook = truncate(
    `${n} pitches, 1 minute each, and a room that stayed past closing. That was ${ev.title}.`,
    140,
  );
  const paragraphs = padToBand(
    "eventRecap",
    [
      hook,
      "What we watched from the side of the stage: founders compressing months of work into one honest minute, and a room leaning in for every single one.",
      "What surprised us most was how little the timer hurt. The best pitches used about 50 seconds and spent the rest standing behind one number.",
      "What we learned, and it holds for any operator: if the idea needs more than a minute to land, the idea is not ready, the telling of it is.",
      `Thank you to every founder who took the stage at ${ev.venue}, and to the room that made pitching there worth the nerves.`,
      "The rule of thumb worth saving from the night: one idea, one number, one breath. It works on a stage and it works in a sales call.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "OneMinPitch"],
    imageHeadline: `The *recap*.`,
    imageStat: `${n} PITCHES — 1 NIGHT`,
  };
}

function padToBand(recipe: string, paragraphs: string[], min: number): string[] {
  const extras = PAD_LINES[recipe] ?? [];
  const out = [...paragraphs];
  let i = 0;
  while (out.join("\n\n").length < min && i < extras.length) {
    out.splice(out.length - 1, 0, extras[i]);
    i++;
  }
  return out;
}

function tldrTemplate(input: WriteInput): WriterOutput {
  const items = input.items.slice(0, 7);
  const n = items.length;
  const hook = `The Stride TLDR, week ${input.weekNumber}: ${n} AI updates that earn their line, curated for operators.`;
  const lines = items.map((item, i) => {
    const idx = String(i + 1).padStart(2, "0");
    const why = WHY_LINES[i % WHY_LINES.length];
    return `${idx} ${truncate(cleanTitle(item.title), 110)}. Why it matters: ${why}.`;
  });
  const paragraphs = padToBand(
    "tldr",
    [
      hook,
      "One line per story: what shipped, and what it changes for a business running on AI.",
      ...lines,
      `Rule of thumb for the week: if a tool saves your team 2 hours a week, it pays for itself inside a month. Start with the smallest workflow that hurts.`,
      "Links in the first comment.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "Automation", "StrideTLDR"],
    imageHeadline: `Week ${input.weekNumber}, in ${n} *lines*.`,
    imageStat: `${n} STORIES — 7 DAYS`,
  };
}

function newsTemplate(input: WriteInput): WriterOutput {
  const top = input.items[0];
  const rest = input.items.slice(1, 3);
  const title = top ? cleanTitle(top.title) : "A quiet week in AI";
  const hook = truncate(
    `The AI story your next quarter has to account for: ${title}.`,
    140,
  );
  const context = rest.length
    ? `Related this week: ${rest.map((r) => truncate(cleanTitle(r.title), 70)).join(". ")}.`
    : "The rest of the week's news orbits this one story.";
  const paragraphs = padToBand(
    "news",
    [
      hook,
      `What happened, in plain words: ${truncate((top?.summary?.trim() || firstSentences(top?.content, 2) || `${title}, reported by ${top?.source ?? "our tier-1 sources"} in the last 7 days`).replace(/[.\u2026]+$/, ""), 260)}.`,
      context,
      "What it means if you run a business on AI this quarter: the ground under one of your tools moved. Pricing, capability or access has shifted, and your workflows inherit that change whether you planned for it or not.",
      "The teams that come out ahead treat weeks like this as a budget line, about 2 hours: read the change, test it on one live workflow, decide by Friday.",
      "One concrete action: pick the single workflow this touches most and run it side by side with your current setup before the end of the week.",
    ],
    1200,
  );
  const statSource = `${title} `.match(/\d[\d,.]*[%xX]?/);
  const shortTitle = truncate(title, 60);
  const headline = shortTitle.endsWith("…") ? shortTitle : `${shortTitle}.`;
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "BreakingThisWeek"],
    imageHeadline: headline.replace(/^(\w+)/, "*$1*"),
    imageStat: statSource ? `${statSource[0]} — THIS WEEK` : `TOP STORY — 7 DAYS`,
  };
}

function mythTemplate(input: WriteInput): WriterOutput {
  const mythText = (input.myth?.text ?? "AI projects have to be big to be worth it").replace(/["!]/g, "").trim();
  const hook = truncate(`"${mythText}." We hear it in most first meetings, and we get why.`, 140);
  const paragraphs = padToBand(
    "myth",
    [
      hook,
      "The reality looks better than the myth. The wins we see are small, scoped and fast: one workflow, one owner, live in under 30 days.",
      "At one client, the first automation handled a single handoff their ops lead did by hand every morning. It gave her back 6 hours a week, and the second workflow paid for the first one's build.",
      "That first small win did the convincing for us. The team that watched it run asked for the next three automations themselves, which beats any slide deck we could have shown them.",
      "The takeaway worth saving: start with the smallest workflow that hurts every day, ship it in weeks, and let the result argue for the roadmap.",
    ],
    1200,
  );
  return {
    hook,
    body: paragraphs.join("\n\n"),
    hashtags: ["AI", "MythVsReality"],
    imageHeadline: "Myth vs *reality*.",
    imageStat: "6 HOURS / WEEK, BACK",
    slides: [
      {
        myth: truncate(`${mythText}.`, 120),
        reality: "One scoped workflow, one owner, live in under 30 days. The result argues for the roadmap.",
      },
      {
        myth: "You need everything in place before the first win.",
        reality: "The first automation we ship usually touches one handoff and gives back about 6 hours a week.",
      },
    ],
  };
}

export function templateWrite(recipe: RecipeId, input: WriteInput): WriterOutput {
  if (recipe === "tldr") return tldrTemplate(input);
  if (recipe === "news") return newsTemplate(input);
  if (recipe === "eventAnnounce") return eventAnnounceTemplate(input);
  if (recipe === "eventLineup") return eventLineupTemplate(input);
  if (recipe === "eventReminder") return eventReminderTemplate(input);
  if (recipe === "eventRecap") return eventRecapTemplate(input);
  return mythTemplate(input);
}
