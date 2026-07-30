// The list of people this console will not email, and the token that lets
// somebody put themselves on it in one click.
//
// Suppression is the only promise in the whole sequencer that is unconditional.
// Everything else has a cap or a window or a judgement call; this one is a
// straight refusal, checked before the provider is even chosen, and it also
// stops any sequence the address is already in. An unsubscribe that stops the
// next email but leaves the following three queued is not an unsubscribe.

import crypto from "node:crypto";
import { webhookSecret } from "../outreach/replies.ts";
import {
  dropSuppression,
  listEnrolments,
  listSuppressions,
  putSuppression,
  updateEnrolment,
} from "./store.ts";
import type { Suppression } from "./types.ts";

export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function domainOf(email: string): string {
  const at = normaliseAddress(email).lastIndexOf("@");
  return at < 0 ? "" : normaliseAddress(email).slice(at + 1);
}

/**
 * Exact address, or a whole domain when the entry starts with "@".
 *
 * The domain form matters after a complaint: one angry recipient at a company
 * is usually a reason to stop writing to that company, not just to them.
 */
export function isSuppressed(email: string): Suppression | undefined {
  const address = normaliseAddress(email);
  const domain = domainOf(address);
  return listSuppressions().find((s) => {
    const entry = normaliseAddress(s.address);
    return entry.startsWith("@") ? entry.slice(1) === domain : entry === address;
  });
}

/** Add to the list and stop every live enrolment for that address. */
export function suppress(input: {
  address: string;
  reason: Suppression["reason"];
  by: string;
  note?: string;
}): Suppression {
  const entry: Suppression = {
    address: normaliseAddress(input.address),
    reason: input.reason,
    at: new Date().toISOString(),
    by: input.by,
    note: input.note,
  };
  putSuppression(entry);

  const target = entry.address;
  for (const enrolment of listEnrolments()) {
    if (enrolment.state !== "active" && enrolment.state !== "paused") continue;
    const address = normaliseAddress(enrolment.email);
    const hit = target.startsWith("@") ? domainOf(address) === target.slice(1) : address === target;
    if (hit) {
      updateEnrolment(enrolment.id, { state: "stopped", stoppedReason: `Suppressed: ${entry.reason}.` });
    }
  }
  return entry;
}

/** Taking somebody off the list is recorded, because it is the risky direction. */
export function removeSuppression(address: string, by: string): boolean {
  const removed = dropSuppression(normaliseAddress(address));
  if (removed) {
    console.log(
      `[salesnav ${new Date().toISOString()}] suppression removed for ${normaliseAddress(address)} by ${by}`,
    );
  }
  return removed;
}

export { listSuppressions };

// ---------- one-click unsubscribe ----------

/**
 * A token nobody can forge and nobody has to store.
 *
 * It is an HMAC of the address under the secret already minted for the
 * webhooks, so unsubscribing needs no lookup table and no second secret. 32
 * base64url characters is 192 bits of the digest, which is far past guessing
 * and still short enough to sit in a mailto link.
 */
export function unsubToken(email: string): string {
  return crypto
    .createHmac("sha256", webhookSecret())
    .update(normaliseAddress(email))
    .digest("base64url")
    .slice(0, 32);
}

export function verifyUnsubToken(email: string, offered: string | null): boolean {
  if (!offered) return false;
  const expected = Buffer.from(unsubToken(email));
  const got = Buffer.from(offered);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/** The address travels base64url so a "+" in it survives a query string. */
export function encodeAddress(email: string): string {
  return Buffer.from(normaliseAddress(email), "utf8").toString("base64url");
}

export function decodeAddress(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}
