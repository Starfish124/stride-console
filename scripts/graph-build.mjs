#!/usr/bin/env node
// Build the Stride knowledge graph: every Stride codebase, plus the session
// notes that machines have registered, merged into one graph.
//
// Code extraction is tree-sitter and needs no LLM at all — measured at four
// seconds for a four-hundred-file repo, and it caches between runs. Nothing
// here calls a paid API.
//
// Usage: node scripts/graph-build.mjs [--quiet]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH_DIR = path.join(ROOT, "data", "graph");
const SESSIONS_DIR = path.join(GRAPH_DIR, "sessions");
const OUT = path.join(GRAPH_DIR, "out");

const quiet = process.argv.includes("--quiet");
const say = (m) => !quiet && console.log(m);

/** graphify installs as a uv tool; the login shell has it, launchd may not. */
function graphifyBin() {
  const override = process.env.GRAPHIFY_BIN;
  if (override) return override;
  const local = path.join(os.homedir(), ".local", "bin", "graphify");
  return fs.existsSync(local) ? local : "graphify";
}

/**
 * The bodies of work worth graphing. A repo that is not on this disk is
 * skipped rather than failing the build — this Mac is not the only machine
 * these live on.
 */
function targets() {
  const listed = process.env.STRIDE_GRAPH_REPOS;
  const repos = listed
    ? listed.split(",").map((r) => r.trim()).filter(Boolean)
    : [
        path.join(os.homedir(), "stride-console"),
        path.join(os.homedir(), "ai-agency-website"),
        path.join(os.homedir(), "stride-pitch"),
      ];
  const found = repos.filter((repo) => fs.existsSync(repo));
  // The session notes are a body of work too: markdown in one folder.
  if (fs.existsSync(SESSIONS_DIR) && fs.readdirSync(SESSIONS_DIR).some((f) => f.endsWith(".md"))) {
    found.push(SESSIONS_DIR);
  }
  return found;
}

function build(dir, bin) {
  const started = Date.now();
  const res = spawnSync(bin, ["update", dir], {
    encoding: "utf8",
    timeout: 900_000,
    env: { ...process.env, GRAPHIFY_FORCE: "1" },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (res.error || res.status !== 0) {
    const why = (res.stderr || res.error?.message || "").split("\n").slice(-3).join(" ").trim();
    say(`  ✗ ${path.basename(dir)} — ${why || "graphify failed"}`);
    return null;
  }
  const graph = path.join(dir, "graphify-out", "graph.json");
  if (!fs.existsSync(graph)) {
    say(`  ✗ ${path.basename(dir)} — no graph came out`);
    return null;
  }
  const counts = /Rebuilt: (\d+) nodes, (\d+) edges/.exec(res.stdout ?? "");
  say(`  ✓ ${path.basename(dir)} — ${counts ? `${counts[1]} nodes` : "built"} in ${seconds}s`);
  return graph;
}

function main() {
  const bin = graphifyBin();
  fs.mkdirSync(OUT, { recursive: true });

  const dirs = targets();
  if (dirs.length === 0) {
    say("Nothing to graph yet: no Stride repo on this disk and no sessions registered.");
    process.exit(0);
  }

  say(`Graphing ${dirs.length} ${dirs.length === 1 ? "body" : "bodies"} of work.`);
  const graphs = dirs.map((dir) => build(dir, bin)).filter(Boolean);
  if (graphs.length === 0) {
    console.error("Every build failed; the graph was left as it was.");
    process.exit(1);
  }

  const merged = path.join(OUT, "graph.json");
  if (graphs.length === 1) {
    fs.copyFileSync(graphs[0], merged);
  } else {
    const res = spawnSync(bin, ["merge-graphs", ...graphs, "--out", merged], {
      encoding: "utf8",
      timeout: 600_000,
    });
    if (res.status !== 0 || !fs.existsSync(merged)) {
      console.error(`The merge failed: ${(res.stderr ?? "").split("\n").slice(-2).join(" ")}`);
      process.exit(1);
    }
  }

  // The viewer is whatever graphify drew for the largest single body of
  // work; a merged graph has no page of its own.
  const biggest = graphs
    .map((g) => ({ g, size: fs.statSync(g).size }))
    .sort((a, b) => b.size - a.size)[0];
  const html = path.join(path.dirname(biggest.g), "graph.html");
  if (fs.existsSync(html)) fs.copyFileSync(html, path.join(OUT, "graph.html"));

  const stats = JSON.parse(fs.readFileSync(merged, "utf8"));
  const nodes = stats.nodes?.length ?? 0;
  // node-link JSON calls them links; older graphify output says edges.
  const edges = stats.links?.length ?? stats.edges?.length ?? 0;
  fs.writeFileSync(
    path.join(OUT, "built.json"),
    JSON.stringify({ at: new Date().toISOString(), bodies: dirs.length, nodes, edges }, null, 2),
  );
  say(`Graph: ${nodes} nodes, ${edges} edges across ${dirs.length}.`);
}

main();
