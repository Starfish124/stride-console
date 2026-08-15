// Deliverables for the building area: what Stride has to ship, each with a
// checklist and dependencies, drawn as a DAG on /build. Founders edit
// everything; the seed below only records work that is verifiable on this
// machine today.

import path from "node:path";
import { DATA_DIR, readJson, writeJson, newId } from "../store.ts";

export type DeliverableStatus = "todo" | "doing" | "blocked" | "done";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface Deliverable {
  id: string;
  title: string;
  status: DeliverableStatus;
  owner?: string;
  due?: string; // YYYY-MM-DD; absent = no date claimed
  deps: string[]; // ids that must ship first
  checklist: ChecklistItem[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

const FILE = () => path.join(DATA_DIR, "build-deliverables.json");
const MODE = 0o600;

function item(label: string): ChecklistItem {
  return { id: newId("chk"), label, done: false };
}

function seed(): Deliverable[] {
  const now = new Date().toISOString();
  const synth: Deliverable = {
    id: newId("del"),
    title: "Durabo synthese-pass over alle transcripten",
    status: "doing",
    deps: [],
    checklist: [
      item("Resterende transcripten verwerken"),
      item("Brain-bestanden bijwerken"),
      item("rita-el-khuri → Anouk correctie doorvoeren"),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const report: Deliverable = {
    id: newId("del"),
    title: "Durabo eindrapport discovery",
    status: "todo",
    deps: [synth.id],
    checklist: [
      item("Opportunity-buckets valideren"),
      item("Client-facing rapport"),
      item("Presentatie aan Durabo"),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const pitch: Deliverable = {
    id: newId("del"),
    title: "Stride pitch deck hosten",
    status: "todo",
    deps: [],
    checklist: [item("Host kiezen"), item("Deploy"), item("Link in console")],
    createdAt: now,
    updatedAt: now,
  };
  return [synth, report, pitch];
}

export function listDeliverables(): Deliverable[] {
  const existing = readJson<Deliverable[] | null>(FILE(), null);
  if (existing) return existing;
  const seeded = seed();
  writeJson(FILE(), seeded, MODE);
  return seeded;
}

function save(items: Deliverable[]): void {
  writeJson(FILE(), items, MODE);
}

/** Drop self-references and ids that do not exist. */
function cleanDeps(deps: string[], selfId: string, all: Deliverable[]): string[] {
  const known = new Set(all.map((d) => d.id));
  return [...new Set(deps)].filter((id) => id !== selfId && known.has(id));
}

export function addDeliverable(input: {
  title: string;
  owner?: string;
  due?: string;
  deps?: string[];
  note?: string;
}): Deliverable {
  const items = listDeliverables();
  const now = new Date().toISOString();
  const d: Deliverable = {
    id: newId("del"),
    title: input.title.trim(),
    status: "todo",
    owner: input.owner || undefined,
    due: input.due || undefined,
    deps: [],
    checklist: [],
    note: input.note || undefined,
    createdAt: now,
    updatedAt: now,
  };
  d.deps = cleanDeps(input.deps ?? [], d.id, items);
  items.push(d);
  save(items);
  return d;
}

export function updateDeliverable(
  id: string,
  patch: Partial<Pick<Deliverable, "title" | "status" | "owner" | "due" | "deps" | "note">>,
): Deliverable | undefined {
  const items = listDeliverables();
  const d = items.find((x) => x.id === id);
  if (!d) return undefined;
  if (patch.title !== undefined) d.title = patch.title.trim();
  if (patch.status !== undefined) d.status = patch.status;
  if (patch.owner !== undefined) d.owner = patch.owner || undefined;
  if (patch.due !== undefined) d.due = patch.due || undefined;
  if (patch.note !== undefined) d.note = patch.note || undefined;
  if (patch.deps !== undefined) d.deps = cleanDeps(patch.deps, id, items);
  d.updatedAt = new Date().toISOString();
  save(items);
  return d;
}

export function tickItem(id: string, itemId: string, done: boolean): Deliverable | undefined {
  const items = listDeliverables();
  const d = items.find((x) => x.id === id);
  if (!d) return undefined;
  const c = d.checklist.find((x) => x.id === itemId);
  if (!c) return undefined;
  c.done = done;
  d.updatedAt = new Date().toISOString();
  save(items);
  return d;
}

export function addItem(id: string, label: string): Deliverable | undefined {
  const items = listDeliverables();
  const d = items.find((x) => x.id === id);
  if (!d) return undefined;
  d.checklist.push(item(label.trim()));
  d.updatedAt = new Date().toISOString();
  save(items);
  return d;
}

export function removeDeliverable(id: string): boolean {
  const items = listDeliverables();
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return false;
  for (const d of next) d.deps = d.deps.filter((dep) => dep !== id);
  save(next);
  return true;
}

// ——— the flowchart ———————————————————————————————————————————————

export interface DagNode {
  id: string;
  title: string;
  status: DeliverableStatus;
  depth: number;
  row: number;
}

export interface Dag {
  nodes: DagNode[];
  edges: { from: string; to: string }[];
  cols: number;
}

/**
 * Layered layout: a deliverable sits one column right of its deepest
 * dependency, so columns read left-to-right as build order. A dependency
 * cycle would be founder input error; its edge is ignored rather than crashed
 * on, and the layout still returns.
 */
export function layoutDag(items: Deliverable[]): Dag {
  const byId = new Map(items.map((d) => [d.id, d]));
  const depthOf = new Map<string, number>();
  const visiting = new Set<string>();

  function depth(id: string): number {
    const known = depthOf.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle: treat as a root, don't recurse
    visiting.add(id);
    const d = byId.get(id);
    const deps = d ? d.deps.filter((x) => byId.has(x)) : [];
    const value = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depth));
    visiting.delete(id);
    depthOf.set(id, value);
    return value;
  }

  const rows = new Map<number, number>();
  const nodes: DagNode[] = items.map((d) => {
    const col = depth(d.id);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { id: d.id, title: d.title, status: d.status, depth: col, row };
  });

  const edges = items.flatMap((d) =>
    d.deps.filter((dep) => byId.has(dep)).map((dep) => ({ from: dep, to: d.id })),
  );

  return { nodes, edges, cols: nodes.length ? Math.max(...nodes.map((n) => n.depth)) + 1 : 0 };
}
