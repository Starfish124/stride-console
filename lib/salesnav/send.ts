// One step, one send, one ledger row.
//
// This is the only exported sender in the repo and the only file that imports
// provider.ts. Everything it does is in one order and the order is the point:
//
//   read the ledger -> guard -> claim -> call -> settle -> advance
//
// The claim is written synchronously, before the first await. A SIGKILL
// between the claim and the provider's answer therefore leaves a row in state
// "sending", which is the honest record: the outcome is unknown, not zero. The
// one retry reuses the same idempotency key, so a send that really did go out
// but was never recorded cannot go out twice.

import { addTouch, newId } from "../store.ts";
import type { Client } from "../types.ts";
import type { OutreachStep } from "../outreach/sequence.ts";
import { consoleUrl, nextDueAt, publicUrl, replyTo, salesnavMode } from "./config.ts";
import { guardSend } from "./guard.ts";
import { resolveMerge } from "./merge.ts";
import { envelope, provider } from "./provider.ts";
import { findSend, putSend, updateEnrolment } from "./store.ts";
import { encodeAddress, unsubToken } from "./suppress.ts";
import type { Enrolment, SendRecord } from "./types.ts";

/** After this many claims with no answer, a human looks instead of a machine. */
const MAX_ATTEMPTS = 2;

export interface SendAttempt {
  key: string;
  outcome: "sent" | "skipped" | "failed" | "stuck" | "already-sent";
  detail: string;
  record?: SendRecord;
}

export function unsubscribeUrl(email: string): string {
  // publicUrl() is required for live mode, so in live this is always the
  // reachable address. In a dry run it falls back to the console's own URL,
  // which is honest about what the link would be rather than inventing one.
  const base = publicUrl() || consoleUrl();
  return `${base}/api/salesnav/unsubscribe?e=${encodeAddress(email)}&t=${unsubToken(email)}`;
}

/**
 * The exact text that goes out, merge fields resolved and the way out attached.
 *
 * The plain last line is not redundant with the header. The header is for the
 * mail client; the line is for the person, who is far more likely to click a
 * sentence than to find a menu item.
 */
export function renderStep(
  step: OutreachStep,
  client: Client,
  email: string,
): { subject: string; body: string; missing: string[] } {
  const subject = resolveMerge(step.subject ?? "", client);
  const body = resolveMerge(step.body, client);
  return {
    subject: subject.text.trim(),
    body: `${body.text.trim()}\n\nNot interested: ${unsubscribeUrl(email)}`,
    missing: [...new Set([...subject.missing, ...body.missing])],
  };
}

function headersFor(email: string): Record<string, string> {
  const mailto = replyTo() ? `, <mailto:${replyTo()}?subject=unsubscribe>` : "";
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>${mailto}`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Record a refusal without ever calling a provider.
 *
 * A claim whose outcome is unknown is never overwritten. The file header and
 * the cap accounting both rest on "sending" meaning assume-delivered, so
 * turning one back into a skipped row would hand a day's quota back for a
 * message that may well have arrived, reset the attempt count that stops an
 * unanswered claim retrying forever, and leave the console denying it ever
 * wrote to somebody who is holding the email.
 */
function refuse(
  enrolment: Enrolment,
  step: OutreachStep,
  rendered: { subject: string; body: string },
  email: string,
  problem: string,
  now: Date,
): SendRecord {
  const key = `${enrolment.id}:${step.id}`;
  const inFlight = findSend(key);
  if (inFlight?.state === "sending") return inFlight;

  const record: SendRecord = {
    key,
    id: inFlight?.id ?? newId("snd"),
    enrolmentId: enrolment.id,
    clientId: enrolment.clientId,
    sequenceId: enrolment.sequenceId,
    stepId: step.id,
    to: email,
    subject: rendered.subject,
    body: rendered.body,
    state: "skipped",
    // Which mode was in force when it was refused, not "nothing left the
    // building". A founder filtering the ledger for live sends still wants to
    // see what live sending refused.
    dryRun: salesnavMode() === "dry",
    provider: "dry",
    problem,
    basis: enrolment.basis,
    claimedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    attempts: 0,
  };
  putSend(record);
  return record;
}

/**
 * Move the enrolment on, or finish it. Called after a send and after a skip:
 * a step that will never go out must not block the one behind it forever.
 */
export function advance(enrolment: Enrolment, steps: OutreachStep[], now: Date): void {
  const nextIndex = enrolment.stepIndex + 1;
  const next = steps[nextIndex];
  if (!next) {
    updateEnrolment(enrolment.id, { state: "done", stepIndex: nextIndex });
    return;
  }
  updateEnrolment(enrolment.id, {
    stepIndex: nextIndex,
    dueAt: nextDueAt(now, next.waitDays),
  });
}

export async function attemptSend(
  enrolment: Enrolment,
  step: OutreachStep,
  client: Client,
  steps: OutreachStep[],
  now: Date = new Date(),
): Promise<SendAttempt> {
  const key = `${enrolment.id}:${step.id}`;

  // The address is re-read off the client, never trusted from the enrolment,
  // so a correction in the pipeline is the address that gets used.
  const email = (client.email ?? "").trim().toLowerCase();
  if (!email) {
    updateEnrolment(enrolment.id, {
      state: "stopped",
      stoppedReason: "The client record has no email address.",
    });
    return { key, outcome: "skipped", detail: "No email address on the client." };
  }

  const rendered = renderStep(step, client, email);

  // --- the ledger, before anything else ---
  const existing = findSend(key);
  if (existing?.state === "sent") {
    advance(enrolment, steps, now);
    return { key, outcome: "already-sent", detail: "Already sent. Moved on.", record: existing };
  }
  if (existing?.state === "sending" && existing.attempts >= MAX_ATTEMPTS) {
    const stuck = { ...existing, state: "stuck" as const, finishedAt: now.toISOString() };
    putSend(stuck);
    updateEnrolment(enrolment.id, { state: "paused" });
    return {
      key,
      outcome: "stuck",
      detail: "Claimed twice with no answer from the provider. Paused for a person to look.",
      record: stuck,
    };
  }

  const verdict = guardSend({
    to: email,
    subject: rendered.subject,
    body: rendered.body,
    now,
    isFirstTouch: enrolment.stepIndex === 0,
  });

  if (!verdict.ok) {
    const record = refuse(enrolment, step, rendered, email, verdict.refusal, now);
    if (verdict.fatal) {
      // Suppression, a broken address and a bad merge stop the whole enrolment.
      // The voice gate pauses instead, because the copy can be fixed.
      const gated = verdict.refusal.startsWith("The voice gate");
      updateEnrolment(enrolment.id, {
        state: gated ? "paused" : "stopped",
        stoppedReason: verdict.refusal,
      });
    }
    // A cap or the stop switch is not fatal: the step stays where it is and
    // goes tomorrow, so nothing advances.
    return { key, outcome: "skipped", detail: verdict.refusal, record };
  }

  // --- the claim. Synchronous, and before the first await. ---
  const mail = provider(verdict.mode);
  const claim: SendRecord = {
    key,
    id: existing?.id ?? newId("snd"),
    enrolmentId: enrolment.id,
    clientId: enrolment.clientId,
    sequenceId: enrolment.sequenceId,
    stepId: step.id,
    to: email,
    subject: rendered.subject,
    body: rendered.body,
    state: "sending",
    dryRun: verdict.mode === "dry",
    provider: mail.name,
    basis: enrolment.basis,
    // Only a live claim donates its timestamp. A retry of a "sending" row is
    // the same send finishing, so it keeps the day it was claimed on. A row
    // left by a REFUSAL is a different thing entirely: refuse() writes on this
    // same key, so inheriting from it stamped today's send with the day it was
    // first turned away. sentToday() buckets by claimedAt, so the send left the
    // building today and was counted against yesterday, and the cap it should
    // have consumed stayed open for the next address in the queue.
    claimedAt: existing?.state === "sending" ? existing.claimedAt : now.toISOString(),
    attempts: existing?.state === "sending" ? existing.attempts + 1 : 1,
  };
  putSend(claim);

  if (claim.attempts > 1 && !mail.retrySafe) {
    const stuck = { ...claim, state: "stuck" as const, problem: "This provider cannot dedupe a retry.", finishedAt: now.toISOString() };
    putSend(stuck);
    updateEnrolment(enrolment.id, { state: "paused" });
    return { key, outcome: "stuck", detail: stuck.problem, record: stuck };
  }

  const { from, replyTo: reply } = envelope();
  const outcome = await mail.send(
    { to: email, from, replyTo: reply, subject: rendered.subject, text: rendered.body, headers: headersFor(email) },
    key,
  );

  // --- settle ---
  const settled: SendRecord = {
    ...claim,
    state: outcome.ok ? "sent" : "failed",
    providerId: outcome.id,
    problem: outcome.problem,
    finishedAt: new Date().toISOString(),
  };
  putSend(settled);

  if (!outcome.ok) {
    if (outcome.permanent) {
      updateEnrolment(enrolment.id, { state: "paused", stoppedReason: outcome.problem });
    }
    return { key, outcome: "failed", detail: outcome.problem ?? "The provider refused it.", record: settled };
  }

  addTouch(enrolment.clientId, {
    note: `${verdict.mode === "dry" ? "Dry run, not sent" : "Emailed"}: ${rendered.subject}`,
    who: "sequencer",
  });
  advance(enrolment, steps, now);
  return { key, outcome: "sent", detail: rendered.subject, record: settled };
}
