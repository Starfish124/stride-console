// Reading the graph as a map rather than a picture.
//
// graphify draws a force-directed render, which is honest and unreadable: two
// thousand dots tell you the shape of the thing and nothing you can act on.
// The questions actually worth asking have answers, and they are countable —
// what are the parts, what holds everything else up, what have we worked on,
// and what would break if this changed.

import fs from "node:fs";
import path from "node:path";
import { GRAPH_DIR } from "./store.ts";

const GRAPH_FILE = path.join(GRAPH_DIR, "out", "graph.json");

/** Edges that mean "this depends on that", as opposed to structure. */
export const DEPENDS = new Set([
  "imports",
  "imports_from",
  "calls",
  "indirect_call",
  "references",
]);

export interface RawNode {
  source_location?: string;
  id: string;
  label: string;
  repo?: string;
  source_file?: string;
  file_type?: string;
  date?: string;
}

export interface RawLink {
  source: string;
  target: string;
  relation?: string;
}

interface RawGraph {
  nodes: RawNode[];
  links: RawLink[];
}

export interface Area {
  name: string;
  count: number;
}

export interface RepoSummary {
  repo: string;
  nodes: number;
  areas: Area[];
}

export interface SpineEntry {
  id: string;
  label: string;
  repo: string;
  file: string;
  dependents: number;
}

export interface SessionEntry {
  id: string;
  label: string;
  date: string;
  touched: { id: string; label: string }[];
}

export interface GraphMap {
  built: boolean;
  nodes: number;
  links: number;
  repos: RepoSummary[];
  spine: SpineEntry[];
  sessions: SessionEntry[];
}

export interface Neighbourhood {
  id: string;
  label: string;
  repo: string;
  file: string;
  dependsOn: { id: string; label: string; repo: string }[];
  dependedOnBy: { id: string; label: string; repo: string }[];
  touchedBy: { id: string; label: string; date: string }[];
}

// The file is megabytes; re-reading it per request would make the page crawl.
// Keyed on mtime, so a rebuild is picked up without a restart.
let cache: { key: string; graph: RawGraph } | undefined;

export function load(): RawGraph | undefined {
  let key: string;
  try {
    key = String(fs.statSync(GRAPH_FILE).mtimeMs);
  } catch {
    return undefined;
  }
  if (cache?.key === key) return cache.graph;
  try {
    const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8")) as RawGraph;
    if (!graph.links) graph.links = [];
    cache = { key, graph };
    return graph;
  } catch {
    return undefined;
  }
}

/** The folder a file lives in, one level deep — "lib/workspace", "app/api". */
function areaOf(file: string | undefined): string {
  if (!file) return "elsewhere";
  const parts = file.split("/");
  if (parts.length === 1) return "root";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

export const idOf = (end: RawLink["source"]): string =>
  typeof end === "string" ? end : ((end as { id: string }).id ?? String(end));

export function graphMap(): GraphMap {
  const graph = load();
  if (!graph) {
    return { built: false, nodes: 0, links: 0, repos: [], spine: [], sessions: [] };
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // What depends on what, counted per target.
  const dependents = new Map<string, number>();
  for (const link of graph.links) {
    if (!DEPENDS.has(link.relation ?? "")) continue;
    const target = idOf(link.target);
    dependents.set(target, (dependents.get(target) ?? 0) + 1);
  }

  // Repos and the areas inside them.
  const repoAreas = new Map<string, Map<string, number>>();
  for (const node of graph.nodes) {
    const repo = node.repo ?? "elsewhere";
    if (repo === "sessions") continue;
    const areas = repoAreas.get(repo) ?? new Map<string, number>();
    const area = areaOf(node.source_file);
    areas.set(area, (areas.get(area) ?? 0) + 1);
    repoAreas.set(repo, areas);
  }
  const repos: RepoSummary[] = [...repoAreas.entries()]
    .map(([repo, areas]) => ({
      repo,
      nodes: [...areas.values()].reduce((a, b) => a + b, 0),
      areas: [...areas.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    }))
    .sort((a, b) => b.nodes - a.nodes);

  // The spine: what the most other things lean on, counted per FILE. A graph
  // node exists per function too, so counting nodes lists lib/store.ts five
  // times over — once per popular function in it. What a person wants to know
  // is which file is load-bearing, so every dependency on anything inside a
  // file counts toward that file.
  const perFile = new Map<string, { node: RawNode; count: number }>();
  for (const [id, count] of dependents) {
    const node = byId.get(id);
    if (!node || node.file_type !== "code" || !node.source_file) continue;
    const key = `${node.repo}::${node.source_file}`;
    const entry = perFile.get(key);
    if (entry) {
      entry.count += count;
      // Prefer the file's own node as the one to open.
      if (node.source_location === "L1") entry.node = node;
    } else {
      perFile.set(key, { node, count });
    }
  }
  const spine: SpineEntry[] = [...perFile.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((e) => ({
      id: e.node.id,
      label: e.node.source_file?.split("/").slice(-2).join("/") ?? e.node.label,
      repo: e.node.repo ?? "",
      file: e.node.source_file ?? "",
      dependents: e.count,
    }));

  // Sessions, newest first, with what each one touched.
  const touchedBySession = new Map<string, { id: string; label: string }[]>();
  for (const link of graph.links) {
    if (link.relation !== "touched") continue;
    const source = idOf(link.source);
    const target = byId.get(idOf(link.target));
    if (!target) continue;
    touchedBySession.set(source, [
      ...(touchedBySession.get(source) ?? []),
      { id: target.id, label: target.label },
    ]);
  }
  const sessions: SessionEntry[] = graph.nodes
    .filter((n) => n.file_type === "session")
    .map((n) => ({
      id: n.id,
      label: n.label,
      date: n.date ?? "",
      touched: touchedBySession.get(n.id) ?? [],
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    built: true,
    nodes: graph.nodes.length,
    links: graph.links.length,
    repos,
    spine,
    sessions,
  };
}

/** Everything immediately around one node: both directions, plus who touched it. */
export function neighbourhood(id: string): Neighbourhood | undefined {
  const graph = load();
  if (!graph) return undefined;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (!node) return undefined;

  const dependsOn = new Map<string, RawNode>();
  const dependedOnBy = new Map<string, RawNode>();
  const touchedBy: { id: string; label: string; date: string }[] = [];

  for (const link of graph.links) {
    const source = idOf(link.source);
    const target = idOf(link.target);
    if (link.relation === "touched" && target === id) {
      const session = byId.get(source);
      if (session) touchedBy.push({ id: session.id, label: session.label, date: session.date ?? "" });
      continue;
    }
    if (!DEPENDS.has(link.relation ?? "")) continue;
    if (source === id) {
      const other = byId.get(target);
      if (other && other.id !== id) dependsOn.set(other.id, other);
    } else if (target === id) {
      const other = byId.get(source);
      if (other && other.id !== id) dependedOnBy.set(other.id, other);
    }
  }

  const shape = (n: RawNode) => ({ id: n.id, label: n.label, repo: n.repo ?? "" });
  return {
    id: node.id,
    label: node.label,
    repo: node.repo ?? "",
    file: node.source_file ?? "",
    dependsOn: [...dependsOn.values()].map(shape).slice(0, 40),
    dependedOnBy: [...dependedOnBy.values()].map(shape).slice(0, 40),
    touchedBy,
  };
}

/** Find nodes by name, for the search box. */
export function findNodes(query: string, limit = 20): SpineEntry[] {
  const graph = load();
  if (!graph || !query.trim()) return [];
  const needle = query.trim().toLowerCase();
  return graph.nodes
    .filter(
      (n) =>
        n.label?.toLowerCase().includes(needle) ||
        n.source_file?.toLowerCase().includes(needle),
    )
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      label: n.label,
      repo: n.repo ?? "",
      file: n.source_file ?? "",
      dependents: 0,
    }));
}
