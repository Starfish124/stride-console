// What the LinkedIn queue needs from a person right now.
//
// Same AttentionItem shape the Linked Helper pulse and the email sequencer use,
// so the dashboard keeps one "what needs me" surface. Everything is derived
// from live state and nothing is stored, so none of it can go stale.

import { invitesSentThisWeek, queueCounts } from "./queue.ts";
import { expireDays, listTouches, pendingTouches } from "./touch.ts";
import type { AttentionItem } from "../channels/attention.ts";

/** A touch sitting this long unsent is the queue quietly not being worked. */
const STALE_HOURS = 36;

export function touchItems(now: Date = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const href = "/outreach#queue";
  const pending = pendingTouches();

  // The queue is the whole point of the assisted model: if nobody works it,
  // the sequences are stopped and nothing says so. This is the thing that says
  // so, before the touches start expiring rather than after.
  const stale = pending.filter(
    (t) => now.getTime() - new Date(t.queuedAt).getTime() > STALE_HOURS * 3_600_000,
  );
  if (stale.length) {
    items.push({
      id: "touch-stale",
      urgency: "blocked",
      title: `${stale.length} LinkedIn message${stale.length === 1 ? "" : "s"} waiting over a day`,
      detail: `Nothing sends itself here. They expire after ${expireDays()} days and the sequences behind them stop moving.`,
      href,
    });
  } else if (pending.length) {
    items.push({
      id: "touch-pending",
      urgency: "waiting",
      title: `${pending.length} LinkedIn message${pending.length === 1 ? "" : "s"} to send`,
      detail: "Copy, open the profile, paste, send, mark it here. About ten seconds each.",
      href,
    });
  }

  // Expired in the last day, so a founder learns the queue went stale on the
  // day it happened rather than from a gap in the ledger a month later.
  const recentlyExpired = listTouches().filter(
    (t) =>
      t.state === "expired" &&
      now.getTime() - new Date(t.finishedAt ?? t.queuedAt).getTime() < 86_400_000,
  );
  if (recentlyExpired.length) {
    items.push({
      id: "touch-expired",
      urgency: "waiting",
      title: `${recentlyExpired.length} LinkedIn message${recentlyExpired.length === 1 ? "" : "s"} expired unsent`,
      detail: "The words had gone stale, so the sequences moved past them. Nobody was written to.",
      href,
    });
  }

  // The number that actually gets an account restricted is what LinkedIn saw,
  // not what the console queued, so this counts invitations marked sent.
  const counts = queueCounts(now);
  const sent = invitesSentThisWeek(now);
  if (sent >= counts.invitesPerWeek) {
    items.push({
      id: "touch-invite-week",
      urgency: "blocked",
      title: `${sent} invitations sent in seven days`,
      detail: `That is the ${counts.invitesPerWeek} cap. Send more by hand and the account is the thing at risk, and the Sales Navigator seat with it.`,
      href,
    });
  } else if (sent >= counts.invitesPerWeek * 0.8) {
    items.push({
      id: "touch-invite-week-near",
      urgency: "watch",
      title: `${sent} of ${counts.invitesPerWeek} invitations sent this week`,
      detail: "The queue stops feeding at the cap. Messages to existing connections are not affected.",
      href,
    });
  }

  return items;
}
