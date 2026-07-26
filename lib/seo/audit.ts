// On-page auditor. Fetches each live page, reads what a crawler would read,
// and scores it against the keyword that page is supposed to own.
//
// HTML parsing is regex-based on purpose. The alternative is a DOM library,
// and everything needed here (title, meta, headings, links, alt text, JSON-LD)
// sits in tags that are trivially matchable. A dependency that parses arbitrary
// broken HTML would buy accuracy this does not need.
//
// The site is statically exported, so what the fetch returns is what Google
// sees. There is no client-rendered content to miss.

import {
  type AuditFinding,
  type Locale,
  type PageAudit,
  type PlacementResult,
  type Severity,
} from "./types.ts";

// Google truncates around 580px, which lands near 60 characters for a typical
// title. Below 30 the page is usually under-describing itself.
const TITLE_MIN = 30;
const TITLE_MAX = 60;
// Descriptions get cut around 155-160 characters on desktop.
const DESC_MIN = 110;
const DESC_MAX = 160;
const THIN_CONTENT_WORDS = 300;

/** Function words that carry no targeting signal in a keyword phrase. */
const PLACEMENT_STOPWORDS = new Set([
  "the", "a", "an", "for", "of", "to", "in", "on", "and", "or", "with", "is",
  "are", "what", "how", "why", "your", "you",
  "de", "het", "een", "voor", "van", "naar", "op", "en", "met", "wat", "hoe",
]);

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return decodeEntities(m[1]);
  }
  return undefined;
}

export interface ParsedPage {
  title?: string;
  description?: string;
  h1?: string;
  h1Count: number;
  headings: { level: number; text: string }[];
  text: string;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imageCount: number;
  imagesMissingAlt: number;
  canonical?: string;
  schemaTypes: string[];
}

export function parseHtml(html: string, origin: string): ParsedPage {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  const headings: { level: number; text: string }[] = [];
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null) {
    const text = stripTags(hm[2]);
    if (text) headings.push({ level: Number(hm[1]), text });
  }
  const h1s = headings.filter((h) => h.level === 1);

  let internalLinks = 0;
  let externalLinks = 0;
  const linkRe = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html)) !== null) {
    const href = lm[1];
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/") || href.startsWith(origin)) internalLinks++;
    else if (/^https?:\/\//i.test(href)) externalLinks++;
  }

  let imageCount = 0;
  let imagesMissingAlt = 0;
  const imgRe = /<img\b[^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    imageCount++;
    const alt = /alt=["']([^"']*)["']/i.exec(im[0]);
    if (!alt || alt[1].trim() === "") imagesMissingAlt++;
  }

  const schemaTypes: string[] = [];
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = ldRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(sm[1].trim());
      const nodes = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
      for (const node of nodes) {
        if (node && typeof node["@type"] === "string") schemaTypes.push(node["@type"]);
      }
    } catch {
      // Malformed JSON-LD is itself a finding, reported by the scorer below
      // via the absence of any recognised type.
    }
  }

  // Body text only. Nav and footer repeat on every page, so counting them
  // would make a thin page look substantial.
  const bodyMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const text = stripTags(bodyMatch ? bodyMatch[1] : html);

  const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html);

  return {
    title: titleMatch ? stripTags(titleMatch[1]) : undefined,
    description: metaContent(html, "description"),
    h1: h1s[0]?.text,
    h1Count: h1s.length,
    headings,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    internalLinks,
    externalLinks,
    imageCount,
    imagesMissingAlt,
    canonical: canonical ? canonical[1] : undefined,
    schemaTypes,
  };
}

/**
 * The words of a keyword that carry targeting signal.
 *
 * Filtered by the stopword list only, never by length. An earlier version
 * dropped tokens shorter than three characters, which silently discarded "ai"
 * from every keyword in an AI consultancy's keyword set, so "a consultancy in
 * the Netherlands" counted as targeting "ai consultancy netherlands".
 */
function significantTokens(phrase: string): string[] {
  const out = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9à-ÿ]/g, ""))
    .filter((t) => t.length > 0 && !PLACEMENT_STOPWORDS.has(t));
  // A phrase made entirely of stopwords has no signal to match on; fall back
  // to requiring the literal phrase rather than matching everything.
  return out.length > 0 ? out : [phrase.toLowerCase()];
}

/**
 * Whether a piece of copy targets a keyword: the exact phrase, or all of its
 * significant words.
 *
 * Exported so the optimiser validates against exactly what the auditor grades,
 * and so a writer can bend the phrase into a real sentence. "An AI consultancy
 * in the Netherlands" targets "ai consultancy netherlands"; demanding the rigid
 * phrase produced "AI consultancy Netherlands businesses hire for practical
 * integration", which no person would write.
 */
export function coversKeyword(text: string, keyword: string): boolean {
  const hay = text.toLowerCase();
  const needle = keyword.toLowerCase().trim();
  if (hay.includes(needle)) return true;
  return significantTokens(needle).every((t) => hay.includes(t));
}

/**
 * Where the primary keyword landed, against the required placements from the
 * claude-seo keyword-placement rules: title, H1, slug, meta description, first
 * hundred words, and at least one heading.
 *
 * There is no density target. Google has not rewarded a percentage in years,
 * and chasing one is how copy ends up unreadable.
 */
export function checkPlacement(
  keyword: string,
  parts: { title?: string; description?: string; h1?: string; slug: string; text: string; headings?: string[] },
): PlacementResult {
  const needle = keyword.toLowerCase().trim();

  // Significant tokens of the keyword. Short function words are dropped
  // because "ai use cases for business" and "AI use cases, for a business"
  // are the same target and only one of them matches as a literal substring.
  const needleTokens = significantTokens(needle);

  /**
   * A slot counts as covered when it holds the exact phrase, or when it holds
   * every significant word of it.
   *
   * Requiring the literal phrase sounds stricter and is actually worse: Google
   * has matched meaning rather than strings for years, so a literal test flags
   * titles a human SEO would pass, and the optimiser then "fixes" a readable
   * title into a keyword-stuffed one. That trade loses clicks to gain nothing.
   */
  const has = (s?: string) => {
    if (!s) return false;
    const hay = s.toLowerCase();
    if (hay.includes(needle)) return true;
    if (needleTokens.length === 0) return false;
    return needleTokens.every((t) => hay.includes(t));
  };

  const firstHundred = parts.text.split(/\s+/).slice(0, 100).join(" ");
  const slugForm = needle.replace(/\s+/g, "-");

  const inTitle = has(parts.title);
  const inH1 = has(parts.h1);
  const inSlug = parts.slug.toLowerCase().includes(slugForm);
  const inDescription = has(parts.description);
  const inFirstParagraph = has(firstHundred);
  const inAnyHeading = (parts.headings ?? []).some((h) => h.toLowerCase().includes(needle));

  const occurrences = parts.text.toLowerCase().split(needle).length - 1;

  const missing: string[] = [];
  if (!inTitle) missing.push("title");
  if (!inH1) missing.push("h1");
  if (!inSlug) missing.push("url slug");
  if (!inDescription) missing.push("meta description");
  if (!inFirstParagraph) missing.push("first 100 words");

  return {
    inTitle,
    inH1,
    inSlug,
    inDescription,
    inFirstParagraph,
    inAnyHeading,
    occurrences,
    missing,
    // The slug is excluded from the pass condition: renaming a live URL to
    // chase a keyword costs every link already pointing at it, which is a
    // worse trade than the placement is worth.
    ok: inTitle && inH1 && inDescription && inFirstParagraph,
  };
}

const SEVERITY_COST: Record<Severity, number> = {
  critical: 30,
  high: 15,
  medium: 7,
  low: 3,
};

/** Grade a parsed page. Pure, so the scoring rules are testable without a network. */
export function scorePage(
  parsed: ParsedPage,
  context: { route: string; primaryKeyword?: string; isArticle?: boolean },
): { findings: AuditFinding[]; score: number; placement?: PlacementResult } {
  const findings: AuditFinding[] = [];
  const add = (f: AuditFinding) => findings.push(f);

  // ---- title ----
  if (!parsed.title) {
    add({
      rule: "title.missing",
      severity: "critical",
      detail: "The page has no title tag.",
      recommendation: "Add a title of 30 to 60 characters leading with the primary keyword.",
      autoFixable: true,
    });
  } else {
    const len = parsed.title.length;
    if (len > TITLE_MAX) {
      add({
        rule: "title.tooLong",
        severity: "medium",
        detail: `Title is ${len} characters; Google truncates around ${TITLE_MAX}.`,
        recommendation: `Cut to ${TITLE_MAX} characters or fewer, keeping the keyword at the front.`,
        autoFixable: true,
      });
    } else if (len < TITLE_MIN) {
      add({
        rule: "title.tooShort",
        severity: "low",
        detail: `Title is only ${len} characters, which wastes space in the result.`,
        recommendation: `Expand toward ${TITLE_MAX} characters with a real qualifier.`,
        autoFixable: true,
      });
    }
  }

  // ---- description ----
  if (!parsed.description) {
    add({
      rule: "description.missing",
      severity: "high",
      detail: "No meta description, so Google writes its own from page text.",
      recommendation: `Add a description of ${DESC_MIN} to ${DESC_MAX} characters.`,
      autoFixable: true,
    });
  } else {
    const len = parsed.description.length;
    if (len > DESC_MAX) {
      add({
        rule: "description.tooLong",
        severity: "low",
        detail: `Description is ${len} characters and will be cut around ${DESC_MAX}.`,
        recommendation: `Trim to ${DESC_MAX} characters, front-loading the reason to click.`,
        autoFixable: true,
      });
    } else if (len < DESC_MIN) {
      add({
        rule: "description.tooShort",
        severity: "low",
        detail: `Description is ${len} characters, short of the ${DESC_MIN} that fills the snippet.`,
        recommendation: `Expand toward ${DESC_MAX} characters.`,
        autoFixable: true,
      });
    }
  }

  // ---- headings ----
  if (parsed.h1Count === 0) {
    add({
      rule: "h1.missing",
      severity: "high",
      detail: "No H1 on the page.",
      recommendation: "Add exactly one H1 containing the primary keyword.",
      autoFixable: false,
    });
  } else if (parsed.h1Count > 1) {
    add({
      rule: "h1.multiple",
      severity: "medium",
      detail: `${parsed.h1Count} H1 tags found; the page topic reads as ambiguous.`,
      recommendation: "Keep one H1 and demote the rest to H2.",
      autoFixable: false,
    });
  }

  const h2Count = parsed.headings.filter((h) => h.level === 2).length;
  if (parsed.wordCount > 600 && h2Count === 0) {
    add({
      rule: "headings.flat",
      severity: "medium",
      detail: "Long page with no H2 structure.",
      recommendation: "Break the content into sections with descriptive H2s.",
      autoFixable: false,
    });
  }

  // ---- content ----
  if (parsed.wordCount < THIN_CONTENT_WORDS) {
    add({
      rule: "content.thin",
      severity: context.isArticle ? "critical" : "medium",
      detail: `Only ${parsed.wordCount} words of body copy.`,
      recommendation: `Expand past ${THIN_CONTENT_WORDS} words, or merge the page into a stronger one.`,
      autoFixable: false,
    });
  }

  // ---- links ----
  if (parsed.internalLinks < 3) {
    add({
      rule: "links.orphan",
      severity: "medium",
      detail: `Only ${parsed.internalLinks} internal links out of this page.`,
      recommendation: "Link to at least three related pages using descriptive anchor text.",
      autoFixable: false,
    });
  }

  // ---- images ----
  if (parsed.imagesMissingAlt > 0) {
    add({
      rule: "images.alt",
      severity: "low",
      detail: `${parsed.imagesMissingAlt} of ${parsed.imageCount} images have no alt text.`,
      recommendation: "Describe each image; it is a free keyword placement and an accessibility fix.",
      autoFixable: false,
    });
  }

  // ---- canonical ----
  if (!parsed.canonical) {
    add({
      rule: "canonical.missing",
      severity: "medium",
      detail: "No canonical link, so duplicate URLs can split ranking signals.",
      recommendation: "Emit a self-referencing canonical.",
      autoFixable: false,
    });
  }

  // ---- schema ----
  if (parsed.schemaTypes.length === 0) {
    add({
      rule: "schema.missing",
      severity: context.isArticle ? "high" : "medium",
      detail: "No structured data found.",
      recommendation: context.isArticle
        ? "Add Article schema with datePublished and author."
        : "Add Organization or WebSite schema.",
      autoFixable: false,
    });
  }

  // ---- keyword placement ----
  let placement: PlacementResult | undefined;
  if (context.primaryKeyword) {
    placement = checkPlacement(context.primaryKeyword, {
      title: parsed.title,
      description: parsed.description,
      h1: parsed.h1,
      slug: context.route,
      text: parsed.text,
      headings: parsed.headings.map((h) => h.text),
    });

    for (const slot of placement.missing) {
      const fixable = slot === "title" || slot === "meta description";
      add({
        rule: `keyword.missing.${slot.replace(/\s+/g, "-")}`,
        severity: slot === "url slug" ? "low" : "high",
        detail: `Primary keyword "${context.primaryKeyword}" is absent from the ${slot}.`,
        recommendation: `Work "${context.primaryKeyword}" into the ${slot} without forcing it.`,
        autoFixable: fixable,
      });
    }

    if (placement.occurrences > 0 && parsed.wordCount > 0) {
      const density = placement.occurrences / parsed.wordCount;
      // Not a Google rule. Past roughly 3.5% the copy reads as written for a
      // crawler, which readers notice before an algorithm does.
      if (density > 0.035) {
        add({
          rule: "keyword.stuffed",
          severity: "high",
          detail: `"${context.primaryKeyword}" appears ${placement.occurrences} times in ${parsed.wordCount} words.`,
          recommendation: "Replace most mentions with natural variations and pronouns.",
          autoFixable: false,
        });
      }
    }
  }

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_COST[f.severity], 0);
  return { findings, score: Math.max(0, 100 - penalty), placement };
}

/** Fetch and audit one URL. A dead page is a finding, never a thrown sweep. */
export async function auditUrl(
  url: string,
  context: { route: string; locale: Locale; primaryKeyword?: string; isArticle?: boolean },
  options: { timeoutMs?: number } = {},
): Promise<PageAudit> {
  const { timeoutMs = 20_000 } = options;
  const fetchedAt = new Date().toISOString();
  const origin = new URL(url).origin;

  const base: PageAudit = {
    route: context.route,
    locale: context.locale,
    url,
    fetchedAt,
    ok: false,
    h1Count: 0,
    headings: [],
    wordCount: 0,
    internalLinks: 0,
    externalLinks: 0,
    imagesMissingAlt: 0,
    imageCount: 0,
    hasSchema: false,
    schemaTypes: [],
    primaryKeyword: context.primaryKeyword,
    findings: [],
    score: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "StrideSeoBot/1.0 (+https://stride-ai.nl)" },
    });
    if (!res.ok) {
      return {
        ...base,
        status: res.status,
        error: `HTTP ${res.status}`,
        findings: [
          {
            rule: "page.unreachable",
            severity: "critical",
            detail: `${url} returned HTTP ${res.status}.`,
            recommendation: "Fix the route or remove it from the sitemap.",
            autoFixable: false,
          },
        ],
      };
    }

    const html = await res.text();
    const parsed = parseHtml(html, origin);
    const { findings, score, placement } = scorePage(parsed, context);

    return {
      ...base,
      ok: true,
      status: res.status,
      title: parsed.title,
      titleLength: parsed.title?.length,
      description: parsed.description,
      descriptionLength: parsed.description?.length,
      h1: parsed.h1,
      h1Count: parsed.h1Count,
      headings: parsed.headings,
      wordCount: parsed.wordCount,
      internalLinks: parsed.internalLinks,
      externalLinks: parsed.externalLinks,
      imageCount: parsed.imageCount,
      imagesMissingAlt: parsed.imagesMissingAlt,
      canonical: parsed.canonical,
      hasSchema: parsed.schemaTypes.length > 0,
      schemaTypes: parsed.schemaTypes,
      placement,
      findings,
      score,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      error: message,
      findings: [
        {
          rule: "page.unreachable",
          severity: "critical",
          detail: `${url} could not be fetched: ${message}`,
          recommendation: "Check the site is up and the route still exists.",
          autoFixable: false,
        },
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}
