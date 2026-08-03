// The SSH guard: every way a command must NOT reach a client's server, in
// order, and the audit trail every run leaves whether it executed or not.
//
// The "ssh" binary is a stub that records its argv — a real connection is
// never attempted.

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
import * as store from ${mod("lib/workspace/store.ts")};
import { runAudited, sshMode } from ${mod("lib/workspace/sshGuard.ts")};

function seed() {
  store.putConnector({ id: "conn_s", clientId: "cl_s", kind: "ssh", label: "Prod",
    host: "api.acme.nl", username: "stride", createdAt: "x" });
  store.saveSecret("conn_s", "-----BEGIN KEY-----\\n");
}
const run = (over = {}) => runAudited({ connectorId: "conn_s", command: "uptime",
  confirm: "api.acme.nl", by: "Sarvesh", ...over });
const out = (value) => console.log(JSON.stringify(value));
`;

const STUB = `#!/bin/sh
printf '%s' "$*" > "$CAPTURE_FILE"
echo "14:02 up 3 days"
exit 0
`;

function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wsssh-"));
  const stub = path.join(dir, "ssh");
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
          STRIDE_SSH_BIN: stub,
          CAPTURE_FILE: path.join(dir, "capture.txt"),
          STRIDE_SSH: "",
          ...env,
        },
      },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("with no environment at all it runs dry and executes nothing", () => {
  const result = inSandbox(`
    seed();
    const r = run();
    out({ r, invoked: fs.existsSync(process.env.CAPTURE_FILE), audit: store.readSshAudit() });
  `);
  assert.equal(result.r.ok, true);
  assert.equal(result.r.dryRun, true, "a fresh checkout must never touch a client's server");
  assert.ok(result.r.output.includes("Dry run"));
  assert.equal(result.invoked, false, "the binary was never called");
  assert.equal(result.audit.length, 2, "even a dry run leaves start and end lines");
  assert.equal(result.audit[0].id, result.audit[1].id, "the two lines share an id");
});

test("refusals in order: connector, key, command, name, confirmation", () => {
  const result = inSandbox(`
    seed();
    const missing = runAudited({ connectorId: "conn_none", command: "uptime", confirm: "x", by: "S" });
    store.deleteSecret("conn_s");
    const noKey = run();
    store.saveSecret("conn_s", "k\\n");
    const noCmd = run({ command: "  " });
    const longCmd = run({ command: "x".repeat(2001) });
    const noBy = run({ by: "" });
    const wrongConfirm = run({ confirm: "api.acme.n" });
    const good = run();
    out({ missing, noKey, noCmd, longCmd, noBy, wrongConfirm, goodOk: good.ok, audit: store.readSshAudit().length });
  `);
  for (const key of ["missing", "noKey", "noCmd", "longCmd", "noBy", "wrongConfirm"]) {
    assert.equal(result[key].ok, false, `${key} must refuse`);
  }
  assert.ok(result.wrongConfirm.problem.includes("api.acme.nl"), "the refusal teaches the fix");
  assert.equal(result.goodOk, true);
  assert.equal(result.audit, 2, "refusals never reach the audit log; only real attempts do");
});

test("live mode calls ssh with key, BatchMode and the pinned options", () => {
  const result = inSandbox(
    `
    seed();
    const r = run();
    const argv = fs.readFileSync(process.env.CAPTURE_FILE, "utf8");
    out({ r, argv });
  `,
    { STRIDE_SSH: "live" },
  );
  assert.equal(result.r.dryRun, false);
  assert.equal(result.r.exitCode, 0);
  assert.ok(result.r.output.includes("up 3 days"));
  assert.ok(result.argv.includes("-i "), "key auth");
  assert.ok(result.argv.includes("BatchMode=yes"), "never a password prompt");
  assert.ok(result.argv.includes("ConnectTimeout=10"));
  assert.ok(result.argv.includes("StrictHostKeyChecking=accept-new"));
  assert.ok(result.argv.includes("stride@api.acme.nl"));
  assert.ok(result.argv.endsWith("-- uptime"), "the command rides after the separator");
});

test("a host with a port is split into -p", () => {
  const result = inSandbox(
    `
    seed();
    store.putConnector({ id: "conn_s", clientId: "cl_s", kind: "ssh", label: "Prod",
      host: "api.acme.nl:2222", username: "stride", createdAt: "x" });
    const r = run({ confirm: "api.acme.nl:2222" });
    out({ r, argv: fs.readFileSync(process.env.CAPTURE_FILE, "utf8") });
  `,
    { STRIDE_SSH: "live" },
  );
  assert.ok(result.argv.includes("-p 2222"));
  assert.ok(result.argv.includes("stride@api.acme.nl"), "the port never rides in the host");
});

test("a live run's audit end line carries exit code and output", () => {
  const result = inSandbox(
    `
    seed();
    run();
    const lines = store.readSshAudit();
    out(lines[lines.length - 1]);
  `,
    { STRIDE_SSH: "live" },
  );
  assert.equal(result.phase, "end");
  assert.equal(result.dryRun, false);
  assert.equal(result.exitCode, 0);
  assert.ok(result.output.includes("up 3 days"));
  assert.equal(typeof result.durationMs, "number");
});
