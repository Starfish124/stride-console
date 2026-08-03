// The workspace filesystem: the traversal guard, uploads, and the rule that
// every project directory is a git repo so every change is a diff.

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
import { execFileSync } from "node:child_process";
import * as files from ${mod("lib/workspace/files.ts")};

const project = { id: "proj_t", clientId: "cl_t", name: "T", kind: "files", createdAt: "x", updatedAt: "x" };
const out = (value) => console.log(JSON.stringify(value));
`;

/**
 * cwd in a temp dir AND the workspaces root pointed inside it, so no test
 * can ever touch ~/stride-workspaces.
 */
function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-wsfiles-"));
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
          // Commits in the sandbox must not depend on the machine's git identity.
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

test("safeJoin accepts real paths and refuses escapes", () => {
  const result = inSandbox(`
    const root = files.ensureProjectDir(project);
    const ok = [];
    const refused = [];
    const attempts = ["a/b.txt", "has space.txt", "deep/er/still.md"];
    const attacks = ["../x", "a/../../x", "/etc/passwd", "a\\\\b", "a//b", ".", ".."];
    for (const p of attempts) { try { files.safeJoin(root, p); ok.push(p); } catch { refused.push(p); } }
    for (const p of attacks) { try { files.safeJoin(root, p); ok.push(p); } catch { refused.push(p); } }
    out({ ok, refused });
  `);
  assert.deepEqual(result.ok, ["a/b.txt", "has space.txt", "deep/er/still.md"]);
  assert.equal(result.refused.length, 7, "every escape attempt is refused");
});

test("a project dir is born a git repo, and uploads become commits", () => {
  const result = inSandbox(`
    const root = files.ensureProjectDir(project);
    files.saveFile(project, "src/index.js", new TextEncoder().encode("hello"));
    const commit = (await import(${mod("lib/workspace/git.ts")})).commitAll(root, "Files dropped");
    const log = execFileSync("git", ["log", "--oneline"], { cwd: root, encoding: "utf8" });
    out({ isRepo: fs.existsSync(path.join(root, ".git")), commitOk: commit.ok, log });
  `);
  assert.equal(result.isRepo, true);
  assert.equal(result.commitOk, true);
  assert.ok(result.log.includes("Files dropped"), "the drop is a commit with a message");
});

test("listDir hides .git, sorts dirs first, and reads one level only", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    files.saveFile(project, "zeta.txt", new TextEncoder().encode("z"));
    files.saveFile(project, "alpha/inner.txt", new TextEncoder().encode("a"));
    out({ top: files.listDir(project).map((e) => e.name), inner: files.listDir(project, "alpha").map((e) => e.name) });
  `);
  assert.deepEqual(result.top, ["alpha", "zeta.txt"], "dirs first, no .git");
  assert.deepEqual(result.inner, ["inner.txt"]);
});

test("preview caps what it reads and delete is recursive", () => {
  const result = inSandbox(`
    files.ensureProjectDir(project);
    files.saveFile(project, "big.txt", new TextEncoder().encode("x".repeat(500)));
    files.saveFile(project, "gone/deep/file.txt", new TextEncoder().encode("bye"));
    files.removePath(project, "gone");
    out({ preview: files.readTextFile(project, "big.txt", 100).length, left: files.listDir(project).map((e) => e.name) });
  `);
  assert.equal(result.preview, 100);
  assert.deepEqual(result.left, ["big.txt"]);
});
