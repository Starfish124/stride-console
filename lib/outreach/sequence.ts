// Outreach sequences: the copy the console owns, and Linked Helper sends.
//
// The division of labour is deliberate. Linked Helper keeps the campaign shell,
// the schedule and the sending, because it is good at those and puppeting its
// wizard would be brittle. The console owns the words, because the words are
// the thing the voice gate can hold to a standard, and no off-the-shelf tool
// checks outbound copy against a brand voice.
//
// A sequence leaves here as text a founder pastes into LH2's own template
// fields. Nothing is sent from the console.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../store.ts";
import { lintMessage, LIMITS } from "./lint.ts";
import type { OutreachStepKind } from "./lint.ts";
import type { LintResult } from "../types.ts";

const FILE = path.join(DATA_DIR, "sequences.json");

export interface OutreachStep {
  id: string;
  kind: OutreachStepKind;
  /** Days to wait after the previous step. The first step is always 0. */
  waitDays: number;
  body: string;
}

export interface OutreachSequence {
  id: string;
  name: string;
  /** Who this is for, in a sentence. Sharpens the writing and the review. */
  audience: string;
  steps: OutreachStep[];
  createdAt: string;
  updatedAt: string;
}

export interface LintedStep extends OutreachStep {
  lint: LintResult;
  limit: (typeof LIMITS)[OutreachStepKind];
}

function read(): OutreachSequence[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as OutreachSequence[];
  } catch {
    return [];
  }
}

function write(all: OutreachSequence[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
  fs.renameSync(tmp, FILE);
}

export function listSequences(): OutreachSequence[] {
  return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSequence(id: string): OutreachSequence | undefined {
  return read().find((s) => s.id === id);
}

export function saveSequence(input: {
  id?: string;
  name: string;
  audience: string;
  steps: Array<Omit<OutreachStep, "id"> & { id?: string }>;
}): OutreachSequence {
  const all = read();
  const now = new Date().toISOString();
  const existing = input.id ? all.find((s) => s.id === input.id) : undefined;

  const sequence: OutreachSequence = {
    id: existing?.id ?? `seq_${crypto.randomBytes(6).toString("hex")}`,
    name: input.name.trim() || "Untitled sequence",
    audience: input.audience.trim(),
    steps: input.steps.map((step, i) => ({
      id: step.id ?? `step_${crypto.randomBytes(4).toString("hex")}`,
      kind: step.kind,
      // The opener cannot wait: it is what starts the clock.
      waitDays: i === 0 ? 0 : Math.max(0, Math.round(step.waitDays)),
      body: step.body,
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = existing ? all.map((s) => (s.id === sequence.id ? sequence : s)) : [...all, sequence];
  write(next);
  return sequence;
}

export function deleteSequence(id: string): void {
  write(read().filter((s) => s.id !== id));
}

/** Every step with its verdict attached. The first step is the cold one. */
export function lintSequence(sequence: OutreachSequence): {
  steps: LintedStep[];
  errors: number;
  warns: number;
} {
  const steps = sequence.steps.map((step, i) => ({
    ...step,
    lint: lintMessage(step.body, step.kind, { isFirstTouch: i === 0 }),
    limit: LIMITS[step.kind],
  }));
  return {
    steps,
    errors: steps.reduce((n, s) => n + s.lint.errors, 0),
    warns: steps.reduce((n, s) => n + s.lint.warns, 0),
  };
}

/**
 * The sequence as a founder needs it while filling in Linked Helper: each step
 * labelled with its type and delay, ready to paste one at a time.
 */
export function toLinkedHelperTemplate(sequence: OutreachSequence): string {
  const lines = [
    `SEQUENCE: ${sequence.name}`,
    sequence.audience ? `AUDIENCE: ${sequence.audience}` : null,
    "",
    "Paste each step into the matching action in Linked Helper.",
    "Merge fields use LH2's own {first_name} style.",
    "",
  ].filter((l): l is string => l !== null);

  sequence.steps.forEach((step, i) => {
    const wait = i === 0 ? "immediately" : `after ${step.waitDays} day${step.waitDays === 1 ? "" : "s"}`;
    lines.push(`--- STEP ${i + 1}: ${LIMITS[step.kind].label}, ${wait} ---`, step.body.trim(), "");
  });

  return lines.join("\n");
}
