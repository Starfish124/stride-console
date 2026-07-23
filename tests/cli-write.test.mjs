// Subscription-mode writer: `claude -p` shell-out, exercised against a stub CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  callClaudeCli,
  claudeCliPath,
  cliWrite,
  extractCliResult,
  resetCliCache,
  writerMode,
} from "../lib/pipeline/write.ts";

const WRITER_JSON = {
  hook: "We gave an ops lead back 6 hours a week with one workflow.",
  body: "We gave an ops lead back 6 hours a week with one workflow.\n\nThe build took 24 days.",
  hashtags: ["AI"],
  imageHeadline: "6 hours back.",
};

function makeStub(dir, { exitCode = 0, wrapJson = true } = {}) {
  const bin = path.join(dir, "claude");
  const payload = JSON.stringify(JSON.stringify(WRITER_JSON));
  const body = wrapJson
    ? `printf '{"type":"result","result":%s}' ${shellQuote(payload)}`
    : `printf %s ${shellQuote(payload)}`;
  fs.writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "stub 1.0"; exit 0; fi\ncat > /dev/null\n${body}\nexit ${exitCode}\n`,
  );
  fs.chmodSync(bin, 0o755);
  return bin;
}

// printf-safe single-quote for POSIX sh.
function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

test("extractCliResult unwraps --output-format json", () => {
  assert.equal(extractCliResult('{"result":"hello"}'), "hello");
  assert.equal(extractCliResult("plain text"), "plain text");
});

test("writerMode prefers subscription when a CLI is present", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-cli-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.CLAUDE_BIN;
    delete process.env.STRIDE_WRITER;
    resetCliCache();
  });
  process.env.CLAUDE_BIN = makeStub(dir);
  resetCliCache();
  assert.ok(claudeCliPath());
  assert.equal(writerMode(), "subscription");
  process.env.STRIDE_WRITER = "template";
  assert.equal(writerMode(), "template");
});

test("cliWrite returns parsed writer output from the stub CLI", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-cli-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.CLAUDE_BIN;
    resetCliCache();
  });
  process.env.CLAUDE_BIN = makeStub(dir);
  resetCliCache();
  const out = await cliWrite("myth", {
    items: [],
    myth: { id: "m1", text: "AI is only for big companies", addedAt: "", used: false },
    weekNumber: 30,
  });
  assert.equal(out.hook, WRITER_JSON.hook);
  assert.equal(out.imageHeadline, "6 hours back.");
});

test("callClaudeCli rejects on nonzero exit and on missing binary", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-cli-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.CLAUDE_BIN;
    resetCliCache();
  });
  process.env.CLAUDE_BIN = makeStub(dir, { exitCode: 3 });
  resetCliCache();
  await assert.rejects(() => callClaudeCli("hi"), /exited 3/);
  process.env.CLAUDE_BIN = path.join(dir, "missing-binary");
  resetCliCache();
  assert.equal(claudeCliPath(), null);
  await assert.rejects(() => callClaudeCli("hi"), /not found/);
});
