// One tick.
//
// The clock lives in scripts/salesnav-runner.mjs; the writing lives here. That
// split is the reason there is no locking anywhere in this module: the runner
// script sends an HTTP request, this process handles it, and this process is
// the only thing that ever writes data/. Two founders and a background job
// cannot clobber clients.json because there is only one writer.
//
// "Run now" in the console calls exactly this. The timer and the button are
// the same code path, so there is no second behaviour to debug.
//
// The cost, stated plainly: if the console is down, nothing sends. That is the
// correct failure. The runner logs it every minute and the page shows the last
// tick that worked.

import { getClient } from "../store.ts";
import { getSequence } from "../outreach/sequence.ts";
import { isTooLate, localDay, perTick, salesnavMode, sendWindow, withinWindow } from "./config.ts";
import { sweep } from "./enrol.ts";
import { expireManual, isManualKind, queueManual, waitingManualSteps } from "./manual.ts";
import { advance, attemptSend } from "./send.ts";
import { findManualStep, findSend, hardStop, listEnrolments, putSend, runnerState, setRunnerState } from "./store.ts";
import { newId } from "../store.ts";
import type { Enrolment } from "./types.ts";

export { isTooLate, withinWindow } from "./config.ts";
export { nextDueAt as scheduleNext } from "./config.ts";

/**
 * Overlap guard.
 *
 * Belt and braces rather than the only defence: the ledger claim is written
 * synchronously before the first await, so a double claim is impossible even
 * with this flag removed. It is here so a second request gets an honest 409
 * instead of queueing behind the first.
 */
let ticking = false;

export function isTicking(): boolean {
  return ticking;
}

/** Due now, oldest first, so a backlog drains in the order it built up. */
export function dueEnrolments(now: Date, all: Enrolment[] = listEnrolments()): Enrolment[] {
  return all
    .filter((e) => e.state === "active" && new Date(e.dueAt).getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export interface TickResult {
  ran: boolean;
  /** Why nothing happened, when nothing happened. */
  skipped?: string;
  mode: "dry" | "live";
  due: number;
  sent: number;
  refused: number;
  /**
   * LinkedIn steps sitting in the queue when the tick finished.
   *
   * The depth of the queue, not what this tick added to it — a re-tick that
   * finds everything already queued still reports the work outstanding, which
   * is the number anybody reading this actually wants.
   */
  waiting: number;
  /** Steps the runner declined to queue — capped, too long, missing a field. */
  held: number;
  stopped: number;
  lines: string[];
  at: string;
}

export async function tick(now: Date = new Date()): Promise<TickResult> {
  const at = now.toISOString();
  const mode = salesnavMode();
  const base: TickResult = { ran: false, mode, due: 0, sent: 0, refused: 0, waiting: 0, held: 0, stopped: 0, lines: [], at };

  if (ticking) return { ...base, skipped: "A tick is already running." };

  const stop = hardStop();
  // Checked here as well as inside the guard, so a stop pressed mid-tick lands
  // within one send rather than at the end of the batch.
  if (stop) return { ...base, skipped: `All sending is stopped.${stop.reason ? ` ${stop.reason}` : ""}` };

  ticking = true;
  try {
    const swept = sweep();
    const window = sendWindow();
    if (!withinWindow(now, window)) {
      return {
        ...base,
        ran: true,
        stopped: swept.stopped.length,
        skipped: `Outside the sending window (${window.label}, local).`,
      };
    }

    const due = dueEnrolments(now);
    const lines: string[] = swept.stopped.map((s) => `stopped ${s.id}: ${s.reason}`);
    let sent = 0;
    let refused = 0;
    let held = 0;

    // The allowance counts WORK, not rows looked at.
    //
    // A held step keeps its dueAt, so it sits at the front of the due list for
    // ever. Slicing the first perTick meant the same three rows were re-offered
    // every tick and the queue could never grow past three, however many people
    // were enrolled behind them. Finding a row already in the queue costs a
    // lookup and does nothing, so it does not spend the allowance — but it is
    // still walked, because a queued step that has gone stale still has to face
    // the too-late rule.
    let worked = 0;
    for (const enrolment of due) {
      if (worked >= perTick()) break;
      const sequence = getSequence(enrolment.sequenceId);
      const step = sequence?.steps[enrolment.stepIndex];
      const client = getClient(enrolment.clientId);
      if (!sequence || !step || !client) {
        lines.push(`${enrolment.id}: the sequence or the client is gone`);
        continue;
      }

      // A step this far past due has lost its context. Skipping it honestly is
      // better than firing last Tuesday's opener at somebody today.
      if (isTooLate(enrolment.dueAt, now)) {
        const key = `${enrolment.id}:${step.id}`;

        // A LinkedIn step that was never queued is not too late — it was never
        // put in front of anybody. Held steps keep their original dueAt, so a
        // cap doing its job ages one day per day and would land here on the
        // fourth, skip a connection request nobody ever saw, and advance to a
        // follow-up written as though the handshake had happened. That is the
        // "it looks like outreach happened" failure this queue exists to stop.
        // It holds instead, and shows up in held rather than silently moving.
        if (isManualKind(step.kind) && !findManualStep(key)) {
          held += 1;
          worked += 1;
          lines.push(`${enrolment.id}: ${step.kind} overdue but never queued, still holding`);
          continue;
        }

        const already = findSend(key);

        // Unless it already went. A send that completed in the gap before the
        // enrolment advanced leaves a finished row and a stale dueAt, so this
        // branch fires next tick on a step that really did reach somebody.
        // Overwriting it replaced a live send with a dry run that never
        // happened, dropped the provider's id, and stored the unmerged
        // template instead of the words that arrived. "Why did you email this
        // person in March" has to be answerable from the ledger alone.
        if (already && already.state !== "skipped") {
          advance(enrolment, sequence.steps, now);
          worked += 1;
          lines.push(`${enrolment.id}: overdue, but step ${step.id} already ${already.state}`);
          continue;
        }

        // A queued LinkedIn step nobody got to is settled with the same
        // verdict, or it sits in the queue for good.
        expireManual(key, "too late to be relevant", now);

        putSend({
          key,
          id: already?.id ?? newId("snd"),
          enrolmentId: enrolment.id,
          clientId: enrolment.clientId,
          sequenceId: enrolment.sequenceId,
          stepId: step.id,
          to: enrolment.email,
          subject: step.subject ?? "",
          body: step.body,
          state: "skipped",
          dryRun: true,
          provider: "dry",
          problem: "too late to be relevant",
          basis: enrolment.basis,
          claimedAt: at,
          finishedAt: at,
          attempts: 0,
        });
        advance(enrolment, sequence.steps, now);
        refused += 1;
        worked += 1;
        lines.push(`${enrolment.id}: skipped, too late to be relevant`);
        continue;
      }

      if (step.kind !== "email") {
        // A LinkedIn step is sent by a person, so it HOLDS here. Advancing past
        // it — which this did while Linked Helper owned those steps — runs a
        // mixed sequence to completion having sent nothing on LinkedIn and
        // reports it finished. The enrolment stays put until somebody works it
        // off the queue on /salesnav.
        const queued = queueManual(enrolment, step, client, now);
        // Already there: nothing happened, so nothing is spent and the tick
        // walks on to somebody who has not been written to yet.
        if (queued.state === "waiting" && !queued.queued) continue;
        if (queued.state === "held") held += 1;
        worked += 1;
        lines.push(
          queued.state === "waiting"
            ? `${enrolment.id}: ${step.kind} waiting for a founder to send`
            : `${enrolment.id}: ${step.kind} held, ${queued.problem}`,
        );
        continue;
      }

      worked += 1;
      const attempt = await attemptSend(enrolment, step, client, sequence.steps, now);
      if (attempt.outcome === "sent") sent += 1;
      else if (attempt.outcome !== "already-sent") refused += 1;
      lines.push(`${enrolment.id}: ${attempt.outcome}, ${attempt.detail}`);
    }

    const waiting = waitingManualSteps().length;
    setRunnerState({ lastTickAt: at, lastTickDay: localDay(now) });
    return { ran: true, mode, due: due.length, sent, refused, waiting, held, stopped: swept.stopped.length, lines, at };
  } finally {
    ticking = false;
  }
}

export { runnerState };
