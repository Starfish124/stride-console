// The knowledge graph's inputs: which machines may feed it, and the session
// notes they have fed.
//
// Devices exist so Jort's Mac can post from his own sessions without sharing
// the founders' console password. Each holds its own token, minted once and
// revocable on its own — the salesnav/bridge secret pattern, one per device.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, newId, readJson, writeJson } from "../store.ts";

const MODE = 0o600;

export const GRAPH_DIR = path.join(DATA_DIR, "graph");
export const SESSIONS_DIR = path.join(GRAPH_DIR, "sessions");

const FILES = {
  devices: path.join(DATA_DIR, "graph-devices.json"),
} as const;

export const GRAPH_FILES = FILES;

export interface GraphDevice {
  id: string; // dev_...
  label: string; // "Jort's Mac"
  token: string; // the bearer this device presents
  createdAt: string;
  lastSeenAt?: string;
  sessions: number;
}

/** What the console shows about a device. Never the token. */
export interface DeviceView {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt?: string;
  sessions: number;
  connected: boolean;
}

export function listDevices(): GraphDevice[] {
  return readJson<GraphDevice[]>(FILES.devices, []);
}

/** Built field by field, so a token can never ride out by accident. */
export function deviceViews(): DeviceView[] {
  return listDevices().map((device) => ({
    id: device.id,
    label: device.label,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    sessions: device.sessions,
    connected: Boolean(device.lastSeenAt),
  }));
}

export function addDevice(label: string): GraphDevice {
  const device: GraphDevice = {
    id: newId("dev"),
    label,
    token: crypto.randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
    sessions: 0,
  };
  writeJson(FILES.devices, [...listDevices(), device], MODE);
  return device;
}

export function removeDevice(id: string): boolean {
  const all = listDevices();
  const left = all.filter((d) => d.id !== id);
  if (left.length === all.length) return false;
  writeJson(FILES.devices, left, MODE);
  return true;
}

/**
 * The device a bearer token belongs to, compared in constant time so a
 * wrong token cannot be found one character at a time.
 */
export function deviceForToken(offered: string | null): GraphDevice | undefined {
  if (!offered) return undefined;
  const a = Buffer.from(offered);
  return listDevices().find((device) => {
    const b = Buffer.from(device.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export function markDeviceUsed(id: string): void {
  const all = listDevices();
  const i = all.findIndex((d) => d.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], lastSeenAt: new Date().toISOString(), sessions: all[i].sessions + 1 };
  writeJson(FILES.devices, all, MODE);
}

// ---------- session notes ----------

export interface SessionNote {
  name: string;
  size: number;
  at: string;
}

/**
 * Store one session's markdown. The name is built here, never taken from the
 * caller: this writes to disk on a machine the caller does not own.
 */
export function saveSessionNote(options: {
  deviceLabel: string;
  sessionId: string;
  title: string;
  markdown: string;
}): string {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const stem = `${options.deviceLabel}-${options.title}-${options.sessionId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  const file = path.join(SESSIONS_DIR, `${stem || "session"}.md`);
  fs.writeFileSync(file, options.markdown, { mode: MODE });
  return path.basename(file);
}

export function listSessionNotes(): SessionNote[] {
  try {
    return fs
      .readdirSync(SESSIONS_DIR)
      .filter((n) => n.endsWith(".md"))
      .map((name) => {
        const stat = fs.statSync(path.join(SESSIONS_DIR, name));
        return { name, size: stat.size, at: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}
