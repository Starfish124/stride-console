// Stage 2 — the writer. With ANTHROPIC_API_KEY set it calls Claude with the full
// voice guide. Without a key it produces a deterministic template draft (marked
// needsPolish) so the console works before any account exists.

import type { Myth, RecipeId, SourcedItem, WriterOutput } from "../types.ts";
import { buildWriterPrompt } from "../voice/guide.ts";

export interface WriteInput {
  items: SourcedItem[];
  myth?: Myth;
  weekNumber: number;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function userPayload(recipe: RecipeId, input: WriteInput): string {
  if (recipe === "myth") {
    return JSON.stringify(
      { myth: input.myth?.text ?? "", weekNumber: input.weekNumber },
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
      })),
    },
    null,
    2,
  );
}

/** The full prompt, exposed in the UI so founders can run it manually in no-key mode. */
export function buildFullPrompt(recipe: RecipeId, input: WriteInput): string {
  return `${buildWriterPrompt(recipe)}\n\nSOURCE MATERIAL:\n${userPayload(recipe, input)}`;
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
  const raw = await callClaude(buildWriterPrompt(recipe), userPayload(recipe, input));
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
  const raw = await callClaude(buildWriterPrompt(recipe), user);
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
};

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
      `What happened, in plain words: ${truncate(top?.summary?.trim().replace(/[.\u2026]+$/, "") || `${title}, reported by ${top?.source ?? "our tier-1 sources"} in the last 7 days`, 260)}.`,
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
  return mythTemplate(input);
}
