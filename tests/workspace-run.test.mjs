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
import { activeRun, cliEventLine, contextBlock, parseIssues, runProject } from ${mod("lib/workspace/run.ts")};

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
[ -n "$ISSUES_JSON" ] && printf '%s' "$ISSUES_JSON" > .stride-issues.json
echo 'hello from the run' > run-made-this.txt
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"run-made-this.txt"}}]}}\\n'
printf '{"type":"assistant","message":{"content":[{"type":"text","text":"Done. I made the change."}]}}\\n'
printf '{"type":"result","result":"ok"}\\n'
exit 0
`;

function inSandbox(source, env = {}) {
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
          ...env,
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

test("an audit's findings are ingested, and its file never reaches the diff or the history", () => {
  const result = inSandbox(
    `
    const dir = files.ensureProjectDir(project);
    const started = runProject({ project, task: "hunt" });
    if (!started.ok) throw new Error(started.problem);
    const finished = await started.done;
    const { execFileSync } = await import("node:child_process");
    out({
      issues: store.listIssues(),
      fileGone: !fs.existsSync(path.join(dir, ".stride-issues.json")),
      diff: finished.diff ?? "",
      status: execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).trim(),
      show: execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: dir, encoding: "utf8" }),
      runId: finished.id,
    });
  `,
    {
      ISSUES_JSON: JSON.stringify([
        { title: "Password compared with ==", severity: "HIGH", file: "auth.py", line: 12, detail: "Timing attack.", fix: "Use compare_digest." },
        { title: "No cap on upload size", severity: "medium", detail: "A big file fills the disk." },
      ]),
    },
  );
  assert.equal(result.issues.length, 2);
  const [second, first] = result.issues; // newest first
  assert.equal(first.title, "Password compared with ==");
  assert.equal(first.severity, "high", "severity is normalized to the console's scale");
  assert.equal(first.file, "auth.py");
  assert.equal(first.line, 12);
  assert.equal(first.status, "open");
  assert.equal(first.runId, result.runId, "every finding names the run that found it");
  assert.equal(second.severity, "med", "\"medium\" normalizes to med");
  assert.equal(result.fileGone, true, "the handoff file is cleaned up");
  assert.ok(!result.diff.includes(".stride-issues"), "findings never eat the diff record");
  assert.ok(!result.show.includes(".stride-issues"), "and never land in the project's history");
  assert.equal(result.status, "", "nothing left behind");
});

test("an unreadable findings file says so instead of failing silently", () => {
  const result = inSandbox(
    `
    const dir = files.ensureProjectDir(project);
    const started = runProject({ project, task: "hunt" });
    if (!started.ok) throw new Error(started.problem);
    const finished = await started.done;
    out({
      status: finished.status,
      issues: store.listIssues().length,
      output: finished.output,
      fileGone: !fs.existsSync(path.join(dir, ".stride-issues.json")),
    });
  `,
    { ISSUES_JSON: "not json at all {{{" },
  );
  assert.equal(result.status, "done", "a bad findings file does not fail the run");
  assert.equal(result.issues, 0);
  assert.equal(result.fileGone, true);
  assert.ok(result.output.includes("could not be read"), "the empty list is explained");
});

test("a run with no findings file is just an ordinary run", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    const started = runProject({ project, task: "ordinary" });
    if (!started.ok) throw new Error(started.problem);
    const finished = await started.done;
    out({ issues: store.listIssues().length, output: finished.output });
  `);
  assert.equal(result.issues, 0);
  assert.ok(!result.output.includes("could not be read"));
});

test("parseIssues salvages, normalizes and refuses the useless", () => {
  const result = inSandbox(`
    out({
      bare: parseIssues('[{"title":"a","detail":"d"}]').length,
      wrapped: parseIssues('{"issues":[{"title":"a","detail":"d"}]}').length,
      chatty: parseIssues('Here you go:\\n[{"title":"a","detail":"d"}]\\nThat is all.').length,
      titleless: parseIssues('[{"detail":"no title"},{"title":"ok","detail":"d"}]').map((i) => i.title),
      severities: parseIssues('[{"title":"a"},{"title":"b","severity":"weird"},{"title":"c","severity":"low"}]').map((i) => i.severity),
      capped: parseIssues(JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ title: "t" + i })))).length,
      garbage: parseIssues("absolutely not json").length,
      badLine: parseIssues('[{"title":"a","line":"nope"}]')[0].line ?? null,
    });
  `);
  assert.equal(result.bare, 1);
  assert.equal(result.wrapped, 1, "a wrapped array is accepted");
  assert.equal(result.chatty, 1, "an array inside chatter is salvaged");
  assert.deepEqual(result.titleless, ["ok"], "a finding with nothing to say is dropped");
  assert.deepEqual(result.severities, ["med", "med", "low"]);
  assert.equal(result.capped, 50, "one audit cannot flood the list");
  assert.equal(result.garbage, 0);
  assert.equal(result.badLine, null);
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
