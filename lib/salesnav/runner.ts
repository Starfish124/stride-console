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
import { isTouchKind } from "../outreach/touch.ts";
import { expireStaleTouches, queueTouch } from "../outreach/queue.ts";
import { isTooLate, localDay, perTick, salesnavMode, sendWindow, withinWindow } from "./config.ts";
import { sweep } from "./enrol.ts";
import { advance, attemptSend } from "./send.ts";
import { findSend, getEnrolment, hardStop, listEnrolments, putSend, runnerState, setRunnerState } from "./store.ts";
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

/**
 * The enrolment and its sequence, for the expiry sweep.
 *
 * Expiring a touch has to move the sequence past it, or an enrolment sits on a
 * dead step forever waiting for a message nobody will ever send.
 */
function lookupEnrolment(enrolmentId: string) {
  const enrolment = getEnrolment(enrolmentId);
  if (!enrolment) return undefined;
  const sequence = getSequence(enrolment.sequenceId);
  return sequence ? { enrolment, sequence } : undefined;
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
  stopped: number;
  /** LinkedIn steps put in front of a founder this tick. */
  queued: number;
  /** LinkedIn steps already in the queue, still unsent. */
  waiting: number;
  /** Queued touches nobody got to in time. */
  expired: number;
  lines: string[];
  at: string;
}

export async function tick(now: Date = new Date()): Promise<TickResult> {
  const at = now.toISOString();
  const mode = salesnavMode();
  const base: TickResult = {
    ran: false,
    mode,
    due: 0,
    sent: 0,
    refused: 0,
    stopped: 0,
    queued: 0,
    waiting: 0,
    expired: 0,
    lines: [],
    at,
  };

  if (ticking) return { ...base, skipped: "A tick is already running." };

  const stop = hardStop();
  // Checked here as well as inside the guard, so a stop pressed mid-tick lands
  // within one send rather than at the end of the batch.
  if (stop) return { ...base, skipped: `All sending is stopped.${stop.reason ? ` ${stop.reason}` : ""}` };

  ticking = true;
  try {
    const swept = sweep();

    // Expiry runs before the window check, because a note that has gone stale
    // is stale on a Sunday too, and a founder opening the queue on Monday
    // should not be handed last week's words to send.
    const expired = expireStaleTouches(now, lookupEnrolment);

    const window = sendWindow();
    if (!withinWindow(now, window)) {
      return {
        ...base,
        ran: true,
        stopped: swept.stopped.length,
        expired: expired.length,
        lines: expired.map((t) => `expired ${t.id}: ${t.name}, ${t.problem}`),
        // The window gates when the queue is FED, not when a founder may send
        // from it. Nothing here can stop somebody sending a message by hand at
        // midnight, and the queue does not pretend otherwise.
        skipped: `Outside the sending window (${window.label}, local).`,
      };
    }

    const due = dueEnrolments(now);
    const lines: string[] = [
      ...swept.stopped.map((s) => `stopped ${s.id}: ${s.reason}`),
      ...expired.map((t) => `expired ${t.id}: ${t.name}, ${t.problem}`),
    ];
    let sent = 0;
    let refused = 0;
    let queued = 0;
    let waiting = 0;

    for (const enrolment of due.slice(0, perTick())) {
      const sequence = getSequence(enrolment.sequenceId);
      const step = sequence?.steps[enrolment.stepIndex];
      const client = getClient(enrolment.clientId);
      if (!sequence || !step || !client) {
        lines.push(`${enrolment.id}: the sequence or the client is gone`);
        continue;
      }

      // LinkedIn steps go to a founder's thumb, not down a wire.
      //
      // This used to advance straight past them with "Linked Helper's job",
      // which was true while LH2 held the licence and false the moment it did
      // not: a sequence with connect and message steps ran to completion,
      // logged nothing amiss, and sent not one thing. Queueing is the honest
      // version, and it has to happen before the too-late branch below, which
      // is email-shaped and would file a connection note as a skipped send.
      if (isTouchKind(step.kind)) {
        const attempt = queueTouch(enrolment, step, client, now);
        if (attempt.outcome === "queued") queued += 1;
        else if (attempt.outcome === "refused") refused += 1;
        // "settled" means a founder already dealt with it and the enrolment
        // has not caught up. "waiting" means it is in the queue and unsent, so
        // the enrolment deliberately stays where it is — the clock does not
        // move a sequence past a message nobody has sent yet.
        else if (attempt.outcome === "settled") advance(enrolment, sequence.steps, now);
        else waiting += 1;
        lines.push(`${enrolment.id}: ${attempt.outcome}, ${attempt.detail}`);
        continue;
      }

      // A step this far past due has lost its context. Skipping it honestly is
      // better than firing last Tuesday's opener at somebody today.
      if (isTooLate(enrolment.dueAt, now)) {
        const key = `${enrolment.id}:${step.id}`;
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
          lines.push(`${enrolment.id}: overdue, but step ${step.id} already ${already.state}`);
          continue;
        }

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
        lines.push(`${enrolment.id}: skipped, too late to be relevant`);
        continue;
      }

      const attempt = await attemptSend(enrolment, step, client, sequence.steps, now);
      if (attempt.outcome === "sent") sent += 1;
      else if (attempt.outcome !== "already-sent") refused += 1;
      lines.push(`${enrolment.id}: ${attempt.outcome}, ${attempt.detail}`);
    }

    setRunnerState({ lastTickAt: at, lastTickDay: localDay(now) });
    return {
      ran: true,
      mode,
      due: due.length,
      sent,
      refused,
      stopped: swept.stopped.length,
      queued,
      waiting,
      expired: expired.length,
      lines,
      at,
    };
  } finally {
    ticking = false;
  }
}

export { runnerState };
