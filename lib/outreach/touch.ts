// The LinkedIn touches waiting on a founder's thumb.
//
// Linked Helper used to own this half: it held the campaign, ran the clock and
// clicked Connect. Without it the console owns the clock and the words, and a
// person owns the click. That is a deliberate choice rather than a gap. Driving
// linkedin.com from a script breaks LinkedIn's user agreement and puts the
// founders' own accounts — and the Sales Navigator seat attached to them — at
// risk of restriction, to save about ten seconds a touch. The console already
// works this way for posting ("nothing auto-posts"), so outbound works this
// way too.
//
// The shape mirrors lib/salesnav/types.ts on purpose:
//
//   The key is `${enrolmentId}:${stepId}`, so a step cannot be queued twice
//   however many times the runner ticks over it.
//
//   History is copied, never referenced. A Touch holds the exact merged text
//   and the lawful basis as they were when it was queued. Editing a sequence
//   next month must not rewrite what was sent last month.
//
// Mode 0600 throughout: these records hold somebody's name, their profile and
// what we said to them.

import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../store.ts";
import type { LawfulBasis } from "../salesnav/types.ts";
import type { OutreachStepKind } from "./lint.ts";

const MODE = 0o600;

const FILE = path.join(DATA_DIR, "outreach-touches.json");

export const TOUCH_FILE = FILE;

/** An operating queue, not an archive. */
const MAX_TOUCHES = 5000;

/** The step kinds a person sends by hand. Email is the sequencer's own job. */
export type TouchKind = Exclude<OutreachStepKind, "email">;

export function isTouchKind(kind: OutreachStepKind): kind is TouchKind {
  return kind !== "email";
}

/**
 * pending — queued, waiting for a founder. The enrolment does not move.
 * done    — a founder says they sent it.
 * skipped — a founder passed, or the guard refused it. `problem` says which.
 * expired — nobody got to it before the words stopped being true.
 */
export type TouchState = "pending" | "done" | "skipped" | "expired";

export interface Touch {
  /** `${enrolmentId}:${stepId}`. The idempotency key, and the primary key. */
  key: string;
  id: string;
  enrolmentId: string;
  clientId: string;
  sequenceId: string;
  stepId: string;
  kind: TouchKind;
  /** Who it goes to, copied so the queue reads without a client lookup. */
  name: string;
  company: string;
  /** Where the founder goes to send it. Re-read off the client when queued. */
  profileUrl: string;
  /** The exact merged text, gate-passed. What the founder pastes, verbatim. */
  text: string;
  state: TouchState;
  /** The refusal, the skip reason, or why it expired. */
  problem?: string;
  /** Copied, not referenced. */
  basis: LawfulBasis;
  queuedAt: string;
  /** When the step came due. Kept so an old queue reads as old. */
  dueAt: string;
  finishedAt?: string;
  /** Which founder said they sent it. */
  finishedBy?: string;
}

// ---------- the caps ----------
//
// LinkedIn's weekly invitation limit is the real constraint and it is not
// published as a number: roughly 100 a week for an established account, and
// materially less for a new one or one with a low acceptance rate. The
// defaults here sit under the low end on purpose. Going over does not bounce
// like an email — it gets the account restricted, which also costs the Sales
// Navigator seat attached to it.
//
// These are per person doing the sending, not per company, because the limit
// LinkedIn enforces is per account.

const DEFAULTS = {
  invitesPerDay: 15,
  invitesPerWeek: 80,
  messagesPerDay: 25,
  /** A queued touch older than this has lost its context. */
  expireDays: 5,
} as const;

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function invitesPerDay(): number {
  return num("OUTREACH_INVITES_PER_DAY", DEFAULTS.invitesPerDay);
}

export function invitesPerWeek(): number {
  return num("OUTREACH_INVITES_PER_WEEK", DEFAULTS.invitesPerWeek);
}

export function messagesPerDay(): number {
  return num("OUTREACH_MESSAGES_PER_DAY", DEFAULTS.messagesPerDay);
}

export function expireDays(): number {
  return num("OUTREACH_TOUCH_EXPIRE_DAYS", DEFAULTS.expireDays);
}

// ---------- the store ----------

export function listTouches(): Touch[] {
  return readJson<Touch[]>(FILE, []);
}

export function findTouch(key: string): Touch | undefined {
  return listTouches().find((t) => t.key === key);
}

export function getTouch(id: string): Touch | undefined {
  return listTouches().find((t) => t.id === id);
}

/** Newest first, capped. Upserts on the idempotency key. */
export function putTouch(touch: Touch): void {
  const all = listTouches().filter((t) => t.key !== touch.key);
  writeJson(FILE, [touch, ...all].slice(0, MAX_TOUCHES), MODE);
}

/** Oldest due first, so a backlog is worked in the order it built up. */
export function pendingTouches(): Touch[] {
  return listTouches()
    .filter((t) => t.state === "pending")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function pendingFor(enrolmentId: string): Touch | undefined {
  return listTouches().find((t) => t.enrolmentId === enrolmentId && t.state === "pending");
}
