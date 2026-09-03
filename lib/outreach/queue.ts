// The chokepoint for anything that reaches a person on LinkedIn.
//
// Same shape as lib/salesnav/guard.ts, and for the same reason: every promise
// this channel makes is enforced in one function, first refusal wins, and
// nothing writes a Touch without coming through it. The order is deliberate —
// the stop switch outranks the profile, the profile outranks the list, and the
// voice gate is last because it is the only rule that needs the finished text.
//
// What is different from email, and worth saying plainly:
//
// The caps here do not control what actually happens. A founder can send forty
// invitations by hand this afternoon and nothing in this file can stop them.
// What the caps control is how fast the queue is *fed*, which is the only lever
// the console has. The real number — invitations actually marked sent in the
// last seven days — is on the queue and in the attention list, because the
// thing that gets an account restricted is what LinkedIn saw, not what we
// queued.

import { addTouch, newId } from "../store.ts";
import type { Client } from "../types.ts";
import { advance } from "../salesnav/enrol.ts";
import { hardStop, updateEnrolment } from "../salesnav/store.ts";
import { resolveMerge } from "../salesnav/merge.ts";
import {
  isSuppressed,
  isSuppressedProfile,
  normaliseAddress,
  normaliseProfileUrl,
} from "../salesnav/suppress.ts";
import type { Enrolment } from "../salesnav/types.ts";
import type { OutreachSequence, OutreachStep } from "./sequence.ts";
import { LIMITS, lintMessage } from "./lint.ts";
import {
  expireDays,
  findTouch,
  invitesPerDay,
  invitesPerWeek,
  isTouchKind,
  listTouches,
  messagesPerDay,
  putTouch,
  type Touch,
  type TouchKind,
} from "./touch.ts";

export type QueueVerdict =
  | { ok: true }
  | { ok: false; refusal: string; fatal: boolean };

/** Anything still wearing braces after the merge ran. */
function unresolvedFields(text: string): string[] {
  return [...new Set((text.match(/\{[a-z_]+\}/gi) ?? []).map((f) => f.slice(1, -1).toLowerCase()))];
}

/**
 * What this account has committed to on LinkedIn, in a window.
 *
 * `done` counts because it was sent. `pending` counts because it is a message
 * a founder has been handed and will send — not counting it would let the
 * runner queue a hundred invitations against a cap of fifteen and call the cap
 * respected. `skipped` and `expired` do not count, so a slot a founder passed
 * on comes back.
 *
 * A pending touch is dated by when it was queued and a done one by when it was
 * sent, which means a touch queued on Monday and sent on Wednesday is counted
 * on Monday until it settles. That is a known softness in the accounting and it
 * errs toward queueing less, which is the safe direction.
 */
export function committed(
  kinds: TouchKind[],
  since: Date,
  now: Date,
  touches: Touch[] = listTouches(),
): number {
  const from = since.getTime();
  const to = now.getTime();
  return touches.filter((t) => {
    if (!kinds.includes(t.kind)) return false;
    if (t.state !== "done" && t.state !== "pending") return false;
    const at = new Date(t.state === "done" ? (t.finishedAt ?? t.queuedAt) : t.queuedAt).getTime();
    return Number.isFinite(at) && at >= from && at <= to;
  }).length;
}

/** Invitations actually marked sent in the last seven days. The real number. */
export function invitesSentThisWeek(now: Date = new Date(), touches: Touch[] = listTouches()): number {
  const from = now.getTime() - 7 * 86_400_000;
  return touches.filter(
    (t) =>
      t.kind === "connect" &&
      t.state === "done" &&
      new Date(t.finishedAt ?? t.queuedAt).getTime() >= from,
  ).length;
}

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

export interface QueueCounts {
  invitesToday: number;
  invitesThisWeek: number;
  messagesToday: number;
  invitesPerDay: number;
  invitesPerWeek: number;
  messagesPerDay: number;
  /** Sent, not queued. What LinkedIn actually saw. */
  invitesSentThisWeek: number;
}

export function queueCounts(now: Date = new Date()): QueueCounts {
  const touches = listTouches();
  const week = new Date(now.getTime() - 7 * 86_400_000);
  return {
    invitesToday: committed(["connect"], startOfDay(now), now, touches),
    invitesThisWeek: committed(["connect"], week, now, touches),
    messagesToday: committed(["message", "inmail"], startOfDay(now), now, touches),
    invitesPerDay: invitesPerDay(),
    invitesPerWeek: invitesPerWeek(),
    messagesPerDay: messagesPerDay(),
    invitesSentThisWeek: invitesSentThisWeek(now, touches),
  };
}

/**
 * Everything that has to be true before a message about a real person lands in
 * a founder's queue. First refusal wins.
 *
 * `fatal` means the enrolment stops or pauses rather than trying again: a
 * suppression, an unusable profile and a bad merge will not fix themselves. A
 * cap is not fatal — the step simply waits for tomorrow.
 */
export function guardTouch(input: {
  kind: TouchKind;
  text: string;
  profileUrl: string;
  email: string;
  now: Date;
  isFirstTouch?: boolean;
}): QueueVerdict {
  // 1. The stop switch. One brake for both channels, so "stop everything"
  //    on the sequencer page means everything.
  const stop = hardStop();
  if (stop) {
    return {
      ok: false,
      refusal: `All outreach is stopped.${stop.reason ? ` ${stop.reason}` : ""}`,
      fatal: false,
    };
  }

  // 2. A profile we can actually open, and can actually match a suppression
  //    against. An unrecognised URL is fatal rather than skipped, because
  //    "cannot check the list" must never read the same as "not on the list".
  const profile = normaliseProfileUrl(input.profileUrl);
  if (!profile) {
    return {
      ok: false,
      refusal: input.profileUrl
        ? `"${input.profileUrl}" is not a public LinkedIn profile. Use the linkedin.com/in/... address, not a Sales Navigator link.`
        : "The client record has no LinkedIn profile.",
      fatal: true,
    };
  }

  // 3. The list, on both channels. Somebody who unsubscribed from the email is
  //    not then fair game for a connection request.
  const blockedProfile = isSuppressedProfile(profile);
  if (blockedProfile) {
    return { ok: false, refusal: `${profile} is on the suppression list (${blockedProfile.reason}).`, fatal: true };
  }
  const email = normaliseAddress(input.email);
  if (email) {
    const blockedEmail = isSuppressed(email);
    if (blockedEmail) {
      return {
        ok: false,
        refusal: `${email} is on the suppression list (${blockedEmail.reason}), so LinkedIn is off too.`,
        fatal: true,
      };
    }
  }

  // 4. Merge fields. A raw {first_name} in a connection note is the disaster.
  const missing = unresolvedFields(input.text);
  if (missing.length) {
    return {
      ok: false,
      refusal: `The client record has no ${missing.join(", ")}. Fill that in, or cut the field from the step.`,
      fatal: true,
    };
  }

  // 5. LinkedIn's own ceiling. A connection note over 300 characters is refused
  //    by LinkedIn itself, so this is arithmetic rather than taste.
  const limit = LIMITS[input.kind];
  if (input.text.trim().length > limit.hard) {
    return {
      ok: false,
      refusal: `${input.text.trim().length} characters, and LinkedIn refuses a ${limit.label} over ${limit.hard}.`,
      fatal: true,
    };
  }

  // 6 and 7. The caps. Invitations carry both a daily and a rolling weekly one,
  //    because the weekly limit is the one LinkedIn restricts accounts over.
  const counts = queueCounts(input.now);
  if (input.kind === "connect") {
    if (counts.invitesToday >= counts.invitesPerDay) {
      return {
        ok: false,
        refusal: `Today's ${counts.invitesPerDay} invitations are committed. The rest goes tomorrow.`,
        fatal: false,
      };
    }
    if (counts.invitesThisWeek >= counts.invitesPerWeek) {
      return {
        ok: false,
        refusal: `${counts.invitesPerWeek} invitations in seven days is the cap. Going past it is how an account gets restricted.`,
        fatal: false,
      };
    }
  } else if (counts.messagesToday >= counts.messagesPerDay) {
    return {
      ok: false,
      refusal: `Today's ${counts.messagesPerDay} messages are committed. The rest goes tomorrow.`,
      fatal: false,
    };
  }

  // 8. The voice gate, on the finished text. Refused, never softened.
  const verdict = lintMessage(input.text, input.kind, { isFirstTouch: input.isFirstTouch });
  if (!verdict.ok) {
    const first = verdict.violations.find((v) => v.severity === "error");
    return {
      ok: false,
      refusal: `The voice gate refused it: ${first?.rule ?? "unknown"}. ${first?.fix ?? ""}`.trim(),
      fatal: true,
    };
  }

  return { ok: true };
}

export interface QueueAttempt {
  key: string;
  outcome: "queued" | "waiting" | "settled" | "refused";
  detail: string;
  touch?: Touch;
}

/**
 * Put one LinkedIn step in front of a founder, or say why not.
 *
 * The ledger is read first, exactly as the sender reads it, so however many
 * times the runner ticks over a step it is queued once.
 *
 * A transient refusal — a cap, the stop switch — writes no record at all. That
 * is not an oversight: `skipped` and `expired` are read by the caller as "this
 * step is finished, move on", so recording a cap hit under the same key would
 * turn "come back tomorrow" into "never send this".
 */
export function queueTouch(
  enrolment: Enrolment,
  step: OutreachStep,
  client: Client,
  now: Date = new Date(),
): QueueAttempt {
  const key = `${enrolment.id}:${step.id}`;

  if (!isTouchKind(step.kind)) {
    return { key, outcome: "refused", detail: `${step.kind} is not a LinkedIn step.` };
  }
  const kind: TouchKind = step.kind;

  const existing = findTouch(key);
  if (existing?.state === "pending") {
    return { key, outcome: "waiting", detail: "Already in the queue, waiting for a founder.", touch: existing };
  }
  // Anything left here is done, skipped or expired: settled one way or another,
  // so the caller moves the sequence on rather than queueing a second copy.
  if (existing) {
    return { key, outcome: "settled", detail: `Already ${existing.state}.`, touch: existing };
  }

  // Re-read off the client, never trusted from the enrolment, so a profile
  // corrected in the pipeline is the profile that gets used.
  const profileUrl = normaliseProfileUrl(client.linkedin ?? "");
  const merged = resolveMerge(step.body, client);
  const text = merged.text.trim();

  const verdict = guardTouch({
    kind,
    text,
    profileUrl: client.linkedin ?? "",
    email: client.email ?? "",
    now,
    isFirstTouch: enrolment.stepIndex === 0,
  });

  if (!verdict.ok) {
    if (!verdict.fatal) {
      return { key, outcome: "refused", detail: verdict.refusal };
    }
    const refused: Touch = {
      key,
      id: newId("tch"),
      enrolmentId: enrolment.id,
      clientId: enrolment.clientId,
      sequenceId: enrolment.sequenceId,
      stepId: step.id,
      kind,
      name: client.name,
      company: client.company,
      profileUrl: profileUrl || (client.linkedin ?? ""),
      text,
      state: "skipped",
      problem: verdict.refusal,
      basis: enrolment.basis,
      queuedAt: now.toISOString(),
      dueAt: enrolment.dueAt,
      finishedAt: now.toISOString(),
    };
    putTouch(refused);

    // The voice gate pauses, because the copy can be fixed and the sequence
    // resumed. Everything else fatal stops it. Same split as the sender.
    const gated = verdict.refusal.startsWith("The voice gate");
    updateEnrolment(enrolment.id, {
      state: gated ? "paused" : "stopped",
      stoppedReason: verdict.refusal,
    });
    return { key, outcome: "refused", detail: verdict.refusal, touch: refused };
  }

  const touch: Touch = {
    key,
    id: newId("tch"),
    enrolmentId: enrolment.id,
    clientId: enrolment.clientId,
    sequenceId: enrolment.sequenceId,
    stepId: step.id,
    kind,
    name: client.name,
    company: client.company,
    profileUrl,
    text,
    state: "pending",
    basis: enrolment.basis,
    queuedAt: now.toISOString(),
    dueAt: enrolment.dueAt,
  };
  putTouch(touch);
  return { key, outcome: "queued", detail: `${LIMITS[kind].label} for ${client.name}.`, touch };
}

export interface SettleResult {
  ok: boolean;
  touch?: Touch;
  problem?: string;
}

/**
 * A founder says they sent it, or passed on it. Either way the enrolment moves.
 *
 * "Sent" is a claim by a person, not an observation. Nothing here can see
 * LinkedIn, so the ledger records who said so and when, and the page says as
 * much rather than implying the console watched it happen.
 */
export function settleTouch(input: {
  id: string;
  action: "done" | "skip";
  by: string;
  note?: string;
  sequence: OutreachSequence;
  enrolment: Enrolment;
  now?: Date;
}): SettleResult {
  const now = input.now ?? new Date();
  const current = listTouches().find((t) => t.id === input.id);
  if (!current) return { ok: false, problem: "No such touch." };
  if (current.state !== "pending") {
    return { ok: false, problem: `That one is already ${current.state}.`, touch: current };
  }

  const settled: Touch = {
    ...current,
    state: input.action === "done" ? "done" : "skipped",
    problem:
      input.action === "skip"
        ? `Skipped by ${input.by}.${input.note ? ` ${input.note}` : ""}`
        : undefined,
    finishedAt: now.toISOString(),
    finishedBy: input.by,
  };
  putTouch(settled);

  if (input.action === "done") {
    addTouch(current.clientId, {
      note: `${LIMITS[current.kind].label} sent on LinkedIn: ${current.text.slice(0, 120)}`,
      who: input.by,
    });
  }

  advance(input.enrolment, input.sequence.steps, now);
  return { ok: true, touch: settled };
}

/**
 * Queued too long ago to still be true.
 *
 * A connection note written on Monday about something that happened last week
 * is a worse message on Friday, and a much worse one a fortnight later. Rather
 * than let a founder work a stale queue, a pending touch past its window is
 * marked expired and the sequence moves on. It is marked rather than deleted,
 * because "nobody got to this" is a fact worth being able to read later.
 */
export function expireStaleTouches(
  now: Date = new Date(),
  lookup: (enrolmentId: string) => { enrolment: Enrolment; sequence: OutreachSequence } | undefined,
): Touch[] {
  const cutoff = now.getTime() - expireDays() * 86_400_000;
  const expired: Touch[] = [];

  for (const touch of listTouches()) {
    if (touch.state !== "pending") continue;
    if (new Date(touch.queuedAt).getTime() > cutoff) continue;

    const record: Touch = {
      ...touch,
      state: "expired",
      problem: `Nobody sent it within ${expireDays()} days, so the words had gone stale.`,
      finishedAt: now.toISOString(),
    };
    putTouch(record);
    expired.push(record);

    const found = lookup(touch.enrolmentId);
    if (found) advance(found.enrolment, found.sequence.steps, now);
  }

  return expired;
}
