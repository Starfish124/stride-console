// Code search across every client's projects: hits map back to the right
// client and project, noise is excluded, and orphan directories never
// surface as results.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

const PREAMBLE = `
import fs from "node:fs";
import path from "node:path";
import * as store from ${mod("lib/workspace/store.ts")};
import * as files from ${mod("lib/workspace/files.ts")};
import { searchWorkspaces } from ${mod("lib/workspace/search.ts")};

/** Two clients, one project each, plus noise that must never be searched. */
function seed() {
  const a = { id: "proj_a", clientId: "cl_a", name: "Alpha", kind: "files", createdAt: "x", updatedAt: "x" };
  const b = { id: "proj_b", clientId: "cl_b", name: "Beta", kind: "files", createdAt: "x", updatedAt: "x" };
  for (const p of [a, b]) { files.ensureProjectDir(p); store.putProject(p); }
  files.saveFile(a, "src/app.py", new TextEncoder().encode("def greet():\\n    return NEEDLE\\n"));
  files.saveFile(b, "index.js", new TextEncoder().encode("// NEEDLE lives here too\\n"));
  // Noise: a dependency dir, and a project directory with no record.
  const noise = path.join(files.projectDir(a), "node_modules", "dep");
  fs.mkdirSync(noise, { recursive: true });
  fs.writeFileSync(path.join(noise, "index.js"), "NEEDLE in a dependency");
  const orphan = path.join(process.env.STRIDE_WORKSPACES, "cl_gone", "proj_gone");
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, "left.txt"), "NEEDLE in a deleted project");
  return { a, b };
}
const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wssearch-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          ...env,
          STRIDE_WORKSPACES: path.join(dir, "workspaces"),
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test",
        },
      },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a hit knows which client and project it came from", () => {
  const result = inSandbox(`
    seed();
    out(searchWorkspaces("NEEDLE").sort((x, y) => x.clientId.localeCompare(y.clientId)));
  `);
  assert.equal(result.length, 2, "dependencies and orphan dirs are not results");
  assert.deepEqual(
    result.map((h) => `${h.clientId}/${h.projectId}/${h.path}:${h.line}`),
    ["cl_a/proj_a/src/app.py:2", "cl_b/proj_b/index.js:1"],
  );
  assert.ok(result[0].text.includes("NEEDLE"), "the matching line comes back");
});

test("node_modules, .git and deleted projects never surface", () => {
  const result = inSandbox(`
    seed();
    const hits = searchWorkspaces("NEEDLE");
    out({
      dependency: hits.some((h) => h.path.includes("node_modules")),
      orphan: hits.some((h) => h.projectId === "proj_gone"),
    });
  `);
  assert.equal(result.dependency, false);
  assert.equal(result.orphan, false, "a directory with no project record is not a place");
});

test("a client narrows the search, and no match is an empty answer", () => {
  const result = inSandbox(`
    seed();
    out({
      narrowed: searchWorkspaces("NEEDLE", { clientId: "cl_b" }).map((h) => h.clientId),
      none: searchWorkspaces("nothing-matches-this"),
      capped: searchWorkspaces("NEEDLE", { cap: 1 }).length,
    });
  `);
  assert.deepEqual(result.narrowed, ["cl_b"]);
  assert.deepEqual(result.none, [], "no matches is [], not a failure");
  assert.equal(result.capped, 1);
});

test("a literal query with regex characters searches for itself", () => {
  const result = inSandbox(`
    const { a } = seed();
    files.saveFile(a, "odd.txt", new TextEncoder().encode("cost = price[0] * 2\\n"));
    out(searchWorkspaces("price[0]").map((h) => h.path));
  `);
  assert.deepEqual(result, ["odd.txt"], "brackets are characters, not a broken regex");
});

test("a missing ripgrep says so in words a founder can act on", () => {
  const result = inSandbox(
    `
    seed();
    try { searchWorkspaces("NEEDLE"); out({ threw: false }); }
    catch (e) { out({ threw: true, message: e.message }); }
  `,
    { STRIDE_RG: "/nonexistent/rg" },
  );
  assert.equal(result.threw, true);
  assert.ok(result.message.includes("ripgrep"));
});
