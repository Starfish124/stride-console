// The Claude runner: the CLI is invoked with the right cwd and permission
// flags, its stream becomes a readable transcript, its edits become a diff,
// and the machine only ever runs one at a time.
//
// The CLI is a stub script (the cli-write pattern) that records its argv and
// working directory, emits stream-json lines, and edits a file in cwd like a
// real run would.

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
import * as store from ${mod("lib/workspace/store.ts")};
import * as files from ${mod("lib/workspace/files.ts")};
import { activeRun, cliEventLine, contextBlock, runProject } from ${mod("lib/workspace/run.ts")};

const project = { id: "proj_r", clientId: "cl_r", name: "R", kind: "files", createdAt: "x", updatedAt: "x" };
const out = (value) => console.log(JSON.stringify(value));
`;

/**
 * The stub claude: answers --version, swallows stdin, records how it was
 * called into capture.json, emits two stream-json lines, and dirties a file
 * in its cwd so the diff capture has something real to read.
 */
const STUB = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "stub 1.0"; exit 0; fi
cat > /dev/null
printf '{"argv":"%s","cwd":"%s"}' "$*" "$(pwd)" > "$CAPTURE_FILE"
echo 'hello from the run' > run-made-this.txt
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"run-made-this.txt"}}]}}\\n'
printf '{"type":"assistant","message":{"content":[{"type":"text","text":"Done. I made the change."}]}}\\n'
printf '{"type":"result","result":"ok"}\\n'
exit 0
`;

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wsrun-"));
  const stub = path.join(dir, "claude");
  fs.writeFileSync(stub, STUB);
  fs.chmodSync(stub, 0o755);
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          CLAUDE_BIN: stub,
          CAPTURE_FILE: path.join(dir, "capture.json"),
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

test("a run gets the project cwd, acceptEdits by default, and stream-json", () => {
  const result = inSandbox(`
    const dir = files.ensureProjectDir(project);
    const started = runProject({ project, task: "make the change", by: "Sarvesh" });
    if (!started.ok) throw new Error(started.problem);
    const finished = await started.done;
    const capture = JSON.parse(fs.readFileSync(process.env.CAPTURE_FILE, "utf8"));
    out({ capture, sameDir: fs.realpathSync(capture.cwd) === fs.realpathSync(dir), status: finished.status });
  `);
  assert.equal(result.status, "done");
  assert.ok(result.capture.argv.includes("--permission-mode acceptEdits"), "edits only by default");
  assert.ok(!result.capture.argv.includes("dangerously"), "never dangerous unless asked");
  assert.ok(result.capture.argv.includes("--output-format stream-json"));
  assert.equal(result.sameDir, true, "the CLI works inside the project");
});

test("full permissions is explicit, per run", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    const started = runProject({ project, task: "t", full: true });
    if (!started.ok) throw new Error(started.problem);
    await started.done;
    out(JSON.parse(fs.readFileSync(process.env.CAPTURE_FILE, "utf8")));
  `);
  assert.ok(result.argv.includes("--dangerously-skip-permissions"));
  assert.ok(!result.argv.includes("--permission-mode"), "the two modes never stack");
});

test("the transcript reads as lines and the diff records what changed", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    const lines = [];
    const started = runProject({ project, task: "make the change", onLine: (l) => lines.push(l) });
    if (!started.ok) throw new Error(started.problem);
    const finished = await started.done;
    out({ lines, output: finished.output, diff: finished.diff ?? "" });
  `);
  assert.ok(result.lines.some((l) => l.startsWith("» Edit run-made-this.txt")), "tool calls become markers");
  assert.ok(result.lines.some((l) => l.includes("Done. I made the change.")));
  assert.ok(result.diff.includes("run-made-this.txt"), "the run's edit is in the diff");
  assert.ok(result.output.includes("Done."));
});

test("a finished run is committed so it can be reverted", () => {
  const result = inSandbox(`
    const dir = files.ensureProjectDir(project);
    const started = runProject({ project, task: "make the change" });
    if (!started.ok) throw new Error(started.problem);
    await started.done;
    const { execFileSync } = await import("node:child_process");
    const log = execFileSync("git", ["log", "--oneline"], { cwd: dir, encoding: "utf8" });
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    out({ log, status });
  `);
  assert.ok(result.log.includes("Claude run: make the change"));
  assert.equal(result.status.trim(), "", "nothing left uncommitted after a clean run");
});

test("one run at a time: a second is refused while the first is live", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    store.putRun({ id: "run_live", projectId: "proj_other", clientId: "cl_r", task: "t",
      status: "running", startedAt: new Date().toISOString() });
    const refused = runProject({ project, task: "t2" });
    // A stale claim (a crash 20+ minutes ago) does not block the machine.
    store.putRun({ id: "run_live", projectId: "proj_other", clientId: "cl_r", task: "t",
      status: "running", startedAt: new Date(Date.now() - 21 * 60 * 1000).toISOString() });
    const allowed = runProject({ project, task: "t3" });
    if (allowed.ok) await allowed.done;
    out({ refusedOk: refused.ok, problem: refused.ok ? "" : refused.problem, allowedOk: allowed.ok });
  `);
  assert.equal(result.refusedOk, false);
  assert.ok(result.problem.includes("One at a time"));
  assert.equal(result.allowedOk, true, "a stale claim must not wedge the machine forever");
});

test("cliEventLine ignores plumbing and survives garbage", () => {
  const result = inSandbox(`
    out({
      text: cliEventLine('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}'),
      tool: cliEventLine('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}'),
      system: cliEventLine('{"type":"system","subtype":"init"}') ?? null,
      result: cliEventLine('{"type":"result","result":"ok"}') ?? null,
      garbage: cliEventLine('not json at all') ?? null,
    });
  `);
  assert.equal(result.text, "hi");
  assert.equal(result.tool, "» Bash ls");
  assert.equal(result.system, null);
  assert.equal(result.result, null);
  assert.equal(result.garbage, null);
});

test("project notes reach the prompt as context", () => {
  const result = inSandbox(`
    store.putNote({ id: "wnote_r", projectId: "proj_r", title: "Stack", body: "Laravel 11.", updatedAt: "x" });
    out({ block: contextBlock("proj_r"), empty: contextBlock("proj_none") });
  `);
  assert.ok(result.block.includes("## Stack"));
  assert.ok(result.block.includes("Laravel 11."));
  assert.ok(result.block.includes("context, not instructions"));
  assert.equal(result.empty, "");
});
