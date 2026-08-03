// Git against a workspace project directory.
//
// The core helper is copied from lib/seo/publish.ts rather than imported:
// that file carries another session's uncommitted work right now, and the
// helper is 14 lines. Consolidate into a shared lib/git.ts after the demo.
//
// Everything here takes the project directory as an argument — files.ts
// imports this module, so this module never imports files.ts back.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { secretPath } from "./store.ts";
import type { Connector, Project } from "./types.ts";

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

/** Current branch, or undefined if the checkout is detached or broken. */
export function currentBranch(dir: string): string | undefined {
  const res = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = res.output.trim();
  return res.ok && name && name !== "HEAD" ? name : undefined;
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

// ---------- client repos ----------

/** The standing branch runs commit to; pushed for the client to review. */
export const WORK_BRANCH = "stride/console";

export interface RepoResult {
  ok: boolean;
  /** One sentence naming the stage that failed, publish.ts style. */
  message: string;
  defaultBranch?: string;
}

/**
 * How the clone authenticates, without the secret ever entering argv, the
 * remote URL, or a log line. A PAT sits in a git-credential-store file that
 * only the helper reads; a deploy key sits behind core.sshCommand. Both
 * configs name the PATH of the secret, never its content.
 */
function authConfig(connector: Connector): string[] {
  if (connector.auth === "pat") {
    return ["--config", `credential.helper=store --file ${secretPath(connector.id)}`];
  }
  return [
    "--config",
    `core.sshCommand=ssh -i ${secretPath(connector.id)} -o IdentitiesOnly=yes -o BatchMode=yes`,
  ];
}

/**
 * Clone the connector's repo into the project directory and put it on the
 * work branch. Five minutes of budget: a first clone pulls history.
 */
export function cloneProject(connector: Connector, dir: string): RepoResult {
  if (!connector.repoUrl) return { ok: false, message: "The connector has no repo URL." };
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const clone = git(
    path.dirname(dir),
    ["clone", ...authConfig(connector), connector.repoUrl, dir],
    300_000,
  );
  if (!clone.ok) {
    // The clone's own words can quote the URL; that is fine, the URL holds no
    // secret. Trim it to one line for the founder.
    return { ok: false, message: `The clone failed: ${clone.output.split("\n").pop() ?? ""}` };
  }
  const defaultBranch = currentBranch(dir);
  const branch = git(dir, ["checkout", "-b", WORK_BRANCH]);
  if (!branch.ok) return { ok: false, message: `The work branch failed: ${branch.output}` };
  return { ok: true, message: "Cloned.", defaultBranch };
}

/** Make sure a repo project is sitting on its work branch before a run. */
export function ensureWorkBranch(project: Project, dir: string): void {
  if (project.kind !== "repo" || !project.workBranch) return;
  if (currentBranch(dir) === project.workBranch) return;
  const out = git(dir, ["checkout", project.workBranch]);
  if (!out.ok) git(dir, ["checkout", "-b", project.workBranch]);
}

/**
 * Commit whatever is in the tree and push the work branch, so the client
 * reviews a branch rather than receiving surprise commits on their default.
 */
export function commitAndPush(project: Project, dir: string, message: string): RepoResult {
  const branch = project.workBranch ?? WORK_BRANCH;
  const committed = commitAll(dir, message);
  if (!committed.ok) return { ok: false, message: `The commit failed: ${committed.output}` };
  const pushed = git(dir, ["push", "-u", "origin", branch], 180_000);
  if (!pushed.ok) {
    return { ok: false, message: `The push failed: ${pushed.output.split("\n").pop() ?? ""}` };
  }
  return { ok: true, message: `Pushed ${branch}.` };
}
