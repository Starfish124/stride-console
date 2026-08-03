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

/**
 * What no repo should contribute to the graph.
 *
 * Config files are parsed as data, so every key becomes a node: a graph where
 * "version", "private" and "compilerOptions" are concepts buries the parts
 * that are. Third-party skill packs are somebody else's writing that happens
 * to live on our disk. Together these were a third of the graph.
 */
const IGNORE = `# Written by the Stride console's graph builder. Edits here are overwritten.
#
# The graph is a map of what we built.

# Third-party skill packs: not our code.
library/
.agents/
.claude/

# Config and lockfiles: keys are not concepts.
package.json
package-lock.json
tsconfig.json
*.lock
*.lockb
skills-lock.json

# Machine output.
graphify-out/
.next/
node_modules/
`;

/**
 * Put the ignore rules in a repo without that repo noticing: the file itself
 * goes in .git/info/exclude, which is local to this clone and never
 * committed, so a founder's `git status` in the website repo stays clean.
 *
 * Returns true when the rules changed, because graphify fails closed on a
 * shrinking corpus — it keeps the nodes that just left and asks for a full
 * re-extraction. So a rule change has to take the cached output with it.
 */
function applyIgnore(dir) {
  const file = path.join(dir, ".graphifyignore");
  let changed = false;
  try {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== IGNORE) {
      fs.writeFileSync(file, IGNORE);
      changed = true;
    }
    const exclude = path.join(dir, ".git", "info", "exclude");
    if (fs.existsSync(path.dirname(exclude))) {
      const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
      if (!current.split("\n").includes(".graphifyignore")) {
        fs.appendFileSync(exclude, `${current.endsWith("\n") || !current ? "" : "\n"}.graphifyignore\n`);
      }
    }
  } catch {
    // A directory we cannot write to still graphs, just noisily.
  }
  if (changed) fs.rmSync(path.join(dir, "graphify-out"), { recursive: true, force: true });
  return changed;
}

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
  // Sessions are deliberately NOT graphed by graphify. Left to it, a note
  // becomes its own markdown headings — every session contributing an
  // identical "What was asked" node, connected to nothing. They are stitched
  // in afterwards instead, as one node each, wired to the code they touched.
  return repos.filter((repo) => fs.existsSync(repo));
}

// ---------- sessions ----------

/** The frontmatter and the touched-file list out of one session note. */
function readSession(file) {
  const raw = fs.readFileSync(file, "utf8");
  const field = (name) => {
    const m = new RegExp(`^${name}:\\s*"?(.+?)"?\\s*$`, "m").exec(raw.slice(0, 600));
    return m?.[1];
  };
  const files = [];
  const block = /## Files touched\n([\s\S]*?)(?:\n## |$)/.exec(raw);
  if (block) {
    for (const line of block[1].split("\n")) {
      const m = /^-\s+`([^`]+)`/.exec(line.trim());
      if (m) files.push(m[1]);
    }
  }
  return {
    id: field("session") ?? path.basename(file, ".md"),
    title: field("title") ?? path.basename(file, ".md"),
    date: field("date") ?? "",
    project: field("project") ?? "",
    branch: field("branch"),
    files,
  };
}

/**
 * Add each registered session to the graph, and join it to the code it
 * actually touched. This is the whole reason sessions are in here: without
 * these edges the notes are an island, and the graph cannot answer "who has
 * worked on this file" or "what did that week change".
 *
 * A touched path is matched against the file-level node of the repo the
 * session ran in. Paths that no longer resolve — a file since renamed or
 * deleted — are counted and dropped rather than invented as new nodes.
 */
function stitchSessions(graph) {
  let notes;
  try {
    notes = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return { sessions: 0, edges: 0, unresolved: 0 };
  }
  if (notes.length === 0) return { sessions: 0, edges: 0, unresolved: 0 };

  // Index the file-level node for every source file, per repo. Several nodes
  // share a source_file (the functions inside it); the file itself is the one
  // declared at the top.
  const byFile = new Map();
  for (const node of graph.nodes) {
    const key = `${node.repo}::${node.source_file}`;
    const existing = byFile.get(key);
    if (!existing || node.source_location === "L1") byFile.set(key, node);
  }

  let edges = 0;
  let unresolved = 0;
  for (const name of notes) {
    const session = readSession(path.join(SESSIONS_DIR, name));
    const id = `session::${session.id}`;
    graph.nodes.push({
      id,
      label: session.title,
      norm_label: session.title,
      file_type: "session",
      repo: "sessions",
      source_file: name,
      community_name: "Sessions",
      _origin: "console",
      date: session.date,
      branch: session.branch,
    });
    for (const touched of session.files) {
      const node = byFile.get(`${session.project}::${touched}`);
      if (!node) {
        unresolved++;
        continue;
      }
      graph.links.push({
        source: id,
        target: node.id,
        relation: "touched",
        confidence: "EXTRACTED",
        confidence_score: 1.0,
        weight: 1.0,
        _origin: "console",
      });
      edges++;
    }
  }
  return { sessions: notes.length, edges, unresolved };
}

function build(dir, bin) {
  const started = Date.now();
  const purged = applyIgnore(dir);
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
  const how = counts ? `${counts[1]} nodes` : "built";
  say(`  ✓ ${path.basename(dir)} — ${how} in ${seconds}s${purged ? " (rules changed, rebuilt clean)" : ""}`);
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

  const graph = JSON.parse(fs.readFileSync(merged, "utf8"));
  // node-link JSON calls them links; older graphify output says edges.
  if (!graph.links) graph.links = graph.edges ?? [];

  const stitched = stitchSessions(graph);
  if (stitched.sessions > 0) {
    fs.writeFileSync(merged, JSON.stringify(graph));
    const missed = stitched.unresolved
      ? `, ${stitched.unresolved} path${stitched.unresolved === 1 ? "" : "s"} no longer in the code`
      : "";
    say(`  ✓ sessions — ${stitched.sessions} joined by ${stitched.edges} touched ${stitched.edges === 1 ? "file" : "files"}${missed}`);
  }

  const nodes = graph.nodes.length;
  const edges = graph.links.length;
  fs.writeFileSync(
    path.join(OUT, "built.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        bodies: dirs.length,
        nodes,
        edges,
        sessions: stitched.sessions,
        sessionEdges: stitched.edges,
      },
      null,
      2,
    ),
  );
  say(`Graph: ${nodes} nodes, ${edges} edges across ${dirs.length}.`);
}

main();
