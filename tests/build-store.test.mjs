// The building area's stores: deliverables survive the round trip, deps stay
// honest (no self, no dangling, cleaned on delete), the seed happens exactly
// once, and the DAG layout returns even when a founder wires a cycle.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { layoutDag } from "../lib/build/deliverables.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

const PREAMBLE = `
import * as del from ${mod("lib/build/deliverables.ts")};
import * as proto from ${mod("lib/build/prototypes.ts")};
const out = (value) => console.log(JSON.stringify(value));
`;

// DATA_DIR resolves from cwd at import, so each scenario runs in its own
// temp directory — the store starts empty and seeds itself.
function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-build-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      { cwd: dir, encoding: "utf8", env: { ...process.env } },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    return JSON.parse(lines[lines.length - 1]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("deliverables seed once, and only once", () => {
  const r = inSandbox(`
    const first = del.listDeliverables();
    const second = del.listDeliverables();
    out({ first: first.length, second: second.length, titles: first.map(d => d.title) });
  `);
  assert.equal(r.first, 3);
  assert.equal(r.second, 3);
  assert.ok(r.titles.some((t) => t.includes("synthese")));
});

test("add, update, tick and remove round-trip; deps stay clean", () => {
  const r = inSandbox(`
    const a = del.addDeliverable({ title: "A" });
    const b = del.addDeliverable({ title: "B", deps: [a.id, a.id, "nope"] });
    // self-dep and a dangling id must both be dropped
    del.updateDeliverable(a.id, { deps: [a.id, "ghost", b.id] });
    const withItem = del.addItem(a.id, "step one");
    del.tickItem(a.id, withItem.checklist[0].id, true);
    del.removeDeliverable(b.id);
    const after = del.listDeliverables();
    const aa = after.find(d => d.id === a.id);
    out({
      bDeps: b.deps,
      aDepsAfterRemove: aa.deps,
      ticked: aa.checklist[0].done,
      count: after.length,
    });
  `);
  assert.deepEqual(r.bDeps, r.bDeps.filter((d) => d !== "nope"));
  assert.equal(r.bDeps.length, 1);
  // b was removed, so a's dep on b must be gone too — and the self-dep never landed
  assert.deepEqual(r.aDepsAfterRemove, []);
  assert.equal(r.ticked, true);
  assert.equal(r.count, 3 + 2 - 1);
});

test("prototypes seed with the trend engine and tick", () => {
  const r = inSandbox(`
    const list = proto.listPrototypes();
    const p = list[0];
    proto.tickNeed(p.id, p.needs[0].id, true);
    const again = proto.listPrototypes();
    out({ name: p.name, needs: p.needs.length, firstDone: again[0].needs[0].done });
  `);
  assert.ok(r.name.toLowerCase().includes("trend"));
  assert.equal(r.needs, 5);
  assert.equal(r.firstDone, true);
});

// ——— layoutDag is pure: test in-process ————————————————————————

function d(id, deps = []) {
  return {
    id,
    title: id,
    status: "todo",
    deps,
    checklist: [],
    createdAt: "",
    updatedAt: "",
  };
}

test("a chain lays out left to right", () => {
  const dag = layoutDag([d("a"), d("b", ["a"]), d("c", ["b"])]);
  const depth = Object.fromEntries(dag.nodes.map((n) => [n.id, n.depth]));
  assert.deepEqual(depth, { a: 0, b: 1, c: 2 });
  assert.equal(dag.cols, 3);
  assert.equal(dag.edges.length, 2);
});

test("a diamond joins at the deeper column", () => {
  const dag = layoutDag([d("a"), d("b", ["a"]), d("c", ["a"]), d("e", ["b", "c"])]);
  const depth = Object.fromEntries(dag.nodes.map((n) => [n.id, n.depth]));
  assert.equal(depth.e, 2);
  // b and c share a column, on different rows
  const b = dag.nodes.find((n) => n.id === "b");
  const c = dag.nodes.find((n) => n.id === "c");
  assert.equal(b.depth, c.depth);
  assert.notEqual(b.row, c.row);
});

test("a cycle still returns a layout", () => {
  const dag = layoutDag([d("a", ["b"]), d("b", ["a"])]);
  assert.equal(dag.nodes.length, 2);
  assert.ok(dag.cols >= 1);
});
