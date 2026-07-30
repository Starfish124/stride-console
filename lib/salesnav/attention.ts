// What the email sequencer needs from a person right now.
//
// Same AttentionItem shape the Linked Helper pulse uses, so the dashboard
// keeps one "what needs me" surface rather than growing a second widget with
// its own idea of urgency. Everything here is derived from live state and
// nothing is stored, so none of it can go stale.

import { salesnavStatus } from "./channel.ts";
import { listEnrolments, listSends } from "./store.ts";
import { localDay } from "./config.ts";
import type { AttentionItem } from "../channels/attention.ts";

export function salesnavItems(now: Date = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const s = salesnavStatus(now);
  const href = "/salesnav";

  if (s.stop) {
    items.push({
      id: "salesnav-stopped",
      urgency: "blocked",
      title: "Email sending is stopped",
      detail: `${s.stop.by} stopped it. ${s.stop.reason ?? "Resume it or the sequences stay frozen."}`,
      href,
    });
  }

  if (s.stuck > 0) {
    items.push({
      id: "salesnav-stuck",
      urgency: "blocked",
      title: `${s.stuck} send${s.stuck === 1 ? "" : "s"} in an unknown state`,
      detail: "Claimed twice with no answer from the provider. Check whether it actually went out.",
      href,
    });
  }

  const gated = listEnrolments().filter(
    (e) => e.state === "paused" && (e.stoppedReason ?? "").startsWith("The voice gate"),
  );
  if (gated.length) {
    items.push({
      id: "salesnav-gated",
      urgency: "blocked",
      title: `${gated.length} step${gated.length === 1 ? "" : "s"} refused by the voice gate`,
      detail: "The copy has to change before those sequences move again.",
      href,
    });
  }

  if (s.mode === "live" && s.replyDetection === "manual") {
    items.push({
      id: "salesnav-manual-replies",
      urgency: "blocked",
      title: "Live sending with manual reply detection",
      detail:
        "Nothing here can see an email reply yet. Move a client's stage the moment they answer, or the sequence keeps writing.",
      href,
    });
  }

  const today = localDay(now);
  const bounced = listSends().filter(
    (r) => r.state === "failed" && localDay(new Date(r.claimedAt)) === today,
  );
  if (bounced.length >= 3) {
    items.push({
      id: "salesnav-bounces",
      urgency: "waiting",
      title: `${bounced.length} sends failed today`,
      detail: "That many in one day is usually the sending domain, not the addresses.",
      href,
    });
  }

  const noAddress = listEnrolments().filter(
    (e) => e.state === "stopped" && (e.stoppedReason ?? "").includes("email address"),
  );
  if (noAddress.length) {
    items.push({
      id: "salesnav-no-address",
      urgency: "waiting",
      title: `${noAddress.length} enrolment${noAddress.length === 1 ? "" : "s"} stopped for a missing address`,
      detail: "Fill in the email on the client record and enrol again.",
      href,
    });
  }

  if (!s.stop && s.sentToday >= s.dailyCap * 0.8 && s.sentToday < s.dailyCap) {
    items.push({
      id: "salesnav-cap",
      urgency: "watch",
      title: `${s.sentToday} of ${s.dailyCap} sent today`,
      detail: "The rest of today's queue goes tomorrow.",
      href,
    });
  }

  return items;
}
