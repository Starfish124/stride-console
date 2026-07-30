// Every read and write for the sequencer's files.
//
// All of it is synchronous on purpose. Node is single threaded, so a read,
// a change and a write with no await between them cannot interleave with
// another request in this process. That is the whole concurrency design: the
// runner script owns the clock, this process owns every write, and no second
// process ever touches these files.
//
// Mode 0600 throughout. These files hold other people's email addresses, what
// was said to them and the record of why we were allowed to say it.

import crypto from "node:crypto";
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../store.ts";
import type { Enrolment, HardStop, AccountResearch, RunnerState, SendRecord, Suppression } from "./types.ts";

const MODE = 0o600;

const FILES = {
  enrolments: path.join(DATA_DIR, "salesnav-enrolments.json"),
  sends: path.join(DATA_DIR, "salesnav-sends.json"),
  suppress: path.join(DATA_DIR, "salesnav-suppress.json"),
  stop: path.join(DATA_DIR, "salesnav-stop.json"),
  research: path.join(DATA_DIR, "salesnav-research.json"),
  state: path.join(DATA_DIR, "salesnav-state.json"),
  secret: path.join(DATA_DIR, "salesnav-secret.json"),
} as const;

export const SALESNAV_FILES = FILES;

/** The ledger is an operating record, not an archive. */
const MAX_SENDS = 5000;

// ---------- enrolments ----------

export function listEnrolments(): Enrolment[] {
  return readJson<Enrolment[]>(FILES.enrolments, []);
}

export function getEnrolment(id: string): Enrolment | undefined {
  return listEnrolments().find((e) => e.id === id);
}

export function putEnrolment(enrolment: Enrolment): void {
  const all = listEnrolments();
  const i = all.findIndex((e) => e.id === enrolment.id);
  if (i >= 0) all[i] = enrolment;
  else all.push(enrolment);
  writeJson(FILES.enrolments, all, MODE);
}

/** Read, change, write, with nothing awaited in between. */
export function updateEnrolment(
  id: string,
  patch: Partial<Enrolment>,
): Enrolment | undefined {
  const all = listEnrolments();
  const i = all.findIndex((e) => e.id === id);
  if (i < 0) return undefined;
  const next = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
  all[i] = next;
  writeJson(FILES.enrolments, all, MODE);
  return next;
}

export function deleteEnrolment(id: string): void {
  writeJson(FILES.enrolments, listEnrolments().filter((e) => e.id !== id), MODE);
}

// ---------- the send ledger ----------

export function listSends(): SendRecord[] {
  return readJson<SendRecord[]>(FILES.sends, []);
}

export function findSend(key: string): SendRecord | undefined {
  return listSends().find((s) => s.key === key);
}

/** Newest first, capped. Upserts on the idempotency key. */
export function putSend(record: SendRecord): void {
  const all = listSends().filter((s) => s.key !== record.key);
  writeJson(FILES.sends, [record, ...all].slice(0, MAX_SENDS), MODE);
}

// ---------- suppressions ----------

export function listSuppressions(): Suppression[] {
  return readJson<Suppression[]>(FILES.suppress, []);
}

export function putSuppression(entry: Suppression): void {
  const all = listSuppressions().filter(
    (s) => s.address.toLowerCase() !== entry.address.toLowerCase(),
  );
  writeJson(FILES.suppress, [entry, ...all], MODE);
}

export function dropSuppression(address: string): boolean {
  const all = listSuppressions();
  const left = all.filter((s) => s.address.toLowerCase() !== address.toLowerCase());
  if (left.length === all.length) return false;
  writeJson(FILES.suppress, left, MODE);
  return true;
}

// ---------- the unsubscribe signing key ----------

/**
 * Its own secret, minted once and never shared.
 *
 * This used to reuse the webhook secret, which couples two unrelated trust
 * domains to one value: every unsubscribe link already sitting in somebody's
 * inbox is only valid while that file is unchanged. WebhookCard tells a founder
 * to delete data/hooks.json to rotate the Linked Helper URL, so following the
 * on-screen instruction silently broke every outstanding opt-out. A person
 * clicking "not interested" got a 404, stayed enrolled, and kept receiving
 * mail, which is both the one promise this system makes unconditionally and a
 * spam signal against the sending domain.
 *
 * Rotating this one is never routine. It is only correct if no unsubscribe
 * link is still in flight, which in practice means never.
 */
export function unsubSecret(): string {
  const stored = readJson<{ secret?: string }>(FILES.secret, {});
  if (stored.secret) return stored.secret;
  const secret = crypto.randomBytes(32).toString("base64url");
  writeJson(FILES.secret, { secret, mintedAt: new Date().toISOString() }, MODE);
  return secret;
}

// ---------- the hard stop ----------

export function hardStop(): HardStop | undefined {
  const value = readJson<HardStop | null>(FILES.stop, null);
  return value && value.stopped ? value : undefined;
}

export function setHardStop(input: { stopped: boolean; by: string; reason?: string }): HardStop {
  const record: HardStop = {
    stopped: input.stopped,
    at: new Date().toISOString(),
    by: input.by,
    reason: input.reason,
  };
  writeJson(FILES.stop, record, MODE);
  return record;
}

// ---------- research ----------

export function listResearch(): AccountResearch[] {
  return readJson<AccountResearch[]>(FILES.research, []);
}

export function researchFor(clientId: string): AccountResearch | undefined {
  return listResearch().find((r) => r.clientId === clientId);
}

export function putResearch(record: AccountResearch): void {
  const all = listResearch().filter((r) => r.clientId !== record.clientId);
  writeJson(FILES.research, [record, ...all].slice(0, 500), MODE);
}

// ---------- the runner's clock ----------

export function runnerState(): RunnerState {
  return readJson<RunnerState>(FILES.state, {});
}

export function setRunnerState(state: RunnerState): void {
  writeJson(FILES.state, state, MODE);
}
