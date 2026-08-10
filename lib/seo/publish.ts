// The publisher. Writes approved articles and applied metadata into the
// website checkout, commits, and pushes so the host rebuilds.
// (stride-ai.nl is on Cloudflare Pages; the netlify.toml in that repo is a
// leftover and is not what builds it.)
//
// Publishing through git rather than a database is deliberate. Every article
// and every title change lands as a reviewable diff with an author and a
// message, the whole site history is one `git log`, and a bad run is undone by
// `git revert` rather than by finding the right row. It also means the agent
// never needs write access to anything but a repository.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getConfig, saveArticle } from "./store.ts";
import type { SeoArticle } from "./types.ts";

export interface GitResult {
  ok: boolean;
  output: string;
  commit?: string;
}

function git(repo: string, args: string[], timeoutMs = 120_000): GitResult {
  const res = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      // Never let git open an editor or a credential prompt in a headless run.
      GIT_TERMINAL_PROMPT: "0",
      GIT_EDITOR: "true",
    },
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  return { ok: res.status === 0, output };
}

export function isGitRepo(repo: string): boolean {
  return fs.existsSync(path.join(repo, ".git"));
}

/** Current branch, or undefined if the checkout is detached or broken. */
export function currentBranch(repo: string): string | undefined {
  const res = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = res.output.trim();
  return res.ok && name && name !== "HEAD" ? name : undefined;
}

export function hasUncommittedChanges(repo: string): boolean {
  const res = git(repo, ["status", "--porcelain"]);
  return res.ok && res.output.trim().length > 0;
}

function escapeYaml(value: string): string {
  // Double-quoted YAML scalar: backslashes and double quotes are the only
  // characters that need escaping, and this keeps colons and hashes safe
  // without guessing at block styles.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Markdown file for an article, frontmatter matching src/lib/content.ts. */
export function renderMarkdown(article: SeoArticle, now = new Date()): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${escapeYaml(article.title)}`);
  lines.push(`description: ${escapeYaml(article.description)}`);
  lines.push(`date: ${escapeYaml((article.publishedAt ?? now.toISOString()).slice(0, 10))}`);
  lines.push(`primaryKeyword: ${escapeYaml(article.primaryKeyword)}`);

  if (article.secondaryKeywords.length > 0) {
    lines.push("secondaryKeywords:");
    for (const k of article.secondaryKeywords) lines.push(`  - ${escapeYaml(k)}`);
  }

  lines.push('author: "Stride AI"');
  lines.push(`cluster: ${escapeYaml(article.cluster)}`);
  lines.push(`role: ${escapeYaml(article.role)}`);

  if (article.internalLinks.length > 0) {
    lines.push("internalLinks:");
    for (const l of article.internalLinks) {
      lines.push(`  - href: ${escapeYaml(l.href)}`);
      lines.push(`    anchor: ${escapeYaml(l.anchor)}`);
    }
  }

  if (article.sources.length > 0) {
    lines.push("sources:");
    for (const s of article.sources) {
      lines.push(`  - title: ${escapeYaml(s.title)}`);
      lines.push(`    url: ${escapeYaml(s.url)}`);
      if (s.publisher) lines.push(`    publisher: ${escapeYaml(s.publisher)}`);
    }
  }

  // Marks machine-written articles in the repo itself, so a reader of the
  // content directory can tell them apart without checking the console.
  lines.push('authoredBy: "seo-agent"');
  lines.push("---");
  lines.push("");
  lines.push(article.body.trim());
  lines.push("");

  return lines.join("\n");
}

export function articlePath(repo: string, article: SeoArticle): string {
  return path.join(repo, "content", "blog", `${article.slug}.${article.locale}.md`);
}

/**
 * What is actually live on the site, read from the files in the checkout.
 *
 * `usedSlugs()` in store.ts looks like this function and answers a different
 * question: what has THIS console drafted. That store is under data/, which is
 * gitignored and exists on one Mac — clear it, or run on a fresh machine, and
 * the console believes nothing has ever been published while the site still
 * carries every article. The markdown files are the record that survives.
 *
 * Keyed slug:locale, because the Dutch and English articles on one subject are
 * two pages and both are wanted.
 *
 * An unreadable directory returns an empty set rather than throwing. Failing
 * closed here would stop the writer entirely; failing open at worst re-queues a
 * brief the article store also has to admit to.
 */
export function publishedSlugs(repo: string): Set<string> {
  try {
    const dir = path.join(repo, "content", "blog");
    const keys = fs
      .readdirSync(dir)
      .map((file) => /^(.+)\.([a-z]{2})\.md$/.exec(file))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]}:${m[2]}`);
    return new Set(keys);
  } catch {
    return new Set();
  }
}

/**
 * The primary keyword every live article in one locale already owns.
 *
 * Two pages targeting one phrase is one page's traffic split in half, and the
 * slug check cannot see it: the Dutch twin of "ai agent pricing models" landed
 * on a free slug while its keyword, "ai agents voor bedrijven", was already the
 * target of the live n8n article. Slugs and keywords are different questions.
 *
 * Read from the checkout for the same reason `publishedSlugs` is: the markdown
 * is the record that survives a cleared data/ directory.
 */
export function publishedKeywords(repo: string, locale: string): Set<string> {
  try {
    const dir = path.join(repo, "content", "blog");
    const terms = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(`.${locale}.md`))
      .map((file) => /^primaryKeyword: "(.*)"$/m.exec(fs.readFileSync(path.join(dir, file), "utf8")))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1].trim().toLowerCase());
    return new Set(terms);
  } catch {
    return new Set();
  }
}

export interface PublishOptions {
  repo: string;
  /** Push to the remote. Off means commit locally and stop. */
  push?: boolean;
  branch?: string;
  now?: Date;
}

export interface PublishResult {
  ok: boolean;
  message: string;
  commit?: string;
  files: string[];
  pushed: boolean;
}

/**
 * Stage, commit and optionally push whatever the agent has changed in the
 * site checkout: new article files, and any metadata already written into
 * pages.json by the optimiser.
 *
 * Only paths the agent owns are staged. A blanket `git add -A` would sweep up
 * whatever a founder happened to be editing in that checkout and publish it
 * under the agent's name.
 */
export function publish(
  articles: SeoArticle[],
  options: PublishOptions,
): PublishResult {
  const { repo, push = false, now = new Date() } = options;
  const files: string[] = [];

  if (!isGitRepo(repo)) {
    return { ok: false, message: `${repo} is not a git repository`, files, pushed: false };
  }

  for (const article of articles) {
    const target = articlePath(repo, article);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, renderMarkdown(article, now), "utf8");
    files.push(path.relative(repo, target));
  }

  // Agent-owned data files. Named explicitly rather than globbed, because the
  // rule that a founder's work in this checkout never gets swept into the
  // agent's commit is only as good as this list.
  for (const owned of [
    path.join("content", "seo", "pages.json"),
    path.join("content", "seo", "faq.json"),
  ]) {
    if (fs.existsSync(path.join(repo, owned))) files.push(owned);
  }

  const add = git(repo, ["add", "--", ...files]);
  if (!add.ok) {
    return { ok: false, message: `git add failed: ${add.output}`, files, pushed: false };
  }

  const staged = git(repo, ["diff", "--cached", "--name-only"]);
  if (staged.output.trim() === "") {
    return { ok: true, message: "nothing to publish", files: [], pushed: false };
  }

  const message = buildCommitMessage(articles, now);
  const commit = git(repo, ["commit", "-m", message]);
  if (!commit.ok) {
    return { ok: false, message: `git commit failed: ${commit.output}`, files, pushed: false };
  }

  const sha = git(repo, ["rev-parse", "--short", "HEAD"]).output.trim();

  if (!push) {
    return {
      ok: true,
      message: `committed ${sha} locally, not pushed`,
      commit: sha,
      files,
      pushed: false,
    };
  }

  const branch = options.branch ?? currentBranch(repo) ?? "main";
  
  // Reconcile concurrent remote changes before pushing
  const pull = git(repo, ["pull", "--rebase", "origin", branch]);
  if (!pull.ok) {
    return {
      ok: false,
      message: `committed ${sha} but rebase pull failed: ${pull.output}`,
      commit: sha,
      files,
      pushed: false,
    };
  }

  const pushed = git(repo, ["push", "origin", branch], 180_000);
  if (!pushed.ok) {
    return {
      ok: false,
      // The commit exists locally, so the work is not lost and a retry only
      // needs to push.
      message: `committed ${sha} but push failed: ${pushed.output}`,
      commit: sha,
      files,
      pushed: false,
    };
  }

  return {
    ok: true,
    message: `published ${sha} to ${branch}`,
    commit: sha,
    files,
    pushed: true,
  };
}

export interface ArticleOutcome {
  ok: boolean;
  status: SeoArticle["status"];
  commit?: string;
  pushed: boolean;
  message: string;
  /** Set when the voice gate refused. */
  blockedBy?: SeoArticle["lint"]["violations"];
}

/**
 * Put one article on the site and record what became of it.
 *
 * Both the Publish button and the weekly writer come through here, so the
 * machine publishing itself can never be held to a laxer standard than a
 * person pressing the button. The voice gate is the hard stop in both cases:
 * a draft with errors is refused, and it stays in the queue to be read rather
 * than being quietly dropped.
 */
export function publishArticle(
  article: SeoArticle,
  options: { now?: Date } = {},
): ArticleOutcome {
  const { now = new Date() } = options;

  if (article.status === "published") {
    return { ok: false, status: "published", pushed: false, message: "Already published." };
  }

  if (article.lint.errors > 0) {
    const errors = article.lint.violations.filter((v) => v.severity === "error");
    return {
      ok: false,
      status: article.status,
      pushed: false,
      message: `The voice gate still reports ${article.lint.errors} error${
        article.lint.errors === 1 ? "" : "s"
      }. Edit the draft first.`,
      blockedBy: errors,
    };
  }

  const config = getConfig();
  article.publishedAt = now.toISOString();

  const result = publish([article], {
    repo: config.siteRepo,
    push: config.autoPublishOnApproval,
    now,
  });

  if (!result.ok) {
    // Leave it approved rather than drafted, so a retry after the repository
    // is fixed does not need the article written again.
    article.status = "approved";
    article.publishedAt = undefined;
    saveArticle(article);
    return { ok: false, status: "approved", pushed: false, message: result.message };
  }

  article.status = "published";
  article.commit = result.commit;
  saveArticle(article);

  return {
    ok: true,
    status: "published",
    commit: result.commit,
    pushed: result.pushed,
    message: result.pushed
      ? `Published as ${result.commit}. The site is rebuilding.`
      : `Committed as ${result.commit}. Push it when ready.`,
  };
}

export function buildCommitMessage(articles: SeoArticle[], now: Date): string {
  const date = now.toISOString().slice(0, 10);

  if (articles.length === 0) {
    return `seo: metadata pass ${date}\n\nTitle and description changes proposed by the SEO agent and applied\nafter passing length, keyword and voice-gate validation.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
  }

  const subject =
    articles.length === 1
      ? `content: ${articles[0].title}`
      : `content: ${articles.length} articles for ${date}`;

  const body = articles
    .map(
      (a) =>
        `- ${a.locale}/${a.slug}: "${a.primaryKeyword}" (${a.wordCount} words, ${a.sources.length} sources cited)`,
    )
    .join("\n");

  return `${subject}

Written by the SEO agent against a brief from the keyword organiser, and
approved by a human before publication. Each article passed the long-form
voice gate and the keyword placement check.

${body}

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
}
