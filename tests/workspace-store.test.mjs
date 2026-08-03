// The workspace's records: projects, connectors, runs, notes, secrets and
// the SSH audit log.
//
// Everything runs in a throwaway working directory — lib/store.ts resolves
// DATA_DIR from process.cwd() at import, so a careless test writes into the
// founders' live data. Same sandbox rule as the salesnav tests.

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

const out = (value) => console.log(JSON.stringify(value));
`;

/** Run a snippet with cwd in a fresh temp directory, and read its last line. */
function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-workspace-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("projects round-trip and filter by client", () => {
  const result = inSandbox(`
    store.putProject({ id: "proj_a", clientId: "cl_1", name: "Site", kind: "files", createdAt: "2026-08-03", updatedAt: "2026-08-03" });
    store.putProject({ id: "proj_b", clientId: "cl_2", name: "API", kind: "repo", createdAt: "2026-08-03", updatedAt: "2026-08-03" });
    store.putProject({ id: "proj_a", clientId: "cl_1", name: "Site v2", kind: "files", createdAt: "2026-08-03", updatedAt: "2026-08-03" });
    out({ all: store.listProjects(), one: store.listProjects("cl_1"), got: store.getProject("proj_b") });
  `);
  assert.equal(result.all.length, 2, "put on the same id upserts");
  assert.equal(result.one.length, 1);
  assert.equal(result.one[0].name, "Site v2");
  assert.equal(result.got.kind, "repo");
});

test("runs are newest first and capped at 200", () => {
  const result = inSandbox(`
    for (let i = 0; i < 205; i++) {
      store.putRun({ id: "run_" + i, projectId: "proj_a", clientId: "cl_1", task: "t", status: "done", startedAt: String(i) });
    }
    const runs = store.listRuns();
    out({ count: runs.length, first: runs[0].id });
  `);
  assert.equal(result.count, 200, "the run list is an operating record, not an archive");
  assert.equal(result.first, "run_204", "newest first");
});

test("secrets land at 0600 and never in a JSON record", () => {
  const result = inSandbox(`
    store.putConnector({ id: "conn_x", clientId: "cl_1", kind: "git", label: "Main repo", auth: "pat", createdAt: "2026-08-03" });
    store.saveSecret("conn_x", "ghp_verysecret");
    const mode = fs.statSync(store.secretPath("conn_x")).mode & 0o777;
    const record = JSON.stringify(store.listConnectors());
    out({ mode, has: store.hasSecret("conn_x"), leaked: record.includes("verysecret") });
  `);
  assert.equal(result.mode, 0o600);
  assert.equal(result.has, true);
  assert.equal(result.leaked, false, "the secret must never be in the connector record");
});

test("a bad connector id cannot become a path", () => {
  const result = inSandbox(`
    let threw = false;
    try { store.saveSecret("../../etc/cron.d/evil", "x"); } catch { threw = true; }
    out({ threw });
  `);
  assert.equal(result.threw, true);
});

test("deleting a connector removes its secret too", () => {
  const result = inSandbox(`
    store.putConnector({ id: "conn_y", clientId: "cl_1", kind: "ssh", label: "Prod", host: "api.acme.nl", username: "stride", createdAt: "2026-08-03" });
    store.saveSecret("conn_y", "-----BEGIN KEY-----");
    store.deleteConnector("conn_y");
    out({ record: store.getConnector("conn_y") ?? null, secret: store.hasSecret("conn_y") });
  `);
  assert.equal(result.record, null);
  assert.equal(result.secret, false, "an orphaned client key on disk is a leak waiting");
});

test("the SSH audit log appends, survives a torn last line, and cannot be rewritten", () => {
  const result = inSandbox(`
    const line = (id, phase) => ({ id, phase, connectorId: "conn_y", clientId: "cl_1", command: "uptime", dryRun: true, confirmedBy: "Sarvesh", at: "2026-08-03" });
    store.appendSshAudit(line("sshrun_1", "start"));
    store.appendSshAudit(line("sshrun_1", "end"));
    // A crash mid-append leaves a torn line; the reader must not lose the rest.
    fs.appendFileSync(store.WORKSPACE_FILES.sshLog, '{"id":"sshrun_2","ph');
    const editors = Object.keys(store).filter((k) =>
      /ssh/i.test(k) && !/^(appendSshAudit|readSshAudit)$/.test(k));
    out({ lines: store.readSshAudit().length, editors });
  `);
  assert.equal(result.lines, 2);
  assert.deepEqual(result.editors, [], "no function may edit or delete the audit log");
});

test("notes round-trip per project", () => {
  const result = inSandbox(`
    store.putNote({ id: "wnote_1", projectId: "proj_a", title: "Stack", body: "Laravel 11, MySQL.", updatedAt: "2026-08-03" });
    store.putNote({ id: "wnote_2", projectId: "proj_b", title: "Other", body: "x", updatedAt: "2026-08-03" });
    store.deleteNote("wnote_2");
    out({ a: store.listNotes("proj_a").length, b: store.listNotes("proj_b").length });
  `);
  assert.equal(result.a, 1);
  assert.equal(result.b, 0);
});
