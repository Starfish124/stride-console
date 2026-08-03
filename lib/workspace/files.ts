// The workspace filesystem: where project files live and every path in or
// out of a project directory.
//
// The root sits OUTSIDE the repo on purpose. Client clones can be gigabytes;
// inside the repo they would hit Next's file tracer, the dev watcher and
// every other session's greps. And never under ~/Desktop or ~/Documents —
// iCloud evicts files there (it took this app down once).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureRepo } from "./git.ts";
import type { Project } from "./types.ts";

export const WORKSPACES_ROOT =
  process.env.STRIDE_WORKSPACES ?? path.join(os.homedir(), "stride-workspaces");

/** A dropped file may not be bigger than this. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function projectDir(project: Project): string {
  // Ids come from newId(), but they join into paths — assert anyway.
  if (!/^[\w-]+$/.test(project.clientId) || !/^[\w-]+$/.test(project.id)) {
    throw new Error("Bad project id.");
  }
  return path.join(WORKSPACES_ROOT, project.clientId, project.id);
}

/** Create the project directory (and make it a repo). Idempotent. */
export function ensureProjectDir(project: Project): string {
  const dir = projectDir(project);
  fs.mkdirSync(dir, { recursive: true });
  const repo = ensureRepo(dir);
  if (!repo.ok) throw new Error(`Could not set up the project: ${repo.output}`);
  return dir;
}

/**
 * The one traversal choke point. Every browse, upload, preview and delete
 * resolves its relative path through here. Spaces are allowed — real dropped
 * files have them; the resolve-prefix check is the actual guard.
 */
export function safeJoin(root: string, rel: string): string {
  const segments = rel.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || seg.includes("\\") || seg.includes("\0")) {
      throw new Error("That path is not allowed.");
    }
  }
  const joined = path.join(root, ...segments);
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("That path is not allowed.");
  }
  return resolved;
}

export interface DirEntry {
  name: string;
  dir: boolean;
  size: number;
  mtime: string;
}

/** One directory level. Drill in per click; no tree walks on the server. */
export function listDir(project: Project, rel = ""): DirEntry[] {
  const root = projectDir(project);
  const target = rel ? safeJoin(root, rel) : root;
  const entries = fs.readdirSync(target, { withFileTypes: true });
  return entries
    .filter((e) => e.name !== ".git")
    .map((e) => {
      const stat = fs.statSync(path.join(target, e.name));
      return {
        name: e.name,
        dir: e.isDirectory(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
}

export function saveFile(project: Project, rel: string, bytes: Uint8Array): void {
  const full = safeJoin(projectDir(project), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
}

export function removePath(project: Project, rel: string): void {
  // Recursive delete is fine: this is our sandbox copy, and it is in git.
  fs.rmSync(safeJoin(projectDir(project), rel), { recursive: true, force: true });
}

/** First `cap` bytes as text, for previews. */
export function readTextFile(project: Project, rel: string, cap = 100_000): string {
  const full = safeJoin(projectDir(project), rel);
  const fd = fs.openSync(full, "r");
  try {
    const buf = Buffer.alloc(cap);
    const read = fs.readSync(fd, buf, 0, cap, 0);
    return buf.subarray(0, read).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
