// The lab: throwaway sandboxes for experiments, each a lightweight Linux VM
// via Apple's `container` CLI (brew install container, macOS 26+).
//
// The point is isolation. An experimental system runs INSIDE the VM with its
// working directory bind-mounted from ~/stride-lab/<id>, so the live console,
// the launchd jobs and the shared repos are untouchable from in there.
// Destroy = the VM and the folder gone; git inside the folder is the undo.
//
// Files stay editable from the Mac side, so a Claude run on a lab folder
// works exactly like a workspace run — point a workspace project at the
// folder if an agent should work in it.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR, newId, readJson, writeJson } from "../store.ts";

const MODE = 0o600;
const FILE = path.join(DATA_DIR, "lab.json");

/** Outside the repo, same rule as the workspaces root. */
export const LAB_ROOT =
  process.env.STRIDE_LAB ?? path.join(os.homedir(), "stride-lab");

// A sandbox is an experiment, not a service: cap what it can take from a
// 16GB machine that also runs the console and a 6GB model.
const MEMORY = "2048M";
const CPUS = "2";

export interface Sandbox {
  id: string;
  name: string;
  image: string;
  /** Host port mapped straight through to the same guest port, if any. */
  port?: number;
  createdAt: string;
  by?: string;
}

export interface SandboxView extends Sandbox {
  dir: string;
  running: boolean;
  /** The line to paste for a shell inside. */
  shell: string;
}

export function listSandboxes(): Sandbox[] {
  return readJson<Sandbox[]>(FILE, []);
}

function put(list: Sandbox[]): void {
  writeJson(FILE, list, MODE);
}

function containerName(id: string): string {
  return `lab-${id}`;
}

function sandboxDir(id: string): string {
  // Ids come from newId(), but assert anyway: this joins into a path.
  if (!/^[\w-]+$/.test(id)) throw new Error("Bad sandbox id.");
  return path.join(LAB_ROOT, id);
}

/** Image refs like "alpine:latest" or "ghcr.io/org/img:tag" — nothing shell-ish. */
export function validImage(image: string): boolean {
  return /^[\w.\-/]+(:[\w.\-]+)?$/.test(image) && image.length <= 200;
}

export function validPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

// The launchd console runs with the bare system PATH, which does not include
// homebrew. Absolute first, PATH as the fallback for dev shells.
const CONTAINER_BIN = fs.existsSync("/opt/homebrew/bin/container")
  ? "/opt/homebrew/bin/container"
  : "container";

function cli(args: string[]): { ok: boolean; out: string } {
  const result = spawnSync(CONTAINER_BIN, args, { encoding: "utf8", timeout: 120_000 });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, out };
}

/** Which lab containers are up right now, straight from the CLI. */
export function runningNames(): Set<string> {
  const { ok, out } = cli(["ls", "--format", "json"]);
  if (!ok) return new Set();
  return parseRunning(out);
}

/** Pure: the running container names out of `container ls --format json`. */
export function parseRunning(json: string): Set<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const names = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    // Measured shape (container 1.2.2): status is an object, state inside it.
    const status = o.status as Record<string, unknown> | undefined;
    const state = typeof status?.state === "string" ? status.state : o.status;
    if (id && state === "running") names.add(id);
  }
  return names;
}

export function sandboxViews(): SandboxView[] {
  const running = runningNames();
  return listSandboxes().map((s) => ({
    ...s,
    dir: sandboxDir(s.id),
    running: running.has(containerName(s.id)),
    shell: `container exec -it ${containerName(s.id)} sh`,
  }));
}

export interface CreateResult {
  ok: boolean;
  sandbox?: Sandbox;
  problem?: string;
}

/**
 * A new sandbox: a folder, then a VM idling with that folder mounted at
 * /work. The first create of an image pulls it, so allow for a slow start.
 */
export function createSandbox(input: {
  name: string;
  image: string;
  port?: number;
  by?: string;
}): CreateResult {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, problem: "A sandbox needs a name." };
  if (!validImage(input.image)) return { ok: false, problem: "That image ref does not look right." };
  if (input.port !== undefined && !validPort(input.port)) {
    return { ok: false, problem: "Port must be 1024–65535." };
  }

  const sandbox: Sandbox = {
    id: newId("lab"),
    name,
    image: input.image,
    port: input.port,
    createdAt: new Date().toISOString(),
    by: input.by,
  };
  const dir = sandboxDir(sandbox.id);
  fs.mkdirSync(dir, { recursive: true });

  const args = [
    "run",
    "--detach",
    "--name",
    containerName(sandbox.id),
    "--volume",
    `${dir}:/work`,
    "--workdir",
    "/work",
    "--memory",
    MEMORY,
    "--cpus",
    CPUS,
  ];
  // Measured: a bare host:container spec never answers on this Mac; the
  // explicit loopback IP is what makes localhost:<port> work. Loopback only
  // on purpose — an experiment has no business on the LAN.
  if (sandbox.port) args.push("--publish", `127.0.0.1:${sandbox.port}:${sandbox.port}`);
  args.push(sandbox.image, "sleep", "infinity");

  const { ok, out } = cli(args);
  if (!ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: false, problem: out.slice(-400) || "container run failed." };
  }
  put([sandbox, ...listSandboxes()]);
  return { ok: true, sandbox };
}

/** The VM and the folder, gone. The record goes last so a half-destroy stays visible. */
export function destroySandbox(id: string): { ok: boolean; problem?: string } {
  const sandbox = listSandboxes().find((s) => s.id === id);
  if (!sandbox) return { ok: false, problem: "No such sandbox." };
  cli(["stop", containerName(id)]);
  cli(["delete", containerName(id)]);
  fs.rmSync(sandboxDir(id), { recursive: true, force: true });
  put(listSandboxes().filter((s) => s.id !== id));
  return { ok: true };
}
