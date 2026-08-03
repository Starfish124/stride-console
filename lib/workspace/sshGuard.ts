// The choke point for running anything on a client's server.
//
// Every SSH run comes through runAudited() and nothing else: the route calls
// it, it is the only importer of ssh.ts, and the checks run in order with the
// first refusal winning. There is no command denylist here on purpose —
// blocking "rm -rf" while find -delete walks past is theater. The real
// controls are key-only auth, dry-by-default, a typed confirmation, and an
// audit line written before anything executes.

import { newId } from "../store.ts";
import { appendSshAudit, getConnector, hasSecret, putConnector } from "./store.ts";
import { runSsh } from "./ssh.ts";

const OUTPUT_CAP = 20_000;
const COMMAND_CAP = 2_000;

export type SshMode = "live" | "dry";

/**
 * Dry unless STRIDE_SSH=live is set in the console's environment — the
 * salesnav posture: a fresh checkout can never touch a client's server.
 */
export function sshMode(): SshMode {
  return process.env.STRIDE_SSH === "live" ? "live" : "dry";
}

export interface AuditedRun {
  ok: boolean;
  dryRun?: boolean;
  exitCode?: number;
  output?: string;
  problem?: string;
}

export function runAudited(options: {
  connectorId: string;
  command: string;
  /** Must equal the connector's host, typed by a person, every time. */
  confirm: string;
  by: string;
}): AuditedRun {
  const { connectorId, command, confirm, by } = options;

  const connector = getConnector(connectorId);
  if (!connector || connector.kind !== "ssh") {
    return { ok: false, problem: "No such SSH connector." };
  }
  if (!connector.host || !connector.username) {
    return { ok: false, problem: "The connector is missing its host or username." };
  }
  if (!hasSecret(connector.id)) {
    return { ok: false, problem: "The connector has no key in place." };
  }
  const cmd = command.trim();
  if (!cmd) return { ok: false, problem: "Say what to run." };
  if (cmd.length > COMMAND_CAP) {
    return { ok: false, problem: "That command is too long to be one command." };
  }
  if (!by.trim()) return { ok: false, problem: "A run needs a name on it." };
  if (confirm !== connector.host) {
    return {
      ok: false,
      problem: `Type the host — ${connector.host} — to confirm. This runs on the client's real server.`,
    };
  }

  const dryRun = sshMode() === "dry";
  const base = {
    id: newId("sshrun"),
    connectorId: connector.id,
    clientId: connector.clientId,
    command: cmd,
    dryRun,
    confirmedBy: by,
  };

  // The start line lands before anything executes, so a run that hangs or
  // kills the process still left its trace.
  appendSshAudit({ ...base, phase: "start", at: new Date().toISOString() });

  if (dryRun) {
    appendSshAudit({ ...base, phase: "end", at: new Date().toISOString() });
    return {
      ok: true,
      dryRun: true,
      output:
        "Dry run — nothing was executed. Set STRIDE_SSH=live in the console's environment to run for real.",
    };
  }

  const startedAt = Date.now();
  const result = runSsh(connector, cmd);
  appendSshAudit({
    ...base,
    phase: "end",
    at: new Date().toISOString(),
    exitCode: result.exitCode,
    output: result.output.slice(0, OUTPUT_CAP),
    durationMs: Date.now() - startedAt,
  });
  putConnector({ ...connector, lastUsedAt: new Date().toISOString() });
  return {
    ok: true,
    dryRun: false,
    exitCode: result.exitCode,
    output: result.output.slice(0, OUTPUT_CAP),
  };
}
