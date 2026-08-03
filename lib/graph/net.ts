// The graph as a network worth looking at.
//
// graphify draws every node it extracted — 2,898 of them, one per function —
// which is honest and unreadable. A person asking "what is this codebase" does
// not want a dot per function; they want a dot per FILE, and a thick line where
// two files lean on each other a lot. Collapsing to files takes it to ~575
// nodes and ~1,030 links, which is a shape the eye can actually hold.
//
// Layout happens in the browser, so this only ships structure.

import { DEPENDS, idOf, load, type RawLink, type RawNode } from "./map.ts";

export type NetKind = "code" | "doc" | "session";

export interface NetNode {
  /** Stable key for this file within the network. */
  key: string;
  /** The real graph node id, so a tap can open its neighbourhood. */
  id: string;
  label: string;
  repo: string;
  file: string;
  kind: NetKind;
  /** How many other things lean on this file — drives node size. */
  weight: number;
  date?: string;
}

export interface NetLink {
  /** Indices into nodes, so the payload stays small. */
  s: number;
  t: number;
  /** How many underlying edges this one line stands for. */
  w: number;
  touched: boolean;
}

export interface Net {
  built: boolean;
  nodes: NetNode[];
  links: NetLink[];
  repos: string[];
  /** What was left out, so the picture never quietly lies about its coverage. */
  hidden: number;
}

/** Which file (or session) a raw node belongs to. */
function keyOf(node: RawNode): string | undefined {
  if (node.file_type === "session") return `session::${node.id}`;
  if (!node.source_file) return undefined;
  return `${node.repo ?? "elsewhere"}::${node.source_file}`;
}

function kindOf(node: RawNode): NetKind {
  if (node.file_type === "session") return "session";
  return node.file_type === "code" ? "code" : "doc";
}

/** "lib/graph/net.ts" reads better than the full path and still locates it. */
function labelOf(node: RawNode): string {
  // A session is titled with what it was asked to do, which runs to a sentence.
  // Full length belongs in the panel; on the drawing it would blot out a lobe.
  if (node.file_type === "session") {
    return node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label;
  }
  return node.source_file?.split("/").slice(-2).join("/") ?? node.label;
}

export function network(): Net {
  const graph = load();
  if (!graph) return { built: false, nodes: [], links: [], repos: [], hidden: 0 };

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // One entry per file. The node we keep is the one worth opening: a file's own
  // node (source_location L1) beats one of the functions inside it.
  const files = new Map<string, NetNode>();
  for (const node of graph.nodes) {
    const key = keyOf(node);
    if (!key) continue;
    const existing = files.get(key);
    if (existing) {
      if (node.source_location === "L1") existing.id = node.id;
      continue;
    }
    files.set(key, {
      key,
      id: node.id,
      label: labelOf(node),
      repo: node.repo ?? "elsewhere",
      file: node.source_file ?? "",
      kind: kindOf(node),
      weight: 0,
      date: node.date,
    });
  }

  // Collapse every dependency edge onto the pair of files it connects, summing
  // weight. Edges inside a single file disappear, which is the point.
  const merged = new Map<string, { s: string; t: string; w: number; touched: boolean }>();
  const countEdge = (link: RawLink, touched: boolean) => {
    const source = byId.get(idOf(link.source));
    const target = byId.get(idOf(link.target));
    if (!source || !target) return;
    const s = keyOf(source);
    const t = keyOf(target);
    if (!s || !t || s === t) return;
    // Tab, not a space: a source path may legally contain spaces, and two
    // different pairs collapsing onto one key would silently merge their edges.
    const id = `${s}\t${t}`;
    const entry = merged.get(id);
    if (entry) entry.w += 1;
    else merged.set(id, { s, t, w: 1, touched });
    // Weight means "how much is on you". For a file that is what leans on it;
    // for a session it is how many files it went into — a session that touched
    // thirty files should not draw as the same dot as one that touched one.
    if (touched) {
      const sourceNode = files.get(s);
      if (sourceNode) sourceNode.weight += 1;
    } else {
      const targetNode = files.get(t);
      if (targetNode) targetNode.weight += 1;
    }
  };

  for (const link of graph.links) {
    const relation = link.relation ?? "";
    if (relation === "touched") countEdge(link, true);
    else if (DEPENDS.has(relation)) countEdge(link, false);
  }

  // A file nothing links to and that links to nothing is a dot in the void: it
  // adds no structure and costs a label. Drop it, and say how many went.
  const connected = new Set<string>();
  for (const edge of merged.values()) {
    connected.add(edge.s);
    connected.add(edge.t);
  }
  const kept = [...files.values()].filter((n) => connected.has(n.key));
  const hidden = files.size - kept.length;

  const index = new Map(kept.map((n, i) => [n.key, i]));
  const links: NetLink[] = [];
  for (const edge of merged.values()) {
    const s = index.get(edge.s);
    const t = index.get(edge.t);
    if (s === undefined || t === undefined) continue;
    links.push({ s, t, w: edge.w, touched: edge.touched });
  }

  const repos = [...new Set(kept.map((n) => n.repo))].sort();

  return { built: true, nodes: kept, links, repos, hidden };
}
