// Is the engine actually running, and what has it done?
//
// Both questions used to be unanswerable from the console, and the second one
// hid the first: every page reported healthily while the sequencer had never
// ticked once, because nothing was starting the clock. A green console and a
// dead engine looked identical.
//
// So "online" here means a heartbeat, not a configuration. The clock lives in
// scripts/salesnav-runner.mjs under com.stride.salesnav and POSTs a tick every
// minute; if that stopped ten minutes ago, the engine is not running however
// correct the settings are.

import { hardStop, listEnrolments, runnerState } from "./store.ts";
import { listManualSteps } from "./manual.ts";
import { withinWindow, sendWindow } from "./config.ts";
import type { ManualStep } from "./types.ts";

/**
 * How stale a heartbeat may be before the clock counts as stopped.
 *
 * The runner ticks every 60s. Three minutes is two missed ticks: long enough
 * that a slow request or a restart does not flap the light, short enough that
 * a founder is not told everything is fine for a quarter of an hour after the
 * job died.
 */
const HEARTBEAT_GRACE_MS = 3 * 60_000;

export type EngineState = "running" | "idle" | "stopped" | "no-clock";

export interface EngineStatus {
  state: EngineState;
  /** One sentence a founder can act on. */
  detail: string;
  lastTickAt: string | null;
  /** Inside the sending window right now. */
  inWindow: boolean;
  window: string;
}

export function engineStatus(now: Date = new Date()): EngineStatus {
  const stop = hardStop();
  const lastTickAt = runnerState().lastTickAt ?? null;
  const window = sendWindow();
  const inWindow = withinWindow(now, window);
  const beat = lastTickAt ? now.getTime() - new Date(lastTickAt).getTime() : Infinity;

  // The brake first: while it is on, tick() returns before it reaches a single
  // step, so nothing else about the engine is true.
  if (stop) {
    return {
      state: "stopped",
      detail: `${stop.by} stopped it. Nothing queues until it is cleared.`,
      lastTickAt,
      inWindow,
      window: window.label,
    };
  }

  if (beat > HEARTBEAT_GRACE_MS) {
    return {
      state: "no-clock",
      detail: lastTickAt
        ? "The clock has missed its last two ticks. Check com.stride.salesnav."
        : "The clock has never run. Nothing will ever be queued until it does.",
      lastTickAt,
      inWindow,
      window: window.label,
    };
  }

  // Ticking, but outside the hours: correct, and worth saying plainly so that
  // an empty queue at nine in the evening does not read as a fault.
  if (!inWindow) {
    return {
      state: "idle",
      detail: `Ticking, but outside ${window.label}. Work resumes in the window.`,
      lastTickAt,
      inWindow,
      window: window.label,
    };
  }

  return { state: "running", detail: "Ticking, inside the sending hours.", lastTickAt, inWindow, window: window.label };
}

export interface Reach {
  /** Messages a person has actually sent. The only number LinkedIn has seen. */
  sent: number;
  /** Written and waiting on a person. */
  waiting: number;
  /** Deliberately not sent, with a reason. */
  skipped: number;
  /** People currently in a sequence. */
  active: number;
  /** People whose sequence ran to the end. */
  finished: number;
  /** People whose sequence stopped because they answered. */
  replied: number;
}

/** What the engine has done, counted from the ledger rather than a counter. */
export function reach(steps: ManualStep[] = listManualSteps()): Reach {
  const enrolments = listEnrolments();
  return {
    sent: steps.filter((m) => m.state === "done").length,
    waiting: steps.filter((m) => m.state === "waiting").length,
    skipped: steps.filter((m) => m.state === "skipped").length,
    active: enrolments.filter((e) => e.state === "active").length,
    finished: enrolments.filter((e) => e.state === "done").length,
    replied: enrolments.filter(
      (e) => e.state === "stopped" && /replied/i.test(e.stoppedReason ?? ""),
    ).length,
  };
}

/** The same counts, for one sequence, so two sequences can be compared. */
export function reachBySequence(sequenceId: string): Reach {
  return reach(listManualSteps().filter((m) => m.sequenceId === sequenceId));
}
