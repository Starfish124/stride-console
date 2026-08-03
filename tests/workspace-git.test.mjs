// The git connector: cloning a client's repo, working on a standing branch,
// pushing it back — and the rule that the credential never leaves its file.
//
// The "remote" is a bare repo in the sandbox, so nothing touches the network.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

const PREAMBLE = `
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as store from ${mod("lib/workspace/store.ts")};
import * as files from ${mod("lib/workspace/files.ts")};
import { WORK_BRANCH, cloneProject, commitAndPush, currentBranch, ensureWorkBranch } from ${mod("lib/workspace/git.ts")};

const g = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** A bare "client repo" seeded with one commit on main. */
function makeRemote() {
  const remote = path.join(process.cwd(), "remote.git");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", remote]);
  const seed = fs.mkdtempSync(path.join(process.cwd(), "seed-"));
  g(seed, ["clone", remote, "checkout"]);
  const co = path.join(seed, "checkout");
  fs.writeFileSync(path.join(co, "app.py"), "print('client code')\\n");
  g(co, ["add", "app.py"]);
  g(co, ["commit", "-m", "client's own work"]);
  g(co, ["push", "origin", "main"]);
  return remote;
}

const project = { id: "proj_g", clientId: "cl_g", name: "G", kind: "repo", workBranch: WORK_BRANCH, createdAt: "x", updatedAt: "x" };
const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wsgit-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          STRIDE_WORKSPACES: path.join(dir, "workspaces"),
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test",
        },
      },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("clone lands on the work branch with the client's history, PAT out of sight", () => {
  const result = inSandbox(`
    const remote = makeRemote();
    store.saveSecret("conn_g", "https://x-access-token:ghp_VERYSECRET@github.com\\n");
    const connector = { id: "conn_g", clientId: "cl_g", kind: "git", label: "Main", repoUrl: remote, auth: "pat", createdAt: "x" };
    const dir = files.projectDir(project);
    const cloned = cloneProject(connector, dir);
    const config = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");
    out({
      cloned,
      branch: currentBranch(dir),
      hasClientFile: fs.existsSync(path.join(dir, "app.py")),
      helperInConfig: config.includes("store --file"),
      patInConfig: config.includes("VERYSECRET"),
    });
  `);
  assert.equal(result.cloned.ok, true, result.cloned.message);
  assert.equal(result.cloned.defaultBranch, "main", "the client's default branch is recorded");
  assert.equal(result.branch, "stride/console", "work happens on the standing branch");
  assert.equal(result.hasClientFile, true);
  assert.equal(result.helperInConfig, true, "the helper path is in config");
  assert.equal(result.patInConfig, false, "the PAT itself never is");
});

test("commitAndPush lands the work branch on the client's remote", () => {
  const result = inSandbox(`
    const remote = makeRemote();
    store.saveSecret("conn_g", "x\\n");
    const connector = { id: "conn_g", clientId: "cl_g", kind: "git", label: "Main", repoUrl: remote, auth: "pat", createdAt: "x" };
    const dir = files.projectDir(project);
    cloneProject(connector, dir);
    fs.writeFileSync(path.join(dir, "fix.py"), "print('stride was here')\\n");
    const pushed = commitAndPush(project, dir, "One fix from the console");
    const remoteLog = g(remote, ["log", "--oneline", WORK_BRANCH]);
    const mainLog = g(remote, ["log", "--oneline", "main"]);
    out({ pushed, remoteLog, mainLog });
  `);
  assert.equal(result.pushed.ok, true, result.pushed.message);
  assert.ok(result.remoteLog.includes("One fix from the console"), "the work is on the remote");
  assert.ok(!result.mainLog.includes("One fix"), "the client's default branch is untouched");
});

test("ensureWorkBranch puts a wandering checkout back", () => {
  const result = inSandbox(`
    const remote = makeRemote();
    store.saveSecret("conn_g", "x\\n");
    const connector = { id: "conn_g", clientId: "cl_g", kind: "git", label: "Main", repoUrl: remote, auth: "pat", createdAt: "x" };
    const dir = files.projectDir(project);
    cloneProject(connector, dir);
    g(dir, ["checkout", "main"]);
    ensureWorkBranch(project, dir);
    out({ branch: currentBranch(dir) });
  `);
  assert.equal(result.branch, "stride/console");
});
