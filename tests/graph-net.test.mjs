// The drawing is only readable because the network is collapsed to one node
// per file. These check that the collapsing is honest: functions fold into
// their file, edges inside a file disappear, parallel edges become one thick
// line, and nothing that was left out is left out silently.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

function withGraph(graph) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-net-"));
  try {
    fs.mkdirSync(path.join(dir, "data", "graph", "out"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "data", "graph", "out", "graph.json"),
      JSON.stringify(graph),
    );
    const stdout = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { network } from ${mod("lib/graph/net.ts")};
         console.log(JSON.stringify(network()));`,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const code = (id, file, repo = "app", location = undefined) => ({
  id,
  label: id,
  repo,
  source_file: file,
  file_type: "code",
  source_location: location,
});

test("functions fold into their file, and edges inside one file vanish", () => {
  const net = withGraph({
    nodes: [
      code("store:file", "lib/store.ts", "app", "L1"),
      code("store:read", "lib/store.ts"),
      code("store:write", "lib/store.ts"),
      code("page", "app/page.tsx"),
    ],
    links: [
      // Both of these live inside lib/store.ts — they are not structure.
      { source: "store:read", target: "store:write", relation: "calls" },
      { source: "store:write", target: "store:read", relation: "calls" },
      // Two calls into the same file collapse to one weighted line.
      { source: "page", target: "store:read", relation: "calls" },
      { source: "page", target: "store:write", relation: "calls" },
    ],
  });

  assert.equal(net.built, true);
  assert.equal(net.nodes.length, 2, "three function nodes are one file");
  assert.equal(net.links.length, 1, "self-edges gone, parallel edges merged");
  assert.equal(net.links[0].w, 2, "the merged line remembers how many it stands for");

  const store = net.nodes.find((n) => n.file === "lib/store.ts");
  assert.equal(store.id, "store:file", "the file's own node is the one to open");
  assert.equal(store.label, "lib/store.ts");
  assert.equal(store.weight, 2, "weight counts what leans on the file");
});

test("only dependency and touched edges count, and sessions stay their own kind", () => {
  const net = withGraph({
    nodes: [
      code("a", "lib/a.ts"),
      code("b", "lib/b.ts"),
      { id: "s1", label: "A session", file_type: "session", repo: "sessions", date: "2026-08-03" },
    ],
    links: [
      // `contains` is structure, not dependency — it must not draw a line.
      { source: "a", target: "b", relation: "contains" },
      { source: "a", target: "b", relation: "imports" },
      { source: "s1", target: "a", relation: "touched" },
    ],
  });

  assert.equal(net.links.length, 2, "contains is not a dependency");
  const touched = net.links.filter((l) => l.touched);
  assert.equal(touched.length, 1);

  const session = net.nodes.find((n) => n.kind === "session");
  assert.ok(session, "a session is a node in the drawing");
  assert.equal(session.date, "2026-08-03");
  assert.equal(session.weight, 1, "a session is sized by how many files it went into");

  const a = net.nodes.find((n) => n.file === "lib/a.ts");
  const b = net.nodes.find((n) => n.file === "lib/b.ts");
  assert.equal(b.weight, 1, "b is imported, so b is what gets leaned on");
  assert.equal(a.weight, 0, "a session touching a file is not something leaning on it");
});

test("unconnected files are dropped, and counted rather than hidden", () => {
  const net = withGraph({
    nodes: [code("a", "lib/a.ts"), code("b", "lib/b.ts"), code("lonely", "lib/lonely.ts")],
    links: [{ source: "a", target: "b", relation: "imports" }],
  });

  assert.equal(net.nodes.length, 2);
  assert.equal(net.hidden, 1, "the picture must say what it left out");
});

test("no graph on disk is a shape the page can render, not a throw", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-net-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { network } from ${mod("lib/graph/net.ts")};
         console.log(JSON.stringify(network()));`,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    const net = JSON.parse(stdout.trim().split("\n").pop());
    assert.equal(net.built, false);
    assert.deepEqual(net.nodes, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
