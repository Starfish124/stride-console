// Putting a person into a sequence, taking them out, and the sweep that takes
// them out without being asked.
//
// The sweep is the important half. The worst thing this system could do is
// keep emailing somebody who already answered, so every tick starts by looking
// for every signal that a conversation has begun and stopping on any of them.
// None of those signals needs new data: they are all already in the client
// record, the reply inbox and the suppression list.

import { CLIENT_STAGES } from "../types.ts";
import type { Client, ClientStage } from "../types.ts";
import { getClient, listClients, newId } from "../store.ts";
import { getSequence } from "../outreach/sequence.ts";
import { listReplies } from "../outreach/replies.ts";
import { nextDueAt } from "./config.ts";
import { listEnrolments, putEnrolment, updateEnrolment } from "./store.ts";
import { isSuppressed, normaliseAddress } from "./suppress.ts";
import type { Enrolment, LawfulBasis } from "./types.ts";

/**
 * Long enough that "lead" and "cold outreach" do not fit.
 *
 * This does not make a weak reason lawful. Legitimate interest is a balancing
 * test, and no character count passes it. What the minimum does is force a
 * human to write a sentence an auditor can read, instead of clicking through a
 * default nobody ever chose.
 */
const MIN_REASON = 20;

export function validateBasis(basis: Partial<LawfulBasis> | undefined): string | undefined {
  if (!basis) return "basis";
  if (basis.kind !== "legitimate-interest" && basis.kind !== "consent") return "basis.kind";
  if (!basis.reason || basis.reason.trim().length < MIN_REASON) return "basis.reason";
  if (!basis.source || !basis.source.trim()) return "basis.source";
  if (basis.kind === "consent" && !basis.consentAt) return "basis.consentAt";
  return undefined;
}

export interface EnrolResult {
  ok: boolean;
  enrolment?: Enrolment;
  problem?: string;
  /** The exact field to fix, so the form can point at it. */
  field?: string;
}

export function enrol(input: {
  clientId: string;
  sequenceId: string;
  basis: Partial<LawfulBasis>;
  by: string;
  now?: Date;
}): EnrolResult {
  const now = input.now ?? new Date();

  const missing = validateBasis(input.basis);
  if (missing) {
    return {
      ok: false,
      field: missing,
      problem:
        missing === "basis.reason"
          ? `Write at least ${MIN_REASON} characters saying why this person specifically.`
          : `${missing} is required before anybody can be enrolled.`,
    };
  }

  const client = getClient(input.clientId);
  if (!client) return { ok: false, field: "clientId", problem: "No such client." };

  const email = normaliseAddress(client.email ?? "");
  if (!email) return { ok: false, field: "clientId", problem: `${client.name} has no email address.` };

  const blocked = isSuppressed(email);
  if (blocked) {
    return { ok: false, field: "clientId", problem: `${email} is on the suppression list (${blocked.reason}).` };
  }

  const sequence = getSequence(input.sequenceId);
  if (!sequence) return { ok: false, field: "sequenceId", problem: "No such sequence." };
  if (!sequence.steps.length) {
    return { ok: false, field: "sequenceId", problem: "That sequence has no steps." };
  }
  if (!sequence.steps.some((s) => s.kind === "email")) {
    return { ok: false, field: "sequenceId", problem: "That sequence has no email steps, so nothing would be sent." };
  }

  const live = listEnrolments().find(
    (e) => e.clientId === input.clientId && (e.state === "active" || e.state === "paused"),
  );
  if (live) {
    return { ok: false, field: "clientId", problem: `${client.name} is already in a sequence.` };
  }

  const enrolment: Enrolment = {
    id: newId("enr"),
    clientId: client.id,
    sequenceId: sequence.id,
    email,
    stepIndex: 0,
    // The opener waits 0 days by construction, so this is "as soon as the
    // window opens", plus the jitter that keeps a batch from leaving at once.
    dueAt: nextDueAt(now, 0),
    state: "active",
    stageAtEnrolment: client.stage,
    basis: {
      kind: input.basis.kind as LawfulBasis["kind"],
      reason: input.basis.reason!.trim(),
      source: input.basis.source!.trim(),
      consentAt: input.basis.consentAt,
      recordedBy: input.by,
      recordedAt: now.toISOString(),
    },
    createdAt: now.toISOString(),
    createdBy: input.by,
    updatedAt: now.toISOString(),
  };
  putEnrolment(enrolment);
  return { ok: true, enrolment };
}

export function withdraw(id: string, reason: string): Enrolment | undefined {
  return updateEnrolment(id, { state: "stopped", stoppedReason: reason });
}

export function pause(id: string): Enrolment | undefined {
  return updateEnrolment(id, { state: "paused" });
}

export function resume(id: string): Enrolment | undefined {
  return updateEnrolment(id, { state: "active", stoppedReason: undefined });
}

function stageRank(stage: ClientStage): number {
  const i = CLIENT_STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

/** Did anybody with this name or this address write back. */
function hasReplied(client: Client, email: string): boolean {
  const name = client.name?.trim().toLowerCase();
  return listReplies().some((reply) => {
    if (reply.name && name && reply.name.trim().toLowerCase() === name) return true;
    const raw = typeof reply.raw === "string" ? reply.raw : JSON.stringify(reply.raw ?? "");
    return raw.toLowerCase().includes(email);
  });
}

export interface SweepResult {
  stopped: Array<{ id: string; reason: string }>;
}

/**
 * Every reason to stop, checked before a single step is considered.
 *
 * Note what is not here: an "opened but did not reply" rule. Open tracking is
 * off by design, so this cannot know and does not guess.
 */
export function sweep(): SweepResult {
  const stopped: SweepResult["stopped"] = [];
  const clients = new Map(listClients().map((c) => [c.id, c]));

  for (const enrolment of listEnrolments()) {
    if (enrolment.state !== "active" && enrolment.state !== "paused") continue;

    const stop = (reason: string) => {
      updateEnrolment(enrolment.id, { state: "stopped", stoppedReason: reason });
      stopped.push({ id: enrolment.id, reason });
    };

    const client = clients.get(enrolment.clientId);
    if (!client) {
      stop("The client record is gone.");
      continue;
    }
    if (!getSequence(enrolment.sequenceId)) {
      stop("The sequence was deleted.");
      continue;
    }

    const email = normaliseAddress(client.email ?? "");
    if (!email) {
      stop("The client record no longer has an email address.");
      continue;
    }
    if (email !== enrolment.email) {
      stop(`The address changed from ${enrolment.email} to ${email}. Enrol again to confirm.`);
      continue;
    }
    if (isSuppressed(email)) {
      stop("That address is on the suppression list.");
      continue;
    }
    if (stageRank(client.stage) > stageRank(enrolment.stageAtEnrolment)) {
      stop(`They moved to ${client.stage}. A conversation started, so the sequence stops.`);
      continue;
    }
    if (hasReplied(client, email)) {
      stop("They replied.");
    }
  }

  return { stopped };
}
