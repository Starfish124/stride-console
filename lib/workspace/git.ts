// Git against a workspace project directory.
//
// The core helper is copied from lib/seo/publish.ts rather than imported:
// that file carries another session's uncommitted work right now, and the
// helper is 14 lines. Consolidate into a shared lib/git.ts after the demo.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface GitResult {
  ok: boolean;
  output: string;
}

export function git(repo: string, args: string[], timeoutMs = 120_000): GitResult {
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

export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

/**
 * Make a plain directory a repo so every change — a founder's drop or a
 * Claude run — is a diff with an author and an undo. Idempotent.
 */
export function ensureRepo(dir: string): GitResult {
  if (isGitRepo(dir)) return { ok: true, output: "" };
  const init = git(dir, ["init", "--initial-branch", "main"]);
  if (!init.ok) return init;
  return git(dir, ["commit", "--allow-empty", "-m", "Workspace created"]);
}

/**
 * Stage and commit everything in the project dir. `add -A` is fine HERE and
 * only here: this tree is machine-managed, nobody's mid-edit work lives in it.
 * (The never-add-A rule protects checkouts that founders also edit.)
 */
export function commitAll(dir: string, message: string): GitResult {
  const add = git(dir, ["add", "-A"]);
  if (!add.ok) return add;
  const staged = git(dir, ["diff", "--cached", "--name-only"]);
  if (!staged.output.trim()) return { ok: true, output: "nothing to commit" };
  return git(dir, ["commit", "-m", message]);
}

/** Working-tree changes since the last commit, capped for the run record. */
export function diffSummary(dir: string, cap = 20_000): string {
  const status = git(dir, ["status", "--porcelain"]);
  const diff = git(dir, ["diff", "HEAD"]);
  const text = `${status.output}\n\n${diff.output}`.trim();
  return text.length > cap ? text.slice(0, cap) + "\n… (truncated)" : text;
}
