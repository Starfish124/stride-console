import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

import {
  articlePath,
  buildCommitMessage,
  currentBranch,
  isGitRepo,
  publish,
  renderMarkdown,
} from "../lib/seo/publish.ts";
import {
  buildAssertion,
  dateRange,
  emptyStats,
  localeOfPage,
  statsByTerm,
  status,
} from "../lib/seo/searchConsole.ts";

const ARTICLE = {
  id: "art_1",
  briefId: "br_1",
  slug: "ai-consultant-for-small-business",
  locale: "en",
  title: 'What an "AI consultant" for small business does',
  description: "What the job is day to day, what it costs, and how to spot a good one.",
  body: "## What the job is\n\nThey watch how work moves, then automate two things.",
  primaryKeyword: "ai consultant for small business",
  secondaryKeywords: ["affordable ai consultant"],
  cluster: "cl_en_ai-consultant",
  role: "spoke",
  internalLinks: [{ href: "/services", anchor: "our AI services" }],
  sources: [{ title: "A report", url: "https://example.com/x", publisher: "Example" }],
  wordCount: 12,
  status: "approved",
  lint: { errors: 0, warns: 0, violations: [] },
  placement: {
    inTitle: true, inH1: true, inSlug: true, inDescription: true,
    inFirstParagraph: true, inAnyHeading: true, occurrences: 1, missing: [], ok: true,
  },
  createdAt: "2026-07-26T09:00:00.000Z",
  publishedAt: "2026-07-26T09:00:00.000Z",
  writerMode: "subscription",
};

// ---------- markdown ----------

test("renderMarkdown produces frontmatter the site can read", () => {
  const md = renderMarkdown(ARTICLE);
  assert.match(md, /^---\n/);
  assert.match(md, /\ndate: "2026-07-26"\n/);
  assert.match(md, /\nprimaryKeyword: "ai consultant for small business"\n/);
  assert.match(md, /\n {2}- "affordable ai consultant"\n/);
  assert.match(md, /\nauthoredBy: "seo-agent"\n/);
  assert.match(md, /\n## What the job is\n/);
});

test("renderMarkdown escapes quotes so a title cannot break the frontmatter", () => {
  const md = renderMarkdown(ARTICLE);
  assert.match(md, /title: "What an \\"AI consultant\\" for small business does"/);
  // And the result must still parse as YAML-ish key/value lines.
  const frontmatter = md.split("---")[1];
  assert.ok(frontmatter.includes("description:"));
});

test("renderMarkdown carries sources through for the reference list", () => {
  const md = renderMarkdown(ARTICLE);
  assert.match(md, /sources:\n {2}- title: "A report"\n {4}url: "https:\/\/example\.com\/x"/);
});

test("articlePath uses the slug and locale the site route expects", () => {
  assert.equal(
    articlePath("/repo", ARTICLE),
    "/repo/content/blog/ai-consultant-for-small-business.en.md",
  );
  assert.equal(
    articlePath("/repo", { ...ARTICLE, locale: "nl" }),
    "/repo/content/blog/ai-consultant-for-small-business.nl.md",
  );
});

// ---------- commit messages ----------

test("the commit message names the keyword and the human approval", () => {
  const msg = buildCommitMessage([ARTICLE], new Date("2026-07-26T09:00:00Z"));
  assert.match(msg, /^content: What an "AI consultant" for small business does/);
  assert.match(msg, /approved by a human before publication/);
  assert.match(msg, /ai consultant for small business/);
});

test("a metadata-only run gets its own message", () => {
  const msg = buildCommitMessage([], new Date("2026-07-26T09:00:00Z"));
  assert.match(msg, /^seo: metadata pass 2026-07-26/);
});

// ---------- git ----------

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-seo-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  fs.mkdirSync(path.join(dir, "content", "seo"), { recursive: true });
  fs.writeFileSync(path.join(dir, "content", "seo", "pages.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-qm", "seed"], { cwd: dir });
  return dir;
}

test("publish writes the article and commits it", () => {
  const repo = tempRepo();
  try {
    const result = publish([ARTICLE], { repo });
    assert.equal(result.ok, true, result.message);
    assert.ok(result.commit, "a commit sha is returned");
    assert.equal(result.pushed, false, "push is opt-in");
    assert.ok(
      fs.existsSync(path.join(repo, "content/blog/ai-consultant-for-small-business.en.md")),
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("publish leaves a founder's unrelated edits alone", () => {
  const repo = tempRepo();
  try {
    // Somebody is midway through editing the homepage in the same checkout.
    fs.writeFileSync(path.join(repo, "README.md"), "half-finished edit\n");
    publish([ARTICLE], { repo });
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
    assert.match(
      status.stdout,
      /README\.md/,
      "the unrelated change must still be uncommitted, not swept into the agent's commit",
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("publish reports nothing to do rather than making an empty commit", () => {
  const repo = tempRepo();
  try {
    publish([ARTICLE], { repo });
    const second = publish([ARTICLE], { repo });
    assert.equal(second.ok, true);
    assert.match(second.message, /nothing to publish/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("publish refuses a directory that is not a repository", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-norepo-"));
  try {
    const result = publish([ARTICLE], { repo: dir });
    assert.equal(result.ok, false);
    assert.match(result.message, /not a git repository/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isGitRepo and currentBranch read a real checkout", () => {
  const repo = tempRepo();
  try {
    assert.equal(isGitRepo(repo), true);
    assert.equal(currentBranch(repo), "main");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------- search console ----------

test("status reports not-configured with the path it looked in", () => {
  const s = status();
  if (!s.configured) {
    assert.match(s.reason, /No service account key at/);
    assert.match(s.reason, /docs\/SEO\.md/);
  }
});

test("emptyStats is explicitly unavailable rather than a row of zeroes", () => {
  const s = emptyStats("2026-07-01", "2026-07-24", "not configured");
  assert.equal(s.available, false);
  assert.equal(s.reason, "not configured");
  assert.equal(s.queries.length, 0);
});

test("dateRange ends two days back, because Search Console lags", () => {
  const { from, to } = dateRange(28, new Date("2026-07-26T12:00:00Z"));
  assert.equal(to, "2026-07-24");
  assert.equal(from, "2026-06-26");
});

test("buildAssertion signs a JWT the token endpoint would accept", () => {
  const { privateKey } = crypto_generateKeyPair();
  const jwt = buildAssertion(
    { client_email: "bot@example.iam.gserviceaccount.com", private_key: privateKey },
    new Date("2026-07-26T00:00:00Z"),
  );
  const [header, claims, signature] = jwt.split(".");
  assert.ok(header && claims && signature);
  const decoded = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(decoded.iss, "bot@example.iam.gserviceaccount.com");
  assert.equal(decoded.aud, "https://oauth2.googleapis.com/token");
  assert.equal(decoded.exp - decoded.iat, 3600);
});

function crypto_generateKeyPair() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKey };
}

test("statsByTerm keys queries for lookup against stored keywords", () => {
  const map = statsByTerm({
    ...emptyStats("a", "b", "x"),
    queries: [{ query: "AI Consultant NL", clicks: 3, impressions: 90, ctr: 0.03, position: 8 }],
  });
  assert.equal(map.get("ai consultant nl").clicks, 3);
});

test("localeOfPage reads the locale out of the URL", () => {
  assert.equal(localeOfPage("https://stride-ai.nl/nl/blog/wat-is-een-ai-agent"), "nl");
  assert.equal(localeOfPage("https://stride-ai.nl/blog/what-is-an-ai-agent"), "en");
  assert.equal(localeOfPage("not a url"), "en");
});
