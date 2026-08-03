// What happened today, across the whole machine.
//
// Four agents, two repositories, a graph and a founder all touch this system in
// a day, and until now the only way to see a day whole was to read a git log,
// open /seo, open /workspaces, and remember the rest. This assembles it once.
//
// Everything here is READ. Nothing in this file writes, commits, pushes or
// triggers a run — a page that shows you the day must not be able to change it.
//
// The graph's own output is read from disk rather than rebuilt: `data/graph/`
// belongs to the graph tooling, and a page render is not the moment to
// regenerate 3,000 nodes.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getConfig, listArticles, listBriefs, listKeywords, listSweeps } from "./seo/store.ts";
import { listRuns } from "./workspace/store.ts";

export interface Commit {
  repo: string;
  sha: string;
  subject: string;
  at: string;
  author: string;
}

/**
 * Local midnight, not UTC midnight.
 *
 * The same reason the agent supervisor keys its schedule off the local day: in
 * CEST a UTC boundary cuts the day at 02:00, so work done late last night files
 * itself under today and the 03:15 sweep lands on the wrong side of both.
 */
export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Parse `git log` in the format below into commits.
 *
 *   <sha>\x1f<iso date>\x1f<author>\x1f<subject>
 *
 * Unit separators rather than a comma or a pipe, because commit subjects
 * contain both and a subject with a comma would otherwise split into two
 * commits with half a message each.
 */
export function parseGitLog(raw: string, repo: string): Commit[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, at, author, ...rest] = line.split("");
      return { repo, sha, at, author, subject: rest.join("") };
    })
    .filter((c) => c.sha && c.subject);
}

/** Commits in one repository since a moment. Never throws; a missing repo is no commits. */
export function commitsSince(repo: string, label: string, since: Date): Commit[] {
  if (!fs.existsSync(path.join(repo, ".git"))) return [];
  const res = spawnSync(
    "git",
    ["log", `--since=${since.toISOString()}`, "--pretty=format:%h%x1f%aI%x1f%an%x1f%s", "--no-merges"],
    { cwd: repo, encoding: "utf8", timeout: 15_000 },
  );
  if (res.status !== 0 || !res.stdout) return [];
  return parseGitLog(res.stdout, label);
}

export interface Ledger {
  date: string;
  commits: Commit[];
  seo: {
    sweeps: number;
    keywordsDiscovered: number;
    changesApplied: number;
    briefsQueued: number;
    keywordsTotal: number;
    publishedToday: { slug: string; locale: string; title: string }[];
    lastSweepAt?: string;
    lastSweepMessage?: string;
  };
  runs: { project: string; task: string; at: string; ok: boolean }[];
  graph?: { at: string; nodes: number; edges: number; sessions: number; bodies: number };
}

function readGraphBuild(): Ledger["graph"] {
  // Read-only, and absent rather than zeroed if the graph has never been built.
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "graph", "out", "built.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.at !== "string") return undefined;
    return {
      at: parsed.at,
      nodes: Number(parsed.nodes ?? 0),
      edges: Number(parsed.edges ?? 0),
      sessions: Number(parsed.sessions ?? 0),
      bodies: Number(parsed.bodies ?? 0),
    };
  } catch {
    return undefined;
  }
}

export function buildLedger(now = new Date()): Ledger {
  const since = startOfLocalDay(now);
  const sinceIso = since.toISOString();
  const config = getConfig();

  const sweeps = listSweeps().filter((s) => s.finishedAt >= sinceIso);
  const articles = listArticles();

  return {
    date: since.toISOString().slice(0, 10),
    commits: [
      ...commitsSince(process.cwd(), "console", since),
      ...commitsSince(config.siteRepo, "website", since),
    ].sort((a, b) => b.at.localeCompare(a.at)),
    seo: {
      sweeps: sweeps.length,
      keywordsDiscovered: sweeps.reduce((s, x) => s + x.keywordsDiscovered, 0),
      changesApplied: sweeps.reduce((s, x) => s + x.changesApplied, 0),
      briefsQueued: listBriefs().length,
      keywordsTotal: listKeywords().length,
      publishedToday: articles
        .filter((a) => a.publishedAt && a.publishedAt >= sinceIso)
        .map((a) => ({ slug: a.slug, locale: a.locale, title: a.title })),
      lastSweepAt: sweeps[0]?.finishedAt,
      lastSweepMessage: sweeps[0]?.message,
    },
    runs: listRuns()
      .filter((r) => r.startedAt >= sinceIso)
      .map((r) => ({
        project: r.projectId,
        task: r.task.split("\n")[0].slice(0, 120),
        at: r.startedAt,
        ok: r.status === "done",
      })),
    graph: readGraphBuild(),
  };
}
