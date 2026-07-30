// The mail provider, behind one small interface.
//
// No SDK. Resend's send endpoint is one POST with a bearer token and a JSON
// body; @resend/node is a dependency to hold forever in exchange for spelling
// that out. Swapping to Postmark later is one more function and one more case
// in provider().
//
// Nothing here throws. A refusal from a provider carries the reason a founder
// needs, and an exception loses it on the way up, so every path returns a
// shaped result instead. Same discipline as lib/channels/linkedHelper.ts.
//
// Open and click tracking are deliberately off. A tracking pixel on a cold
// B2B email in the EU is a liability, and it tells us nothing we would act on.

import crypto from "node:crypto";
import { fromAddress, replyTo } from "./config.ts";

export interface MailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

export interface SendOutcome {
  ok: boolean;
  id?: string;
  problem?: string;
  /** True when retrying would fail the same way. The caller stops instead. */
  permanent?: boolean;
}

export interface MailProvider {
  name: "resend" | "dry";
  send(message: MailMessage, idempotencyKey: string): Promise<SendOutcome>;
  /** Whether a retry of the same key is safe with this provider. */
  retrySafe: boolean;
}

/**
 * The default. Records a synthetic id derived from the key, so a dry run is
 * reproducible and two runs of the same step read as the same send.
 */
export const dryProvider: MailProvider = {
  name: "dry",
  retrySafe: true,
  async send(_message, idempotencyKey) {
    const hash = crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16);
    return { ok: true, id: `dry_${hash}` };
  },
};

export const resendProvider: MailProvider = {
  name: "resend",
  // Resend dedupes on Idempotency-Key server side, which is what makes the one
  // retry after an unknown outcome safe rather than a coin flip.
  retrySafe: true,
  async send(message, idempotencyKey) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, problem: "RESEND_API_KEY is not set.", permanent: true };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo || undefined,
          subject: message.subject,
          text: message.text,
          headers: message.headers,
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          problem: `Resend answered ${res.status}: ${raw.slice(0, 300)}`,
          // 4xx other than 429 will fail identically next time.
          permanent: res.status >= 400 && res.status < 500 && res.status !== 429,
        };
      }
      const body = JSON.parse(raw) as { id?: string };
      return { ok: true, id: body.id };
    } catch (err) {
      return {
        ok: false,
        problem: err instanceof Error ? err.message : String(err),
        permanent: false,
      };
    }
  },
};

/**
 * A provider is only ever chosen here, and only ever a real one when the caller
 * has already established that live mode is on.
 */
export function provider(mode: "dry" | "live"): MailProvider {
  if (mode === "dry") return dryProvider;
  return process.env.STRIDE_MAIL_PROVIDER === "dry" ? dryProvider : resendProvider;
}

/** The envelope, minus the body. */
export function envelope(): { from: string; replyTo?: string } {
  return { from: fromAddress() || "Stride <dry-run@localhost>", replyTo: replyTo() || undefined };
}
