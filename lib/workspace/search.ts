// Instant search across every client's project files.
//
// One ripgrep run with cwd at the workspaces root: the client and project
// fall out of the hit's own path (<clientId>/<projectId>/rest) rather than
// being reconstructed, and one spawn beats one per project.

import { spawnSync } from "node:child_process";
import { WORKSPACES_ROOT } from "./files.ts";
import { listProjects } from "./store.ts";

const RG_BIN = process.env.STRIDE_RG ?? "rg";

export interface SearchHit {
  clientId: string;
  projectId: string;
  path: string;
  line: number;
  text: string;
}

export function searchWorkspaces(
  query: string,
  options: { clientId?: string; cap?: number } = {},
): SearchHit[] {
  const cap = options.cap ?? 200;
  // The path argument is a directory name, so it must be an id and nothing else.
  const pathArg =
    options.clientId && /^[\w-]+$/.test(options.clientId) ? options.clientId : ".";

  const res = spawnSync(
    RG_BIN,
    [
      "--line-number",
      "--no-heading",
      "--color",
      "never",
      "--smart-case",
      // Founders type literals, not regexes. A stray bracket should find a
      // bracket, never raise "invalid regex".
      "--fixed-strings",
      "--max-count",
      "3",
      "--max-columns",
      "240",
      "-g",
      "!node_modules",
      "-g",
      "!.git",
      // -e so a query starting with a dash is a query, not a flag.
      "-e",
      query,
      "--",
      pathArg,
    ],
    { cwd: WORKSPACES_ROOT, encoding: "utf8", timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
  );

  if (res.error) {
    throw new Error("Search needs ripgrep on this machine and it was not found.");
  }
  // rg exits 1 for "no matches", which is an answer, not a failure.
  if (res.status === 1) return [];
  if (res.status !== 0) {
    throw new Error(`Search failed: ${(res.stderr ?? "").split("\n")[0]}`);
  }

  const known = new Set(listProjects().map((p) => p.id));
  const hits: SearchHit[] = [];
  for (const raw of (res.stdout ?? "").split("\n")) {
    if (!raw.trim()) continue;
    const match = raw.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;
    const segments = match[1].replace(/^\.\//, "").split("/");
    if (segments.length < 3) continue;
    const [clientId, projectId, ...rest] = segments;
    // A deleted project can leave its directory behind; do not surface it.
    if (!known.has(projectId)) continue;
    hits.push({
      clientId,
      projectId,
      path: rest.join("/"),
      line: Number(match[2]),
      text: match[3].trim().slice(0, 240),
    });
    if (hits.length >= cap) break;
  }
  return hits;
}
