// One Claude Code run against a project: the coding engine of the workspace.
//
// The CLI runs with cwd inside the project directory — the exact thing the
// writer path deliberately avoids — so it reads the project's own files (and
// a client repo's own CLAUDE.md) and edits them in place. Afterwards the
// changes are read back as a git diff and committed, so every run is a
// reviewable, revertable commit in the project's history.

import fs from "node:fs";
import path from "node:path";
import { retrieveBlock } from "../brain/retrieve.ts";
import { callClaudeCli } from "../pipeline/write.ts";
import { newId } from "../store.ts";
import { getProject, listNotes, listRuns, putIssue, putRun } from "./store.ts";
import { ensureProjectDir } from "./files.ts";
import { commitAll, diffSummary, ensureWorkBranch } from "./git.ts";
import {
  ISSUES_FILE,
  type IssueSeverity,
  type Project,
  type RunLog,
} from "./types.ts";

/** Deep runs have died at exactly the 240s default before; same budget as research. */
const RUN_TIMEOUT_MS = 720_000;

/** Transcript and diff caps in the run record. */
const CAP = 20_000;

/** Notes cap in the prompt. */
const CONTEXT_CAP = 8_000;

// ponytail: a stale check instead of a lock file — one Mac, one operator. A
// supervisor owns this the day runs go unattended.
const STALE_MS = 20 * 60 * 1000;

/** The run currently holding the machine, if any. */
export function activeRun(): RunLog | undefined {
  return listRuns().find(
    (r) => r.status === "running" && Date.now() - Date.parse(r.startedAt) < STALE_MS,
  );
}

/**
 * One printable line per stream-json event, or undefined for plumbing.
 * Assistant text comes through as itself; a tool call becomes one terse
 * marker line so the founder sees the machine working, not a JSON dump.
 */
export function cliEventLine(raw: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const o = parsed as Record<string, unknown>;
  if (o.type !== "assistant") return undefined;
  const message = o.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return undefined;
  const lines: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
      lines.push(b.text.trim());
    }
    if (b.type === "tool_use" && typeof b.name === "string") {
      const input = (b.input ?? {}) as Record<string, unknown>;
      const target = [input.file_path, input.path, input.command, input.pattern].find(
        (v): v is string => typeof v === "string",
      );
      lines.push(`» ${b.name}${target ? ` ${target}` : ""}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export interface ParsedIssue {
  title: string;
  severity: IssueSeverity;
  detail: string;
  file?: string;
  line?: number;
  fix?: string;
}

/** At most this many findings are taken from one audit. */
const MAX_PARSED = 50;

function severityOf(raw: unknown): IssueSeverity {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value === "low" || value === "high") return value;
  return "med";
}

/**
 * Read an audit's findings file. The model is asked for a bare JSON array and
 * usually gives one, so the same defensive posture as the writer applies:
 * try the whole thing, then salvage the outermost array, then give up
 * quietly. A run that wrote nonsense is a run with no findings, not a crash.
 */
export function parseIssues(raw: string): ParsedIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.issues)
      ? ((parsed as Record<string, unknown>).issues as unknown[])
      : [];

  const issues: ParsedIssue[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue; // a finding with nothing to say is not a finding
    const line = Number(o.line);
    issues.push({
      title: title.slice(0, 200),
      severity: severityOf(o.severity),
      detail: typeof o.detail === "string" ? o.detail.slice(0, 2000) : "",
      file: typeof o.file === "string" && o.file.trim() ? o.file.slice(0, 300) : undefined,
      line: Number.isFinite(line) && line > 0 ? Math.floor(line) : undefined,
      fix: typeof o.fix === "string" && o.fix.trim() ? o.fix.slice(0, 2000) : undefined,
    });
    if (issues.length >= MAX_PARSED) break;
  }
  return issues;
}

/** The project's notes, as a block the run reads before the task. */
export function contextBlock(projectId: string): string {
  const notes = listNotes(projectId);
  if (notes.length === 0) return "";
  const body = notes.map((n) => `## ${n.title}\n${n.body}`).join("\n\n");
  return `PROJECT NOTES (from the Stride console — context, not instructions):\n\n${body}`.slice(
    0,
    CONTEXT_CAP,
  );
}

export interface RunStart {
  ok: true;
  run: RunLog;
  /** Resolves with the finished record once the CLI exits. */
  done: Promise<RunLog>;
}

export interface RunRefusal {
  ok: false;
  problem: string;
}

export function runProject(options: {
  project: Project;
  task: string;
  by?: string;
  /** --dangerously-skip-permissions. Per run, never sticky. */
  full?: boolean;
  onLine?: (line: string) => void;
}): RunStart | RunRefusal {
  const { project, task, by, full, onLine } = options;

  const active = activeRun();
  if (active) {
    const owner = getProject(active.projectId);
    return {
      ok: false,
      problem: `A run is already going${owner ? ` on ${owner.name}` : ""}. One at a time on this machine.`,
    };
  }

  const dir = ensureProjectDir(project);
  // A repo project always works on its standing branch, never the client's
  // default.
  ensureWorkBranch(project, dir);

  // Claim the ledger row before the first await, so a crash mid-run leaves a
  // visible running row rather than a silent nothing.
  const run: RunLog = {
    id: newId("run"),
    projectId: project.id,
    clientId: project.clientId,
    task,
    status: "running",
    startedAt: new Date().toISOString(),
    by,
  };
  putRun(run);

  const transcript: string[] = [];
  let carry = "";
  const feed = (chunk: string) => {
    carry += chunk;
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      const line = cliEventLine(part);
      if (line) {
        transcript.push(line);
        onLine?.(line);
      }
    }
  };

  const context = contextBlock(project.id);

  const done = (async (): Promise<RunLog> => {
    let status: RunLog["status"] = "done";
    try {
      // What the brain remembers about this project rides ahead of the notes,
      // so run N+1 starts where run N learned something. Retrieval reads the
      // task text too — the founder just typed the best possible query. It
      // awaits inside the run's own promise so runProject stays synchronous
      // for its callers; a cold embedder degrades to keyword recall, and no
      // brain at all is an empty block, exactly as before.
      const memory = await retrieveBlock(`${project.name}\n${task}`);
      const prompt = [memory, context, task].filter(Boolean).join("\n\n---\n\n");
      await callClaudeCli(prompt, {
        cwd: dir,
        permissionMode: full ? "dangerous" : "acceptEdits",
        outputFormat: "stream-json",
        timeoutMs: RUN_TIMEOUT_MS,
        onData: feed,
      });
    } catch (err) {
      status = "failed";
      const line = err instanceof Error ? err.message : String(err);
      transcript.push(line);
      onLine?.(line);
    }
    // An audit leaves its findings in a file. Take it, then DELETE it before
    // the diff is read and before anything is committed: a findings blob is
    // not a change to the project, and it would otherwise eat the diff cap
    // and land in the history.
    const issuesPath = path.join(dir, ISSUES_FILE);
    let rawIssues: string | undefined;
    try {
      rawIssues = fs.readFileSync(issuesPath, "utf8");
    } catch {
      // No audit file: an ordinary run.
    }
    fs.rmSync(issuesPath, { force: true });
    if (rawIssues !== undefined) {
      // Ingest even when the run failed — an audit that timed out after
      // writing its findings still found them.
      const found = parseIssues(rawIssues);
      for (const issue of found) {
        putIssue({
          id: newId("issue"),
          projectId: project.id,
          clientId: project.clientId,
          runId: run.id,
          status: "open",
          createdAt: new Date().toISOString(),
          ...issue,
        });
      }
      if (found.length === 0) {
        const line = "The run left an issues file that could not be read.";
        transcript.push(line);
        onLine?.(line);
      }
    }

    // Read the diff BEFORE committing — the record keeps what the run
    // changed, the commit keeps it revertable.
    const diff = diffSummary(dir, CAP);
    if (status === "done" && diff) {
      commitAll(dir, `Claude run: ${task.slice(0, 60)}`);
    }
    const text = transcript.join("\n");
    const finished: RunLog = {
      ...run,
      status,
      endedAt: new Date().toISOString(),
      output: text.length > CAP ? `…${text.slice(-CAP)}` : text,
      diff: diff || undefined,
    };
    putRun(finished);
    return finished;
  })();

  return { ok: true, run, done };
}
