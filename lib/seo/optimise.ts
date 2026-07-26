// The optimiser. Turns audit findings into concrete edits to the website's
// content/seo/pages.json.
//
// The model proposes; this module disposes. Every candidate title and
// description is checked deterministically before it can be applied: length
// bounds, keyword present, and the same voice gate the LinkedIn posts pass. A
// proposal that fails validation is dropped rather than applied with a warning,
// because this runs unattended and "applied with a warning" means "live and
// wrong until somebody reads a log".

import fs from "node:fs";
import path from "node:path";
import { callClaudeCli } from "../pipeline/write.ts";
import { lint } from "../pipeline/lint.ts";
import type { SiteRoute } from "./organiser.ts";
import { type Locale, type MetaChange, type PageAudit } from "./types.ts";

const TITLE_MAX = 60;
const TITLE_MIN = 30;
const DESC_MAX = 160;
const DESC_MIN = 110;

export interface PagesFile {
  revision: number;
  updatedAt: string;
  updatedBy: string;
  site: {
    baseUrl: string;
    defaultLocale: Locale;
    locales: Locale[];
    titleTemplate: string;
  };
  pages: {
    route: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
    changedBy?: string;
    changeNote?: string;
    noIndexFromSitemap?: boolean;
    locales: Partial<
      Record<
        Locale,
        {
          title: string;
          titleAbsolute?: boolean;
          description: string;
          ogTitle?: string;
          ogDescription?: string;
        }
      >
    >;
  }[];
}

export function pagesFilePath(siteRepo: string): string {
  return path.join(siteRepo, "content", "seo", "pages.json");
}

export function readPagesFile(siteRepo: string): PagesFile {
  return JSON.parse(fs.readFileSync(pagesFilePath(siteRepo), "utf8")) as PagesFile;
}

export function writePagesFile(siteRepo: string, file: PagesFile): void {
  const target = pagesFilePath(siteRepo);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, target);
}

/** Flatten pages.json into the shape the keyword organiser assigns against. */
export function toSiteRoutes(file: PagesFile): SiteRoute[] {
  const routes: SiteRoute[] = [];
  for (const page of file.pages) {
    for (const locale of Object.keys(page.locales) as Locale[]) {
      const meta = page.locales[locale];
      if (!meta) continue;
      routes.push({
        route: page.route,
        locale,
        title: meta.title,
        description: meta.description,
        primaryKeyword: page.primaryKeyword,
        secondaryKeywords: page.secondaryKeywords,
        kind: page.route.startsWith("/blog/") ? "article" : "page",
      });
    }
  }
  return routes;
}

export interface Validation {
  ok: boolean;
  problems: string[];
}

/**
 * Gate a proposed title or description. Runs before anything is written, and
 * the same rules the auditor grades against, so the optimiser cannot "fix" a
 * page into a different finding.
 */
export function validateMeta(
  value: string,
  field: "title" | "description",
  keyword: string,
): Validation {
  const problems: string[] = [];
  const trimmed = value.trim();
  const [min, max] = field === "title" ? [TITLE_MIN, TITLE_MAX] : [DESC_MIN, DESC_MAX];

  if (trimmed.length < min) problems.push(`${field} is ${trimmed.length} chars, under ${min}`);
  if (trimmed.length > max) problems.push(`${field} is ${trimmed.length} chars, over ${max}`);

  if (!trimmed.toLowerCase().includes(keyword.toLowerCase())) {
    problems.push(`${field} does not contain the primary keyword "${keyword}"`);
  }

  if (/[—–]/.test(trimmed)) problems.push("contains an em or en dash");
  if (/["“”]/.test(trimmed)) problems.push("contains quote marks that break the JSON-LD cleanly");
  if (/\bhttps?:\/\//.test(trimmed)) problems.push("contains a URL");
  if (/[\p{Extended_Pictographic}]/u.test(trimmed)) problems.push("contains an emoji");
  if (trimmed.includes("!")) problems.push("contains an exclamation mark");

  // The voice gate. Its banned-word list is shared with every other piece of
  // Stride writing, so one edit to that list updates search snippets too.
  const voice = lint(trimmed);
  for (const v of voice.violations) {
    if (v.severity === "error" && ["bannedWords", "ceremonyVerbs", "falseDepth"].includes(v.rule)) {
      problems.push(`voice gate: ${v.rule} (${v.excerpt})`);
    }
  }

  return { ok: problems.length === 0, problems };
}

interface Candidate {
  route: string;
  locale: Locale;
  field: "title" | "description";
  current: string;
  keyword: string;
  reason: string;
}

/** Findings the optimiser can act on by editing pages.json alone. */
export function candidatesFrom(audits: PageAudit[], file: PagesFile): Candidate[] {
  const out: Candidate[] = [];

  for (const audit of audits) {
    if (!audit.ok) continue;
    const page = file.pages.find((p) => p.route === audit.route);
    const meta = page?.locales[audit.locale];
    if (!page || !meta) continue;

    const fixable = audit.findings.filter((f) => f.autoFixable);
    const titleReasons = fixable
      .filter((f) => f.rule.startsWith("title.") || f.rule === "keyword.missing.title")
      .map((f) => f.detail);
    const descReasons = fixable
      .filter(
        (f) => f.rule.startsWith("description.") || f.rule === "keyword.missing.meta-description",
      )
      .map((f) => f.detail);

    if (titleReasons.length > 0) {
      out.push({
        route: audit.route,
        locale: audit.locale,
        field: "title",
        current: meta.title,
        keyword: page.primaryKeyword,
        reason: titleReasons.join(" "),
      });
    }
    if (descReasons.length > 0) {
      out.push({
        route: audit.route,
        locale: audit.locale,
        field: "description",
        current: meta.description,
        keyword: page.primaryKeyword,
        reason: descReasons.join(" "),
      });
    }
  }

  return out;
}

const LANGUAGE_NAME: Record<Locale, string> = { en: "English", nl: "Dutch" };

function buildPrompt(c: Candidate): string {
  const [min, max] = c.field === "title" ? [TITLE_MIN, TITLE_MAX] : [DESC_MIN, DESC_MAX];
  return `You write search result snippets for Stride AI, an AI consultancy in the Netherlands.

Rewrite one ${c.field} for the page ${c.route}.

Language: ${LANGUAGE_NAME[c.locale]}. Write only in this language.
Primary keyword, which must appear verbatim: "${c.keyword}"
Current ${c.field}: "${c.current}"
Why it is being changed: ${c.reason}

Hard requirements:
- Between ${min} and ${max} characters. This is measured, not estimated.
- Contains "${c.keyword}" exactly, as early as reads naturally.
- No em dashes, no en dashes, no emoji, no exclamation marks, no quote marks.
- Plain, concrete, specific. Say what the page gives the reader.
- Banned words: delve, leverage, unlock, empower, seamless, robust, holistic,
  cutting-edge, transformative, revolutionise, harness, elevate, journey,
  landscape, in today's, fast-paced.
- No "serves as", "stands as", "boasts a". Write "is" or "has".
${c.field === "description" ? "- End with a reason to click, not a full stop after a vague claim." : "- Front-load the keyword; the brand name is appended automatically, so do not add it."}

Reply with JSON only, no prose around it:
{"${c.field}": "..."}`;
}

function parseField(raw: string, field: "title" | "description"): string | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const value = parsed[field];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ask the model for a replacement, then validate it. One retry, with the exact
 * problems listed, because the usual failure is a length miss the model can
 * correct when told the real count.
 */
export async function proposeChange(c: Candidate): Promise<MetaChange | undefined> {
  let prompt = buildPrompt(c);

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callClaudeCli(prompt);
    } catch {
      return undefined;
    }

    const value = parseField(raw, c.field);
    if (!value) return undefined;

    const check = validateMeta(value, c.field, c.keyword);
    if (check.ok) {
      if (value.trim() === c.current.trim()) return undefined;
      return {
        route: c.route,
        locale: c.locale,
        field: c.field,
        before: c.current,
        after: value.trim(),
        reason: c.reason,
      };
    }

    prompt = `${buildPrompt(c)}

Your previous attempt was rejected:
"${value}"
(${value.length} characters)

Problems:
${check.problems.map((p) => `- ${p}`).join("\n")}

Fix exactly these and reply with the JSON again.`;
  }

  return undefined;
}

/** Apply validated changes to pages.json and bump the revision. */
export function applyChanges(
  siteRepo: string,
  changes: MetaChange[],
  now = new Date(),
): { applied: MetaChange[]; file: PagesFile } {
  const file = readPagesFile(siteRepo);
  const applied: MetaChange[] = [];

  for (const change of changes) {
    const page = file.pages.find((p) => p.route === change.route);
    const meta = page?.locales[change.locale];
    if (!page || !meta) continue;
    // The page moved on since the audit; applying a stale edit would overwrite
    // whatever replaced it.
    if (meta[change.field] !== change.before) continue;

    meta[change.field] = change.after;
    if (change.field === "title") meta.ogTitle = change.after;
    if (change.field === "description") meta.ogDescription = change.after;

    page.changedBy = "seo-agent";
    page.changeNote = change.reason.slice(0, 200);
    applied.push({ ...change, appliedAt: now.toISOString() });
  }

  if (applied.length > 0) {
    file.revision += 1;
    file.updatedAt = now.toISOString();
    file.updatedBy = "seo-agent";
    writePagesFile(siteRepo, file);
  }

  return { applied, file };
}
