// The system ssh binary against a client's server.
//
// Only lib/workspace/sshGuard.ts imports this module — the guard is the one
// path to a client's machine, and importing this anywhere else would skip
// the confirmation and the audit line. Same module-graph rule as the
// salesnav provider.
//
// Array args, never a shell string, per the whisper.ts discipline: the
// command arrives over the network. (The remote shell still parses the
// command string on the far side — that is what ssh is.)

import { spawnSync } from "node:child_process";
import { secretPath } from "./store.ts";
import type { Connector } from "./types.ts";

export interface SshResult {
  exitCode: number;
  output: string;
}

export function runSsh(
  connector: Connector,
  command: string,
  timeoutMs = 60_000,
): SshResult {
  // Env override for tests, the CLAUDE_BIN pattern.
  const bin = process.env.STRIDE_SSH_BIN ?? "ssh";
  const [host, port] = (connector.host ?? "").split(":");
  const args = [
    "-i",
    secretPath(connector.id),
    // Never hang on a password prompt; key auth or nothing.
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    // First contact pins the host key; a later mismatch fails loudly.
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "IdentitiesOnly=yes",
    ...(port ? ["-p", port] : []),
    `${connector.username}@${host}`,
    "--",
    command,
  ];
  const res = spawnSync(bin, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  return { exitCode: res.status ?? -1, output };
}
