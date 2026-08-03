// The tooling library: equipping installs into the project's .claude/,
// removal only ever touches library members, and tooling never reaches a
// commit — ours or a client's.

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
import * as files from ${mod("lib/workspace/files.ts")};
import { commitAll } from ${mod("lib/workspace/git.ts")};
import { equipped, listLibrary, syncEquipment } from ${mod("lib/workspace/library.ts")};

const project = { id: "proj_l", clientId: "cl_l", name: "L", kind: "files", createdAt: "x", updatedAt: "x" };

/** A small fixture library: one real skill, one junk dir, one agent. */
function seedLibrary() {
  const lib = process.env.STRIDE_LIBRARY;
  fs.mkdirSync(path.join(lib, "skills", "house-style"), { recursive: true });
  fs.writeFileSync(path.join(lib, "skills", "house-style", "SKILL.md"),
    "---\\nname: house-style\\ndescription: How Stride writes interfaces.\\n---\\nBody.");
  fs.writeFileSync(path.join(lib, "skills", "house-style", "extra.md"), "More.");
  fs.mkdirSync(path.join(lib, "skills", "not-a-skill"), { recursive: true });
  fs.mkdirSync(path.join(lib, "agents"), { recursive: true });
  fs.writeFileSync(path.join(lib, "agents", "reviewer.md"),
    "---\\nname: reviewer\\ndescription: Reviews code.\\n---\\nBody.");
}
const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wslib-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          STRIDE_WORKSPACES: path.join(dir, "workspaces"),
          STRIDE_LIBRARY: path.join(dir, "library"),
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

test("listLibrary reads skills with SKILL.md and agent files, with descriptions", () => {
  const result = inSandbox(`
    seedLibrary();
    out(listLibrary());
  `);
  assert.deepEqual(
    result.map((i) => `${i.kind}:${i.name}`).sort(),
    ["agent:reviewer", "skill:house-style"],
    "a dir without SKILL.md is not a skill",
  );
  assert.equal(result.find((i) => i.name === "house-style").description, "How Stride writes interfaces.");
});

test("an empty library is a real answer, not a crash", () => {
  const result = inSandbox(`out(listLibrary());`);
  assert.deepEqual(result, []);
});

test("equipping installs, unticking removes, and disk is the record", () => {
  const result = inSandbox(`
    seedLibrary();
    files.ensureProjectDir(project);
    const before = equipped(project);
    const on = syncEquipment(project, { skills: ["house-style"], agents: ["reviewer"] });
    const dir = files.projectDir(project);
    const skillInstalled = fs.existsSync(path.join(dir, ".claude", "skills", "house-style", "extra.md"));
    const agentInstalled = fs.existsSync(path.join(dir, ".claude", "agents", "reviewer.md"));
    const off = syncEquipment(project, { skills: [], agents: [] });
    out({ before, on, skillInstalled, agentInstalled, off });
  `);
  assert.deepEqual(result.before, { skills: [], agents: [] });
  assert.deepEqual(result.on, { skills: ["house-style"], agents: ["reviewer"] });
  assert.equal(result.skillInstalled, true, "the whole pack is copied, not just SKILL.md");
  assert.equal(result.agentInstalled, true);
  assert.deepEqual(result.off, { skills: [], agents: [] });
});

test("a client's own skills are never touched by our sync", () => {
  const result = inSandbox(`
    seedLibrary();
    const dir = files.ensureProjectDir(project);
    // The client repo ships its own skill, committed by them.
    fs.mkdirSync(path.join(dir, ".claude", "skills", "clients-own"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "skills", "clients-own", "SKILL.md"), "theirs");
    syncEquipment(project, { skills: ["house-style"], agents: [] });
    const afterOn = fs.existsSync(path.join(dir, ".claude", "skills", "clients-own"));
    syncEquipment(project, { skills: [], agents: [] });
    const afterOff = fs.existsSync(path.join(dir, ".claude", "skills", "clients-own"));
    out({ afterOn, afterOff });
  `);
  assert.equal(result.afterOn, true);
  assert.equal(result.afterOff, true, "removal is library-scoped; their tooling survives");
});

test("names that are not library members are refused before anything is written", () => {
  const result = inSandbox(`
    seedLibrary();
    files.ensureProjectDir(project);
    const attempts = [];
    for (const name of ["../evil", "unknown-skill"]) {
      try { syncEquipment(project, { skills: [name], agents: [] }); attempts.push("allowed"); }
      catch (e) { attempts.push(e.message); }
    }
    const dir = files.projectDir(project);
    out({ attempts, claudeDir: fs.existsSync(path.join(dir, ".claude")) });
  `);
  assert.deepEqual(result.attempts, ["That is not in the library.", "That is not in the library."]);
  assert.equal(result.claudeDir, false, "a refused sync writes nothing");
});

test("tooling never lands in a commit: the exclude holds against add -A", () => {
  const result = inSandbox(`
    seedLibrary();
    const dir = files.ensureProjectDir(project);
    syncEquipment(project, { skills: ["house-style"], agents: ["reviewer"] });
    syncEquipment(project, { skills: ["house-style"], agents: ["reviewer"] });
    const exclude = fs.readFileSync(path.join(dir, ".git", "info", "exclude"), "utf8");
    const commit = commitAll(dir, "Should have nothing to hold");
    out({
      mentions: exclude.split("\\n").filter((l) => l === ".claude/").length,
      commit: commit.output,
    });
  `);
  assert.equal(result.mentions, 1, "appended once across two syncs");
  assert.equal(result.commit, "nothing to commit", "add -A cannot see the tooling");
});
