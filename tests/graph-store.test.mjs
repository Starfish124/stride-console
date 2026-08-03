// Who may feed the graph: per-device tokens, constant-time comparison, and
// the rule that a device record never carries its own token out.

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
import * as graph from ${mod("lib/graph/store.ts")};
const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-graph-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      { cwd: dir, encoding: "utf8" },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a device gets its own token, and the view never carries it", () => {
  const result = inSandbox(`
    const device = graph.addDevice("Jort's Mac");
    const views = graph.deviceViews();
    out({
      tokenLength: device.token.length,
      view: views[0],
      leaked: JSON.stringify(views).includes(device.token),
      fileMode: fs.statSync(graph.GRAPH_FILES.devices).mode & 0o777,
    });
  `);
  assert.ok(result.tokenLength >= 32, "a guessable token is not a token");
  assert.equal(result.leaked, false, "the token must never leave through the view");
  assert.equal(result.view.label, "Jort's Mac");
  assert.equal(result.view.connected, false, "a machine that never posted is not connected");
  assert.equal(result.view.sessions, 0);
  assert.equal(result.fileMode, 0o600);
});

test("only the right token finds its device, and revoking kills just that one", () => {
  const result = inSandbox(`
    const a = graph.addDevice("Jort's Mac");
    const b = graph.addDevice("Sarvesh's Mac");
    const found = graph.deviceForToken(a.token);
    const wrong = graph.deviceForToken("not-the-token") ?? null;
    const empty = graph.deviceForToken(null) ?? null;
    // A prefix of a real token must not match either.
    const prefix = graph.deviceForToken(a.token.slice(0, 10)) ?? null;
    graph.removeDevice(a.id);
    out({
      found: found.label,
      wrong, empty, prefix,
      afterRevoke: graph.deviceForToken(a.token) ?? null,
      other: graph.deviceForToken(b.token).label,
    });
  `);
  assert.equal(result.found, "Jort's Mac");
  assert.equal(result.wrong, null);
  assert.equal(result.empty, null);
  assert.equal(result.prefix, null, "a prefix is not a match");
  assert.equal(result.afterRevoke, null, "a revoked token stops working");
  assert.equal(result.other, "Sarvesh's Mac", "revoking one leaves the others alone");
});

test("posting marks the device seen and counts up", () => {
  const result = inSandbox(`
    const device = graph.addDevice("Jort's Mac");
    graph.markDeviceUsed(device.id);
    graph.markDeviceUsed(device.id);
    const view = graph.deviceViews()[0];
    out({ connected: view.connected, sessions: view.sessions, seen: Boolean(view.lastSeenAt) });
  `);
  assert.equal(result.connected, true);
  assert.equal(result.sessions, 2);
  assert.equal(result.seen, true);
});

test("a session note's filename is built here, never taken from the caller", () => {
  const result = inSandbox(`
    const name = graph.saveSessionNote({
      deviceLabel: "Jort's Mac",
      sessionId: "../../etc/passwd",
      title: "Fix the /../ thing",
      markdown: "# hello",
    });
    const listed = graph.listSessionNotes();
    out({
      name,
      escapes: name.includes("..") || name.includes("/"),
      stored: fs.existsSync(path.join(graph.SESSIONS_DIR, name)),
      listed: listed.length,
      mode: fs.statSync(path.join(graph.SESSIONS_DIR, name)).mode & 0o777,
    });
  `);
  assert.equal(result.escapes, false, "no caller string reaches the path intact");
  assert.equal(result.stored, true);
  assert.equal(result.listed, 1);
  assert.equal(result.mode, 0o600);
  assert.ok(result.name.endsWith(".md"));
});
