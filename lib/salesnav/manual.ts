// The LinkedIn steps, queued for a human instead of sent by a machine.
//
// This is the whole of the LinkedIn actuator, and it is deliberately not one.
// LinkedIn's User Agreement forbids automated access; a driver that clicks
// Connect gets the founder's own account restricted, and the Sales Navigator
// seat hangs off that account. So the console does the part it is good at —
// deciding who, when and in what words — and a founder does the ten seconds
// nobody may automate.
//
// The important property is that a LinkedIn step now HOLDS. Before this file
// the runner advanced past it, so a mixed sequence ran to completion having
// sent nothing on LinkedIn and reported itself finished. A step waits here
// until somebody marks it done or skips it, and only then does the enrolment
// move on.

import { addTouch, newId } from "../store.ts";
import type { Client } from "../types.ts";
import { getSequence } from "../outreach/sequence.ts";
import type { OutreachStep } from "../outreach/sequence.ts";
import { LIMITS } from "../outreach/lint.ts";
import { resolveMerge } from "./merge.ts";
import { advance } from "./send.ts";
import { findManualStep, getEnrolment, listManualSteps, putManualStep } from "./store.ts";
import type { Enrolment, ManualStep } from "./types.ts";

export type QueueOutcome =
  /** Queued, or already queued and still waiting. */
  | { state: "waiting"; manual: ManualStep; queued: boolean }
  /** Not queued, and the enrolment stays put so a fix takes effect next tick. */
  | { state: "held"; problem: string };

export function isManualKind(kind: OutreachStep["kind"]): kind is ManualStep["kind"] {
  return kind === "connect" || kind === "message" || kind === "inmail";
}

/**
 * Put one due LinkedIn step in front of a founder.
 *
 * An unresolved merge field holds rather than queues. "Hi {first_name}," is
 * the classic disaster of this category, and a founder copying a queued line
 * is exactly as capable of pasting it into a stranger's inbox as a sender is.
 * Holding leaves the enrolment where it is, so correcting the client record
 * makes the step queue on the next tick with nothing lost.
 */
export function queueManual(
  enrolment: Enrolment,
  step: OutreachStep,
  client: Client,
  now: Date = new Date(),
): QueueOutcome {
  if (!isManualKind(step.kind)) return { state: "held", problem: `${step.kind} is not a LinkedIn step.` };

  const key = `${enrolment.id}:${step.id}`;
  const existing = findManualStep(key);
  if (existing && existing.state === "waiting") return { state: "waiting", manual: existing, queued: false };
  if (existing) return { state: "held", problem: `Already ${existing.state}.` };

  const merged = resolveMerge(step.body, client);
  if (merged.missing.length) {
    return {
      state: "held",
      problem: `${client.name} has no ${merged.missing.join(", ")}. Fill it in and this queues itself.`,
    };
  }

  const manual: ManualStep = {
    key,
    id: newId("man"),
    enrolmentId: enrolment.id,
    clientId: enrolment.clientId,
    sequenceId: enrolment.sequenceId,
    stepId: step.id,
    kind: step.kind,
    profileUrl: client.linkedin?.trim() || undefined,
    body: merged.text.trim(),
    state: "waiting",
    basis: enrolment.basis,
    dueAt: enrolment.dueAt,
    createdAt: now.toISOString(),
  };
  putManualStep(manual);
  return { state: "waiting", manual, queued: true };
}

/** Oldest due first, so a backlog is worked in the order it built up. */
export function waitingManualSteps(): ManualStep[] {
  return listManualSteps()
    .filter((m) => m.state === "waiting")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

function settle(
  key: string,
  patch: Pick<ManualStep, "state"> & Partial<ManualStep>,
  by: string,
  now: Date,
): ManualStep | undefined {
  const manual = findManualStep(key);
  if (!manual || manual.state !== "waiting") return undefined;

  const next: ManualStep = {
    ...manual,
    ...patch,
    finishedAt: now.toISOString(),
    finishedBy: by,
  };
  putManualStep(next);

  // The enrolment only moves once a person says what happened. A missing
  // enrolment or sequence leaves the row settled and nothing to advance, which
  // is the honest end state rather than an error nobody can act on.
  const enrolment = getEnrolment(manual.enrolmentId);
  const sequence = enrolment ? getSequence(enrolment.sequenceId) : undefined;
  if (enrolment && sequence) advance(enrolment, sequence.steps, now);
  return next;
}

/** They sent it. Logged on the client too, so the person's page tells the truth. */
export function completeManual(key: string, by: string, now: Date = new Date()): ManualStep | undefined {
  const done = settle(key, { state: "done" }, by, now);
  if (done) {
    addTouch(done.clientId, {
      note: `LinkedIn ${LIMITS[done.kind].label} sent by hand.`,
      who: by,
      at: now.toISOString(),
    });
  }
  return done;
}

export function skipManual(
  key: string,
  by: string,
  reason: string,
  now: Date = new Date(),
): ManualStep | undefined {
  return settle(key, { state: "skipped", problem: reason.trim() || "Skipped." }, by, now);
}

/** The runner's too-late rule reaching a step nobody got to. */
export function expireManual(key: string, reason: string, now: Date = new Date()): void {
  const manual = findManualStep(key);
  if (!manual || manual.state !== "waiting") return;
  putManualStep({ ...manual, state: "skipped", problem: reason, finishedAt: now.toISOString(), finishedBy: "runner" });
}

export { listManualSteps };
