// The list of people this console will not email, and the token that lets
// somebody put themselves on it in one click.
//
// Suppression is the only promise in the whole sequencer that is unconditional.
// Everything else has a cap or a window or a judgement call; this one is a
// straight refusal, checked before the provider is even chosen, and it also
// stops any sequence the address is already in. An unsubscribe that stops the
// next email but leaves the following three queued is not an unsubscribe.

import crypto from "node:crypto";

import { listClients } from "../store.ts";
import { pendingTouches, putTouch } from "../outreach/touch.ts";
import {
  dropSuppression,
  listEnrolments,
  listSuppressions,
  putSuppression,
  unsubSecret,
  updateEnrolment,
} from "./store.ts";
import type { Suppression } from "./types.ts";

export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A LinkedIn profile reduced to the one form two spellings of it share:
 * "linkedin.com/in/<slug>", lowercased, no scheme, no subdomain, no query.
 *
 * Strict on purpose. A bare "jane-doe" is not accepted, because guessing that
 * a loose string is a profile is how one person's opt-out silently fails to
 * match the person it was meant to protect. Anything unrecognised comes back
 * empty and the caller says so out loud.
 *
 * Sales Navigator's own URLs — linkedin.com/sales/lead/ACwAAA... — are
 * deliberately in the unrecognised bucket. They are a different identifier
 * space with no public slug in them, and treating one as a profile would let a
 * suppressed person through under a second name. Copy the public profile URL
 * off the Sales Navigator page instead.
 */
export function normaliseProfileUrl(url: string): string {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return "";
  const match = /(?:^|\.|\/\/)linkedin\.com\/in\/([^/?#\s]+)/.exec(raw) ?? /^\/?in\/([^/?#\s]+)/.exec(raw);
  if (!match) return "";
  const slug = decodeURIComponent(match[1]).replace(/\/+$/, "");
  return slug ? `linkedin.com/in/${slug}` : "";
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
  if (!address) return undefined;
  const domain = domainOf(address);
  return listSuppressions().find((s) => {
    if (s.channel === "linkedin") return false;
    const entry = normaliseAddress(s.address);
    return entry.startsWith("@") ? entry.slice(1) === domain : entry === address;
  });
}

/**
 * The same refusal, on the profile rather than the address.
 *
 * An unrecognised URL matches nothing, which is why the touch guard refuses a
 * profile it could not normalise before it ever gets here: "no entry found" and
 * "no way to look" must not produce the same answer when the answer decides
 * whether a stranger gets written to.
 */
export function isSuppressedProfile(url: string): Suppression | undefined {
  const profile = normaliseProfileUrl(url);
  if (!profile) return undefined;
  return listSuppressions().find(
    (s) => s.channel === "linkedin" && normaliseProfileUrl(s.address) === profile,
  );
}

/**
 * Add to the list, stop every live enrolment for that person, and cancel any
 * LinkedIn touch already sitting in a founder's queue for them.
 *
 * That last part is not housekeeping. The header's promise is that an
 * unsubscribe stops the whole sequence, and a queued connection note is a
 * message that has not been sent yet — leaving it in the queue means a founder
 * picks it up tomorrow and sends it by hand to somebody who asked to be left
 * alone, which is worse than the automated version, not better.
 */
export function suppress(input: {
  address: string;
  reason: Suppression["reason"];
  by: string;
  note?: string;
  channel?: "email" | "linkedin";
}): Suppression {
  const channel = input.channel ?? "email";
  const address =
    channel === "linkedin" ? normaliseProfileUrl(input.address) : normaliseAddress(input.address);

  if (!address) {
    throw new Error(
      channel === "linkedin"
        ? `"${input.address}" is not a LinkedIn profile URL. Use the public linkedin.com/in/... address, not a Sales Navigator link.`
        : "An empty address cannot be suppressed.",
    );
  }

  const entry: Suppression = {
    address,
    channel,
    reason: input.reason,
    at: new Date().toISOString(),
    by: input.by,
    note: input.note,
  };
  putSuppression(entry);

  const clients = new Map(listClients().map((c) => [c.id, c]));

  for (const enrolment of listEnrolments()) {
    if (enrolment.state !== "active" && enrolment.state !== "paused") continue;

    const hit =
      channel === "linkedin"
        ? normaliseProfileUrl(clients.get(enrolment.clientId)?.linkedin ?? "") === address
        : matchesAddress(enrolment.email, address);

    if (hit) {
      updateEnrolment(enrolment.id, { state: "stopped", stoppedReason: `Suppressed: ${entry.reason}.` });
    }
  }

  for (const touch of pendingTouches()) {
    const client = clients.get(touch.clientId);
    const hit =
      channel === "linkedin"
        ? normaliseProfileUrl(touch.profileUrl) === address
        : matchesAddress(client?.email ?? "", address);

    if (hit) {
      putTouch({
        ...touch,
        state: "skipped",
        problem: `Suppressed: ${entry.reason}. Do not send this.`,
        finishedAt: entry.at,
        finishedBy: input.by,
      });
    }
  }

  return entry;
}

/** Exact address, or the whole domain when the entry starts with "@". */
function matchesAddress(email: string, target: string): boolean {
  const address = normaliseAddress(email);
  if (!address) return false;
  return target.startsWith("@") ? domainOf(address) === target.slice(1) : address === target;
}

/**
 * Taking somebody off the list is recorded, because it is the risky direction.
 *
 * A profile is matched in its normalised form, so removing an entry works
 * whether it is offered as a bare "linkedin.com/in/x" or the full URL with a
 * scheme and a trailing slash that a browser hands you.
 */
export function removeSuppression(address: string, by: string): boolean {
  const profile = normaliseProfileUrl(address);
  const target = profile
    ? (listSuppressions().find(
        (s) => s.channel === "linkedin" && normaliseProfileUrl(s.address) === profile,
      )?.address ?? profile)
    : normaliseAddress(address);

  const removed = dropSuppression(target);
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
 * It is an HMAC of the address under a secret this module owns alone, so
 * unsubscribing needs no lookup table. Its own secret and not the webhook one,
 * because rotating that is a documented routine and it would take every
 * unsubscribe link already in somebody's inbox down with it. 32
 * base64url characters is 192 bits of the digest, which is far past guessing
 * and still short enough to sit in a mailto link.
 */
export function unsubToken(email: string): string {
  return crypto
    .createHmac("sha256", unsubSecret())
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
