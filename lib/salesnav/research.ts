// The deep pass on one account, before anybody writes to it.
//
// Target: the company website, which for a B2B address is simply the domain of
// the address. Pages are fetched with the existing reader, so there is no
// second fetch-and-strip in this repo, and the prompt is the numbered [n]
// source block that lib/seo/article.ts already proved works.
//
// The citation guard is the point of the whole thing. A model asked for
// evidence will produce a plausible URL it never saw, and a founder quoting
// that in a cold email is worse than sending nothing. Every claimed URL is
// checked against the allow set of pages actually fetched, and a dropped one
// is filed as an error on the record rather than discarded quietly.

import { newId } from "../store.ts";
import { readArticle } from "../pipeline/reader.ts";
import { callClaudeCli, writerMode } from "../pipeline/write.ts";
import { putResearch } from "./store.ts";
import type { AccountResearch, ResearchViolation } from "./types.ts";
import { domainOf } from "./suppress.ts";

/** Deep passes have died at exactly the 240s default before. Give them room. */
const RESEARCH_TIMEOUT_MS = 720_000;
const MAX_PAGES = 3;
const MAX_CHARS_PER_PAGE = 4000;

/**
 * Six lines rather than an import of lib/seo/article.ts's filterSources: that
 * is another agent's file and its signature is typed to a SourcedItem shape
 * account research does not have.
 */
export function keepOfferedUrls(
  claimed: Array<{ claim: string; url: string }>,
  offered: string[],
): { kept: Array<{ claim: string; url: string }>; dropped: Array<{ claim: string; url: string }> } {
  const allow = new Set(offered.map((u) => u.replace(/\/+$/, "")));
  const kept = claimed.filter((c) => allow.has(String(c.url ?? "").replace(/\/+$/, "")));
  return { kept, dropped: claimed.filter((c) => !kept.includes(c)) };
}

function parse(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, max)
    : [];
}

export interface ResearchInput {
  clientId: string;
  name: string;
  company: string;
  email?: string;
  url?: string;
}

export async function researchAccount(
  input: ResearchInput,
): Promise<{ ok: boolean; record?: AccountResearch; problem?: string }> {
  const domain = input.url ? "" : domainOf(input.email ?? "");
  const target = (input.url ?? (domain ? `https://${domain}` : "")).trim();
  if (!target) {
    return { ok: false, problem: `${input.company} has no website and no email domain to read.` };
  }
  if (writerMode() !== "subscription") {
    return { ok: false, problem: "The Claude CLI is not available on this Mac, so there is nothing to read the pages with." };
  }

  const candidates = [target, `${target}/about`, `${target}/contact`].slice(0, MAX_PAGES);
  const pages: Array<{ url: string; text: string }> = [];
  for (const url of candidates) {
    const text = await readArticle(url, { maxChars: MAX_CHARS_PER_PAGE });
    if (text) pages.push({ url, text });
  }
  if (!pages.length) {
    return { ok: false, problem: `Nothing readable at ${target}. The site may be blocked or entirely JavaScript.` };
  }

  const sources = pages
    .map((p, i) => `[${i + 1}] ${p.url}\n${p.text.slice(0, MAX_CHARS_PER_PAGE)}`)
    .join("\n\n");

  const prompt = [
    `Read these pages about ${input.company} and answer for a cold email to ${input.name}.`,
    "Every claim in evidence must cite one of the URLs below and must be supported by its text.",
    "Never cite a URL that is not listed. If you cannot support a claim, leave it out.",
    "",
    sources,
    "",
    'Answer with JSON only: {"summary": "...", "angles": ["...","...","..."], "evidence": [{"claim":"...","url":"..."}], "questions": ["..."]}',
  ].join("\n");

  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { timeoutMs: RESEARCH_TIMEOUT_MS });
  } catch (err) {
    return { ok: false, problem: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parse(raw);
  if (!parsed) return { ok: false, problem: "The model did not answer with JSON." };

  const claimed = Array.isArray(parsed.evidence)
    ? (parsed.evidence as Array<{ claim?: unknown; url?: unknown }>)
        .filter((e) => e && typeof e.claim === "string" && typeof e.url === "string")
        .map((e) => ({ claim: e.claim as string, url: e.url as string }))
    : [];
  const { kept, dropped } = keepOfferedUrls(claimed, pages.map((p) => p.url));

  const violations: ResearchViolation[] = dropped.map((d) => ({
    severity: "error",
    rule: "fabricatedSource",
    detail: `Cited ${d.url}, which was never read. The claim was: ${d.claim}`,
  }));

  const record: AccountResearch = {
    id: newId("res"),
    clientId: input.clientId,
    url: target,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    angles: strings(parsed.angles, 3),
    evidence: kept,
    questions: strings(parsed.questions, 5),
    writerMode: writerMode(),
    violations,
    createdAt: new Date().toISOString(),
  };
  putResearch(record);
  return { ok: true, record };
}
