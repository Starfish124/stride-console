// Every read and write for the workspace's records.
//
// Synchronous on purpose, same as lib/salesnav/store.ts: a read, a change and
// a write with no await between them cannot interleave in this process, and
// only this process writes these files.
//
// Mode 0600 throughout. Repo URLs, client hostnames and what we ran on a
// client's server are all client-confidential.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../store.ts";
import {
  DEFAULT_RECIPES,
  type Connector,
  type Project,
  type RunLog,
  type RunRecipe,
  type SshAuditLine,
  type WorkspaceNote,
} from "./types.ts";

const MODE = 0o600;

const FILES = {
  projects: path.join(DATA_DIR, "workspace-projects.json"),
  connectors: path.join(DATA_DIR, "workspace-connectors.json"),
  runs: path.join(DATA_DIR, "workspace-runs.json"),
  notes: path.join(DATA_DIR, "workspace-notes.json"),
  recipes: path.join(DATA_DIR, "workspace-recipes.json"),
  sshLog: path.join(DATA_DIR, "workspace-ssh-log.jsonl"),
} as const;

export const WORKSPACE_FILES = FILES;

/** The run list is an operating record, not an archive. */
const MAX_RUNS = 200;

// ---------- projects ----------

export function listProjects(clientId?: string): Project[] {
  const all = readJson<Project[]>(FILES.projects, []);
  return clientId ? all.filter((p) => p.clientId === clientId) : all;
}

export function getProject(id: string): Project | undefined {
  return listProjects().find((p) => p.id === id);
}

export function putProject(project: Project): void {
  const all = listProjects().filter((p) => p.id !== project.id);
  writeJson(FILES.projects, [...all, project], MODE);
}

export function deleteProject(id: string): void {
  writeJson(FILES.projects, listProjects().filter((p) => p.id !== id), MODE);
}

// ---------- connectors ----------

export function listConnectors(clientId?: string): Connector[] {
  const all = readJson<Connector[]>(FILES.connectors, []);
  return clientId ? all.filter((c) => c.clientId === clientId) : all;
}

export function getConnector(id: string): Connector | undefined {
  return listConnectors().find((c) => c.id === id);
}

export function putConnector(connector: Connector): void {
  const all = listConnectors().filter((c) => c.id !== connector.id);
  writeJson(FILES.connectors, [...all, connector], MODE);
}

export function deleteConnector(id: string): void {
  writeJson(FILES.connectors, listConnectors().filter((c) => c.id !== id), MODE);
  deleteSecret(id);
}

// ---------- runs ----------

export function listRuns(projectId?: string): RunLog[] {
  const all = readJson<RunLog[]>(FILES.runs, []);
  return projectId ? all.filter((r) => r.projectId === projectId) : all;
}

export function getRun(id: string): RunLog | undefined {
  return listRuns().find((r) => r.id === id);
}

/** Newest first, capped. Upserts on id. */
export function putRun(run: RunLog): void {
  const all = listRuns().filter((r) => r.id !== run.id);
  writeJson(FILES.runs, [run, ...all].slice(0, MAX_RUNS), MODE);
}

// ---------- notes ----------

export function listNotes(projectId: string): WorkspaceNote[] {
  return readJson<WorkspaceNote[]>(FILES.notes, []).filter(
    (n) => n.projectId === projectId,
  );
}

export function putNote(note: WorkspaceNote): void {
  const all = readJson<WorkspaceNote[]>(FILES.notes, []).filter((n) => n.id !== note.id);
  writeJson(FILES.notes, [...all, note], MODE);
}

export function deleteNote(id: string): void {
  const all = readJson<WorkspaceNote[]>(FILES.notes, []);
  writeJson(FILES.notes, all.filter((n) => n.id !== id), MODE);
}

// ---------- run recipes ----------

/** Built-ins first, then whatever the founders saved. */
export function listRecipes(): RunRecipe[] {
  return [...DEFAULT_RECIPES, ...readJson<RunRecipe[]>(FILES.recipes, [])];
}

export function putRecipe(recipe: RunRecipe): void {
  const stored = readJson<RunRecipe[]>(FILES.recipes, []).filter((r) => r.id !== recipe.id);
  writeJson(FILES.recipes, [...stored, recipe], MODE);
}

/** Only the stored file is filtered, so built-ins are immune by construction. */
export function deleteRecipe(id: string): void {
  const stored = readJson<RunRecipe[]>(FILES.recipes, []);
  writeJson(FILES.recipes, stored.filter((r) => r.id !== id), MODE);
}

// ---------- the SSH audit log ----------

/**
 * Append-only, and the only file here that is not JSON-array-rewritten:
 * an audit trail that a later write can silently rewrite is not an audit
 * trail. This module deliberately has no function that edits or deletes it.
 */
export function appendSshAudit(line: SshAuditLine): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(FILES.sshLog, JSON.stringify(line) + "\n", { mode: MODE });
}

export function readSshAudit(connectorId?: string): SshAuditLine[] {
  let raw: string;
  try {
    raw = fs.readFileSync(FILES.sshLog, "utf8");
  } catch {
    return [];
  }
  const lines: SshAuditLine[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line) as SshAuditLine);
    } catch {
      // A torn last line from a crash mid-append. The line before it is intact.
    }
  }
  return connectorId ? lines.filter((l) => l.connectorId === connectorId) : lines;
}

// ---------- connector secrets ----------

const KEYS_DIR = path.join(DATA_DIR, "workspace-keys");

function keyFile(connectorId: string): string {
  // Ids come from newId(), but assert anyway: this joins into a path.
  if (!/^[\w-]+$/.test(connectorId)) throw new Error("Bad connector id.");
  return path.join(KEYS_DIR, connectorId);
}

/**
 * Raw secret text (a PAT line or a private key) at mode 0600. ssh -i refuses
 * keys that are not 0600, so the mode is load-bearing twice over.
 */
export function saveSecret(connectorId: string, text: string): void {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(keyFile(connectorId), text, { mode: MODE });
}

export function secretPath(connectorId: string): string {
  return keyFile(connectorId);
}

export function hasSecret(connectorId: string): boolean {
  return fs.existsSync(keyFile(connectorId));
}

export function deleteSecret(connectorId: string): void {
  fs.rmSync(keyFile(connectorId), { force: true });
}
