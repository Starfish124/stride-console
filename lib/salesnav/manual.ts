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
import { linkedinDailyCap, linkedinQueueCap, localDay } from "./config.ts";
import { resolveMerge } from "./merge.ts";
import { withdraw } from "./enrol.ts";
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
 * What a person actually sent today, from the ledger rather than a counter.
 *
 * Only "done" counts, and it is bucketed on finishedAt — the moment somebody
 * said they sent it, not the moment the console printed it. A waiting row is a
 * draft LinkedIn has never seen, so counting it would cap this console's
 * output instead of the account's exposure, and would stall the queue for a
 * whole day every time nobody got round to working it.
 */
export function sentLinkedInToday(now: Date): number {
  const day = localDay(now);
  let total = 0;
  for (const manual of listManualSteps()) {
    if (manual.state !== "done" || !manual.finishedAt) continue;
    if (localDay(new Date(manual.finishedAt)) === day) total += 1;
  }
  return total;
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

  // Lint ran on the template, against a placeholder company. It cannot know
  // that "MAAT | Transport | Techniek | Heftrucks | Logistiek | Truckparq 24/7"
  // is a real name in this book, and that a note passing at 280 characters
  // merges to 340. LinkedIn refuses it; a founder finds out after pasting.
  const body = merged.text.trim();
  const limit = LIMITS[step.kind];
  if (body.length > limit.hard) {
    return {
      state: "held",
      problem: `${body.length} characters once merged for ${client.company}; a ${limit.label} takes ${limit.hard}. Shorten the step.`,
    };
  }

  // Queue depth, then the day cap. Both hold rather than skip, so nothing is
  // lost — the step is offered again on the next tick that has room.
  const waitingNow = listManualSteps().filter((m) => m.state === "waiting").length;
  if (waitingNow >= linkedinQueueCap()) {
    return { state: "held", problem: `${waitingNow} already waiting to be sent. Work the queue down first.` };
  }

  const cap = linkedinDailyCap();
  const already = sentLinkedInToday(now);
  if (already >= cap) {
    return { state: "held", problem: `${already} LinkedIn actions sent today, which is the cap. This goes tomorrow.` };
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
    body,
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

/**
 * They answered on LinkedIn, so the whole sequence stops.
 *
 * Not skip-then-advance. Skipping moves the enrolment to the next step with a
 * fresh dueAt and leaves sweep to catch it a tick later; withdrawing stops it
 * here, and does not depend on hasReplied matching a name — which it does
 * globally across every reply ever received, and two Jan de Vries in a Dutch
 * book of 148 is not a stretch.
 */
export function repliedManual(key: string, by: string, now: Date = new Date()): ManualStep | undefined {
  const manual = findManualStep(key);
  if (!manual || manual.state !== "waiting") return undefined;

  const next: ManualStep = {
    ...manual,
    state: "skipped",
    problem: "They replied.",
    finishedAt: now.toISOString(),
    finishedBy: by,
  };
  putManualStep(next);
  withdraw(manual.enrolmentId, "They replied on LinkedIn.");
  addTouch(manual.clientId, {
    note: `Replied on LinkedIn. The sequence stopped.`,
    who: by,
    at: now.toISOString(),
  });
  return next;
}

/** The runner's too-late rule reaching a step nobody got to. */
export function expireManual(key: string, reason: string, now: Date = new Date()): void {
  const manual = findManualStep(key);
  if (!manual || manual.state !== "waiting") return;
  putManualStep({ ...manual, state: "skipped", problem: reason, finishedAt: now.toISOString(), finishedBy: "runner" });
}

export { listManualSteps };
