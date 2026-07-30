// The single choke point.
//
// Every guarantee this sequencer makes is enforced here, in one function, and
// send.ts calls it before it does anything else. provider.ts is imported by
// send.ts and by nothing else in the repo, so there is no path from a route or
// a page to the provider that does not come through this file. That is a fact
// about the module graph rather than a convention somebody has to remember.
//
// First refusal wins, and the order is deliberate: the stop switch outranks
// the mode, the mode outranks the list, and the voice gate is last because it
// is the only one that needs the finished text.

import { lintMessage, lintSubject } from "../outreach/lint.ts";
import type { LintResult } from "../types.ts";
import { dailyCap, domainCap, localDay, salesnavMode } from "./config.ts";
import { hardStop, listSends } from "./store.ts";
import { domainOf, isSuppressed, normaliseAddress } from "./suppress.ts";

export type GuardVerdict =
  | { ok: true; mode: "dry" | "live" }
  | { ok: false; refusal: string; fatal: boolean };

/**
 * The email gate. The subject and the body fail in different ways, so they are
 * linted separately and the verdicts summed.
 *
 * lib/pipeline/lint.ts's own lint() is deliberately not used: it enforces a
 * 900 to 2900 character band and a hook fold, which are LinkedIn post rules
 * and would refuse every email ever written.
 */
export function lintEmailStep(
  step: { subject?: string; body: string },
  options: { isFirstTouch?: boolean } = {},
): LintResult {
  const subject = lintSubject(step.subject ?? "");
  const body = lintMessage(step.body, "email", options);
  const violations = [...subject.violations, ...body.violations];
  const errors = subject.errors + body.errors;
  return { ok: errors === 0, errors, warns: subject.warns + body.warns, violations };
}

/** Anything still wearing braces after the merge ran. */
function unresolvedFields(text: string): string[] {
  return [...new Set((text.match(/\{[a-z_]+\}/gi) ?? []).map((f) => f.slice(1, -1).toLowerCase()))];
}

/**
 * What has already gone out today, from the ledger rather than a counter.
 *
 * "sending" counts. A claimed row whose outcome is unknown has to be assumed
 * delivered, or a crash mid-tick would hand back a day's worth of quota.
 */
export function sentToday(now: Date, dryRun: boolean): { total: number; byDomain: Map<string, number> } {
  const day = localDay(now);
  const byDomain = new Map<string, number>();
  let total = 0;
  for (const record of listSends()) {
    if (record.dryRun !== dryRun) continue;
    if (record.state !== "sent" && record.state !== "sending") continue;
    if (localDay(new Date(record.claimedAt)) !== day) continue;
    total += 1;
    const domain = domainOf(record.to);
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }
  return { total, byDomain };
}

export function guardSend(input: {
  to: string;
  subject: string;
  body: string;
  now: Date;
  isFirstTouch?: boolean;
}): GuardVerdict {
  // 1. The stop switch. Nothing outranks it.
  const stop = hardStop();
  if (stop) {
    return {
      ok: false,
      refusal: `All sending is stopped.${stop.reason ? ` ${stop.reason}` : ""}`,
      fatal: false,
    };
  }

  const mode = salesnavMode();
  const to = normaliseAddress(input.to);

  // 2. An address that is not an address.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, refusal: `"${input.to}" is not an email address.`, fatal: true };
  }

  // 3. The list. Unconditional, and fatal so the enrolment stops rather than
  //    retrying against somebody who asked to be left alone.
  const blocked = isSuppressed(to);
  if (blocked) {
    return {
      ok: false,
      refusal: `${to} is on the suppression list (${blocked.reason}).`,
      fatal: true,
    };
  }

  // 4. Merge fields. A raw {first_name} in a live email is the disaster.
  const missing = unresolvedFields(`${input.subject}\n${input.body}`);
  if (missing.length) {
    return {
      ok: false,
      refusal: `The client record has no ${missing.join(", ")}. Fill that in, or cut the field from the step.`,
      fatal: true,
    };
  }

  // 5 and 6. The caps. In dry mode they are counted against the dry ledger, so
  // a rehearsal shows the real shape of a day rather than an unlimited one.
  const counts = sentToday(input.now, mode === "dry");
  const daily = dailyCap();
  if (counts.total >= daily) {
    return {
      ok: false,
      refusal: `Today's cap of ${daily} is spent. The rest goes tomorrow.`,
      fatal: false,
    };
  }
  const perDomain = domainCap();
  const domain = domainOf(to);
  if ((counts.byDomain.get(domain) ?? 0) >= perDomain) {
    return {
      ok: false,
      refusal: `${perDomain} already went to ${domain} today. More than that is how a domain gets blocked.`,
      fatal: false,
    };
  }

  // 7. The voice gate, on the finished text. Refused, never softened.
  const verdict = lintEmailStep(
    { subject: input.subject, body: input.body },
    { isFirstTouch: input.isFirstTouch },
  );
  if (!verdict.ok) {
    const first = verdict.violations.find((v) => v.severity === "error");
    return {
      ok: false,
      refusal: `The voice gate refused it: ${first?.rule ?? "unknown"}. ${first?.fix ?? ""}`.trim(),
      fatal: true,
    };
  }

  return { ok: true, mode };
}
