// The prototyping registry: what exists on this machine, and what each
// prototype needs before it can advance. Seeded with the trend engine's five
// measured gaps — measured, not guessed; every one is editable.

import os from "node:os";
import path from "node:path";
import { DATA_DIR, readJson, writeJson, newId } from "../store.ts";

export interface PrototypeNeed {
  id: string;
  label: string;
  done: boolean;
}

export interface Prototype {
  id: string;
  name: string;
  dir?: string;
  repo?: string; // owner/name on GitHub
  note?: string;
  needs: PrototypeNeed[];
  createdAt: string;
  updatedAt: string;
}

const FILE = () => path.join(DATA_DIR, "build-prototypes.json");
const MODE = 0o600;

function need(label: string): PrototypeNeed {
  return { id: newId("need"), label, done: false };
}

function seed(): Prototype[] {
  const now = new Date().toISOString();
  return [
    {
      id: newId("proto"),
      name: "Durabo trend engine",
      dir: path.join(os.homedir(), "durabo-trend-engine"),
      repo: "Starfish124/durabo-trend-engine",
      note:
        "Toy trend prediction: TikTok collector, Thompson-sampling source allocator, " +
        "CLIP visual clustering, local insights. Runs 4×/day via launchd.",
      needs: [
        need("Reddit OAuth creds — nu RSS-fallback: alleen volume, 429s"),
        need("Forecast sanity clamp — growth_ratio 5675× en verlopen piekdata halen de feed"),
        need("Gelabelde breakout-dataset — RandomForest slaapt, geen 'hadden we labubu gezien'-backtest"),
        need("dashboard.py als service met auth (draait nu alleen handmatig)"),
        need("Entity-extractie is een substring-watchlist — LLM-pass uitgesteld"),
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function listPrototypes(): Prototype[] {
  const existing = readJson<Prototype[] | null>(FILE(), null);
  if (existing) return existing;
  const seeded = seed();
  writeJson(FILE(), seeded, MODE);
  return seeded;
}

function save(items: Prototype[]): void {
  writeJson(FILE(), items, MODE);
}

export function addPrototype(input: {
  name: string;
  dir?: string;
  repo?: string;
  note?: string;
}): Prototype {
  const items = listPrototypes();
  const now = new Date().toISOString();
  const p: Prototype = {
    id: newId("proto"),
    name: input.name.trim(),
    dir: input.dir || undefined,
    repo: input.repo || undefined,
    note: input.note || undefined,
    needs: [],
    createdAt: now,
    updatedAt: now,
  };
  items.push(p);
  save(items);
  return p;
}

export function tickNeed(id: string, needId: string, done: boolean): Prototype | undefined {
  const items = listPrototypes();
  const p = items.find((x) => x.id === id);
  if (!p) return undefined;
  const n = p.needs.find((x) => x.id === needId);
  if (!n) return undefined;
  n.done = done;
  p.updatedAt = new Date().toISOString();
  save(items);
  return p;
}

export function addNeed(id: string, label: string): Prototype | undefined {
  const items = listPrototypes();
  const p = items.find((x) => x.id === id);
  if (!p) return undefined;
  p.needs.push(need(label.trim()));
  p.updatedAt = new Date().toISOString();
  save(items);
  return p;
}

export function removePrototype(id: string): boolean {
  const items = listPrototypes();
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return false;
  save(next);
  return true;
}
