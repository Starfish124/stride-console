// The session hook's judgement: which sessions are Stride work, and what a
// session note says once rendered. Runs the real hook script against
// fabricated transcripts — no network, because a hook with no config posts
// nowhere.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "scripts", "graph-hook.py");

/** Import the hook as a module and ask it about a transcript we wrote. */
function ask(lines, expression) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-hook-"));
  const transcript = path.join(dir, "session.jsonl");
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join("\n"));
  try {
    const out = execFileSync(
      "python3",
      [
        "-c",
        `import json, importlib.util
spec = importlib.util.spec_from_file_location("hook", ${JSON.stringify(HOOK)})
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
d = hook.parse(${JSON.stringify(transcript)})
print(json.dumps(${expression}))`,
      ],
      { encoding: "utf8" },
    );
    return JSON.parse(out.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const userLine = (text, cwd = "/Users/x/notes") => ({
  type: "user",
  cwd,
  timestamp: "2026-08-03T10:00:00Z",
  message: { content: [{ type: "text", text }] },
});

test("a session in a Stride folder counts without anybody remembering", () => {
  const result = ask(
    [userLine("tidy the readme", "/Users/x/stride-console")],
    "hook.is_stride(d)",
  );
  assert.equal(result, true);
});

test("the website repo counts too, despite not being called stride", () => {
  const result = ask(
    [userLine("fix the hero copy", "/Users/x/ai-agency-website")],
    "hook.is_stride(d)",
  );
  assert.equal(result, true);
});

test("an unrelated session stays out of the graph", () => {
  const result = ask([userLine("help me with my taxes", "/Users/x/personal")], "hook.is_stride(d)");
  assert.equal(result, false, "somebody's own work is not client context");
});

test("the marker phrase pulls any session in, however it is written", () => {
  for (const phrase of ["this is stride context", "STRIDE CONTEXT please", "stride  context"]) {
    const result = ask([userLine(phrase, "/Users/x/anywhere")], "hook.is_stride(d)");
    assert.equal(result, true, `"${phrase}" should register`);
  }
});

test("a session note carries what was asked, touched and concluded", () => {
  const note = ask(
    [
      { type: "ai-title", aiTitle: "Fix the invoice bug" },
      userLine("the invoice total is wrong", "/Users/x/stride-console"),
      {
        type: "assistant",
        timestamp: "2026-08-03T10:05:00Z",
        message: {
          content: [
            { type: "tool_use", name: "Edit", input: { file_path: "lib/money.ts" } },
            { type: "text", text: "Fixed: the rounding happened before the sum." },
          ],
        },
      },
    ],
    'hook.render(d, "sess_1")',
  );
  assert.ok(note.includes("type: claude-session"), "the graph needs to know what this is");
  assert.ok(note.includes("Fix the invoice bug"));
  assert.ok(note.includes("session: sess_1"));
  assert.ok(note.includes("project: stride-console"));
  assert.ok(note.includes("the invoice total is wrong"), "what was asked");
  assert.ok(note.includes("lib/money.ts"), "what was touched");
  assert.ok(note.includes("rounding happened before the sum"), "what was concluded");
});

test("subagent chatter is not somebody's prompt", () => {
  const result = ask(
    [
      userLine("real request", "/Users/x/stride-console"),
      { ...userLine("agent noise"), isSidechain: true },
    ],
    "d['prompts']",
  );
  assert.deepEqual(result, ["real request"]);
});

test("the first cwd wins, so a cd mid-session cannot rewrite where the work happened", () => {
  const result = ask(
    [userLine("start here", "/Users/x/stride-console"), userLine("then here", "/tmp")],
    "d['cwd']",
  );
  assert.equal(result, "/Users/x/stride-console");
});
