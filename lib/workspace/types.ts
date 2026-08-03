// Delivery workspace types. Framework-free on purpose — node tests import
// this file directly, the same rule as lib/types.ts and lib/salesnav/types.ts.
//
// There is no Workspace entity. The workspace IS the client: every record
// here keys on Client.id from lib/types.ts, so the client book stays the one
// list of who we work for.

/** A body of work on disk: dropped files, or a clone of the client's repo. */
export interface Project {
  id: string; // proj_...
  clientId: string; // Client.id from lib/store.ts
  name: string;
  kind: "files" | "repo";
  /** repo kind only. The credential is NEVER in this record. */
  repoUrl?: string;
  /** Discovered at clone. */
  defaultBranch?: string;
  /** The standing branch runs commit to. */
  workBranch?: string;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorKind = "git" | "ssh";

/**
 * A way into a client's own systems. Secret material lives at
 * data/workspace-keys/<id>, mode 0600 — never in this record, and no API
 * ever returns it.
 */
export interface Connector {
  id: string; // conn_...
  clientId: string;
  kind: ConnectorKind;
  /** "Production API server", "Main repo" — the founder's words. */
  label: string;
  repoUrl?: string; // git
  auth?: "pat" | "sshKey"; // git: how the secret is used
  host?: string; // ssh: "api.client.nl" or "api.client.nl:2222"
  username?: string; // ssh
  createdAt: string;
  lastUsedAt?: string;
}

export type RunStatus = "running" | "done" | "failed";

/** One Claude Code run against a project. */
export interface RunLog {
  id: string; // run_...
  projectId: string;
  clientId: string;
  /** What the founder asked for. */
  task: string;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  /** CLI transcript tail, capped. */
  output?: string;
  /** git diff after the run, capped. */
  diff?: string;
  branch?: string;
  by?: string;
}

/**
 * One line in the append-only SSH audit log. Every run writes two lines
 * sharing an id: "start" before anything executes, "end" with the outcome.
 */
export interface SshAuditLine {
  id: string; // sshrun_...
  phase: "start" | "end";
  connectorId: string;
  clientId: string;
  command: string;
  dryRun: boolean;
  confirmedBy: string;
  at: string;
  exitCode?: number; // end line only
  output?: string; // end line only, capped
  durationMs?: number;
}

/** Per-project context, prepended to every run prompt. */
export interface WorkspaceNote {
  id: string; // wnote_...
  projectId: string;
  title: string;
  body: string; // markdown
  updatedAt: string;
}

/** A canned task for the runner: one click instead of retyping the prompt. */
export interface RunRecipe {
  id: string; // recipe_... or builtin-...
  name: string;
  task: string;
  builtin?: boolean;
}

export const DEFAULT_RECIPES: RunRecipe[] = [
  {
    id: "builtin-add-tests",
    name: "Add tests",
    builtin: true,
    task:
      "Find how this project already tests (framework, layout, naming) and add the missing tests that matter most: the cases that fail if the core logic breaks. Match the existing conventions exactly, and run the project's own test command to prove everything passes.",
  },
  {
    id: "builtin-explain",
    name: "Explain this codebase",
    builtin: true,
    task:
      "Read this project and explain it: what it does, how it is structured, where the entry points are, what depends on what, and anything surprising or fragile a new developer should know before touching it. Change nothing.",
  },
  {
    id: "builtin-security",
    name: "Security pass",
    builtin: true,
    task:
      "Review this project for security problems: injection, missing validation at trust boundaries, secrets in code, auth gaps, unsafe file or path handling. Report what you find with file and line, ranked by severity, and fix only the clear-cut ones.",
  },
];
