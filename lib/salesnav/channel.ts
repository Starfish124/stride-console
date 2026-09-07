// The sequencer as a channel, so it answers "is this thing working" the same
// way the publishing API does.
//
// Off is not an error. A dry run is the deliberate default, so it reports
// "off by design" with the exact environment to set, in the same shape
// lib/channels/linkedinApi.ts uses.

import { dailyCap, domainCap, liveBlockers, salesnavMode, sendWindow } from "./config.ts";
import { channelsOf } from "./enrol.ts";
import { sentToday } from "./guard.ts";
import { hardStop, listEnrolments, listSends, listSuppressions, runnerState } from "./store.ts";
import { getSequence } from "../outreach/sequence.ts";
import type { Channel, ChannelStatus } from "../channels/types.ts";

/**
 * Whether a reply can be detected without a person.
 *
 * Resend inbound needs MX records on a subdomain. Until those exist, a reply
 * is only noticed when a founder moves the client's stage, and a sequencer
 * that silently keeps emailing somebody who already answered is the worst
 * thing this could do. So it says which mode it is in rather than implying
 * the safe one.
 */
export function replyDetection(): "inbound" | "manual" {
  return process.env.SALESNAV_INBOUND === "on" ? "inbound" : "manual";
}

export interface SalesnavStatus {
  mode: "dry" | "live";
  blockers: string[];
  stop: ReturnType<typeof hardStop>;
  sentToday: number;
  dailyCap: number;
  domainCap: number;
  window: string;
  active: number;
  paused: number;
  suppressed: number;
  stuck: number;
  nextDueAt: string | null;
  replyDetection: "inbound" | "manual";
  lastTickAt: string | null;
}

/**
 * A LinkedIn enrolment is not this channel's business. Without this filter,
 * "In a sequence" on the email card counted every active enrolment in the
 * console, LinkedIn included, which was invisible while email had zero
 * enrolments and became actively misleading the moment it did not.
 */
function emailEnrolments(enrolments: ReturnType<typeof listEnrolments>): ReturnType<typeof listEnrolments> {
  return enrolments.filter((e) => {
    const sequence = getSequence(e.sequenceId);
    return sequence ? channelsOf(sequence.steps).email : false;
  });
}

export function salesnavStatus(now: Date = new Date()): SalesnavStatus {
  const mode = salesnavMode();
  const enrolments = emailEnrolments(listEnrolments());
  const active = enrolments.filter((e) => e.state === "active");
  const due = active.map((e) => e.dueAt).sort();
  const window = sendWindow();

  return {
    mode,
    blockers: liveBlockers(),
    stop: hardStop(),
    sentToday: sentToday(now, mode === "dry").total,
    dailyCap: dailyCap(),
    domainCap: domainCap(),
    window: `${window.label}, days ${window.days.join(",")}`,
    active: active.length,
    paused: enrolments.filter((e) => e.state === "paused").length,
    suppressed: listSuppressions().length,
    stuck: listSends().filter((s) => s.state === "stuck").length,
    nextDueAt: due[0] ?? null,
    replyDetection: replyDetection(),
    lastTickAt: runnerState().lastTickAt ?? null,
  };
}

export const emailChannel: Channel = {
  id: "email",
  label: "Email sequencer",

  async status(): Promise<ChannelStatus> {
    const checkedAt = new Date().toISOString();
    const s = salesnavStatus();
    const facts = [
      { label: "Sent today", value: `${s.sentToday} of ${s.dailyCap}`, warn: s.sentToday >= s.dailyCap },
      { label: "In a sequence", value: String(s.active) },
      { label: "Suppressed", value: String(s.suppressed) },
      { label: "Reply detection", value: s.replyDetection, warn: s.replyDetection === "manual" && s.mode === "live" },
      { label: "Last tick", value: s.lastTickAt ?? "—" },
    ];

    if (s.stop) {
      return {
        id: "email",
        label: "Email sequencer",
        state: "degraded",
        detail: `Stopped by ${s.stop.by}. ${s.stop.reason ?? "Nothing will send until it is resumed."}`,
        facts,
        checkedAt,
      };
    }
    if (s.mode === "dry") {
      return {
        id: "email",
        label: "Email sequencer",
        state: "off",
        detail: `Off by design. Dry run only. Set ${s.blockers.join(", ")} to send for real.`,
        facts,
        checkedAt,
      };
    }
    // Three failures in a row is a provider problem, not a bad address.
    const recent = listSends().filter((r) => !r.dryRun).slice(0, 3);
    if (recent.length === 3 && recent.every((r) => r.state === "failed")) {
      return {
        id: "email",
        label: "Email sequencer",
        state: "error",
        detail: `The last three sends all failed. ${recent[0].problem ?? ""}`.trim(),
        facts,
        checkedAt,
      };
    }
    if (s.sentToday >= s.dailyCap) {
      return {
        id: "email",
        label: "Email sequencer",
        state: "degraded",
        detail: `Today's cap of ${s.dailyCap} is spent. The rest goes tomorrow.`,
        facts,
        checkedAt,
      };
    }
    return {
      id: "email",
      label: "Email sequencer",
      state: "ready",
      detail: `Live. ${s.sentToday} of ${s.dailyCap} sent today, window ${s.window}.`,
      facts,
      checkedAt,
    };
  },
};
