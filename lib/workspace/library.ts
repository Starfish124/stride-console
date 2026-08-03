// The tooling library: skill packs and agent definitions that equip a
// project, so no client job starts from scratch.
//
// Claude Code discovers `.claude/skills/` and `.claude/agents/` in its cwd,
// and runs already execute inside the project directory — so equipping is
// nothing more than installing files there. The library itself lives in the
// repo at ./library (versioned, unlike the workspaces root), and grows by
// dropping a skill folder in.

import fs from "node:fs";
import path from "node:path";
import { ensureProjectDir, projectDir } from "./files.ts";
import type { Project } from "./types.ts";

export const LIBRARY_ROOT: string =
  process.env.STRIDE_LIBRARY ?? path.join(process.cwd(), "library");

export interface LibraryItem {
  name: string;
  kind: "skill" | "agent";
  description: string;
}

export interface Equipped {
  skills: string[];
  agents: string[];
}

/**
 * The frontmatter description, for the card. Real packs write it both ways:
 * inline, and as a YAML folded block (`description: >-`) whose text lives on
 * the indented lines below. Taking the rest of the line would print ">-".
 */
function readDescription(file: string): string {
  try {
    const raw = fs.readFileSync(file, "utf8").slice(0, 4000);
    const lines = raw.split("\n");
    const start = lines.findIndex((l) => /^description:/.test(l));
    if (start < 0) return "";
    const inline = lines[start].replace(/^description:\s*/, "").trim();
    if (inline && !/^[>|][-+]?$/.test(inline)) return inline.slice(0, 200);
    const folded: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!/^\s+\S/.test(line)) break; // the block ends at the first unindented line
      folded.push(line.trim());
    }
    return folded.join(" ").slice(0, 200);
  } catch {
    return "";
  }
}

export function listLibrary(): LibraryItem[] {
  const items: LibraryItem[] = [];
  try {
    for (const entry of fs.readdirSync(path.join(LIBRARY_ROOT, "skills"), {
      withFileTypes: true,
    })) {
      const skillFile = path.join(LIBRARY_ROOT, "skills", entry.name, "SKILL.md");
      if (entry.isDirectory() && fs.existsSync(skillFile)) {
        items.push({ name: entry.name, kind: "skill", description: readDescription(skillFile) });
      }
    }
  } catch {
    // No skills dir — an empty library is a real answer.
  }
  try {
    for (const entry of fs.readdirSync(path.join(LIBRARY_ROOT, "agents"), {
      withFileTypes: true,
    })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        items.push({
          name: entry.name.replace(/\.md$/, ""),
          kind: "agent",
          description: readDescription(path.join(LIBRARY_ROOT, "agents", entry.name)),
        });
      }
    }
  } catch {
    // Same.
  }
  return items;
}

/** What is installed in the project right now, read from disk — no record to drift. */
export function equipped(project: Project): Equipped {
  const dir = projectDir(project);
  const skills: string[] = [];
  const agents: string[] = [];
  try {
    for (const entry of fs.readdirSync(path.join(dir, ".claude", "skills"), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) skills.push(entry.name);
    }
  } catch {
    // Not equipped with anything.
  }
  try {
    for (const entry of fs.readdirSync(path.join(dir, ".claude", "agents"), {
      withFileTypes: true,
    })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        agents.push(entry.name.replace(/\.md$/, ""));
      }
    }
  } catch {
    // Same.
  }
  return { skills, agents };
}

/**
 * Keep the project's tooling out of its git history: `.claude/` goes in
 * `.git/info/exclude` — local to this clone, never committed, so it can
 * never reach a client's repo, and commitAll's `add -A` respects it.
 * Idempotent.
 */
function ensureExcluded(dir: string): void {
  const file = path.join(dir, ".git", "info", "exclude");
  try {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!current.split("\n").includes(".claude/")) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, (current.endsWith("\n") || !current ? "" : "\n") + ".claude/\n");
    }
  } catch {
    // A project dir without .git cannot leak tooling into a commit anyway.
  }
}

/**
 * Make the project's installed tooling match `want`.
 *
 * Installs are rm+copy, so re-equipping refreshes to the library's current
 * pack. Removals are LIBRARY-SCOPED: only names that exist in the library
 * are ever removed, so a client repo's own committed skills are never
 * touched by us.
 */
export function syncEquipment(project: Project, want: Equipped): Equipped {
  const dir = ensureProjectDir(project);
  const library = listLibrary();
  const libSkills = new Set(library.filter((i) => i.kind === "skill").map((i) => i.name));
  const libAgents = new Set(library.filter((i) => i.kind === "agent").map((i) => i.name));

  for (const name of [...want.skills, ...want.agents]) {
    // Names join into paths; only library members may be asked for.
    if (!/^[\w.-]+$/.test(name) || !(libSkills.has(name) || libAgents.has(name))) {
      throw new Error("That is not in the library.");
    }
  }

  const now = equipped(project);

  for (const name of want.skills) {
    const dest = path.join(dir, ".claude", "skills", name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(LIBRARY_ROOT, "skills", name), dest, { recursive: true });
  }
  for (const name of want.agents) {
    const dest = path.join(dir, ".claude", "agents", `${name}.md`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(LIBRARY_ROOT, "agents", `${name}.md`), dest);
  }

  for (const name of now.skills) {
    if (libSkills.has(name) && !want.skills.includes(name)) {
      fs.rmSync(path.join(dir, ".claude", "skills", name), { recursive: true, force: true });
    }
  }
  for (const name of now.agents) {
    if (libAgents.has(name) && !want.agents.includes(name)) {
      fs.rmSync(path.join(dir, ".claude", "agents", `${name}.md`), { force: true });
    }
  }

  ensureExcluded(dir);
  return equipped(project);
}
