import { cache } from "react";
import { readAiDrafts, readCampaignsView, readLicenceDays } from "./linkedHelper";
import { listReplies } from "../outreach/replies.ts";
import { lintMessage } from "../outreach/lint.ts";
import { salesnavItems } from "../salesnav/attention.ts";

/**
 * What Linked Helper needs from a founder right now.
 *
 * A dashboard that only reports numbers makes you work out what to do about
 * them. This works it out instead: it reads the machine's state and returns
 * the things that are waiting on a person, worst first.
 *
 * Everything here is derived. Nothing is stored, so nothing can go stale.
 */

export type Urgency = "blocked" | "waiting" | "watch";

export interface AttentionItem {
  id: string;
  urgency: Urgency;
  /** The thing that is true. */
  title: string;
  /** What to do about it, in one sentence. */
  detail: string;
  href?: string;
}

const RANK: Record<Urgency, number> = { blocked: 0, waiting: 1, watch: 2 };

export interface LhPulse {
  reachable: boolean;
  campaigns: number;
  running: number;
  /** Campaigns whose armed steps can actually message someone. */
  sending: number;
  people: number;
  dailyMax: number | null;
  licenceDaysLeft: number | null;
  items: AttentionItem[];
}

/**
 * Deduplicated per render.
 *
 * The front page reads the pulse for its figures and the LinkedIn panel reads
 * it again for what needs a person, which was two round trips to the bridge —
 * and two timeouts stacked back to back when it was wedged. React's cache
 * collapses them to one call per request, and callers stay unaware.
 */
export const readPulse = cache(uncachedReadPulse);

async function uncachedReadPulse(): Promise<LhPulse> {
  const [view, { drafts }, licenceDaysLeft] = await Promise.all([
    readCampaignsView(),
    readAiDrafts(),
    readLicenceDays(),
  ]);
  const replies = listReplies();

  const account = view.accounts[0];
  const campaigns = account?.campaigns ?? [];
  const running = campaigns.filter((c) => c.state === "running");
  const sending = running.filter((c) =>
    c.steps.some((s) => s.armed && /Invite|Message|InMail/i.test(s.type ?? "")),
  );

  const items: AttentionItem[] = [];
  const problem = view.offline ?? view.unavailable;

  if (problem) {
    items.push({
      id: "offline",
      urgency: "blocked",
      title: "Linked Helper is out of reach",
      detail: problem,
    });
  }

  const unhandled = replies.filter((r) => !r.handled);
  if (unhandled.length > 0) {
    items.push({
      id: "replies",
      urgency: "blocked",
      title: `${unhandled.length} repl${unhandled.length === 1 ? "y" : "ies"} waiting`,
      detail: "Somebody answered. Nothing else in the machine matters more than this.",
      href: "/outreach",
    });
  }

  if (drafts.length > 0) {
    const failing = drafts.filter(
      (d) => lintMessage(d.text, "message", { isFirstTouch: /_1$/.test(d.field) }).errors > 0,
    ).length;
    items.push({
      id: "drafts",
      urgency: failing > 0 ? "blocked" : "waiting",
      title: `${drafts.length} message${drafts.length === 1 ? "" : "s"} written by the AI`,
      detail:
        failing > 0
          ? `${failing} would fail the voice gate. Read them before Linked Helper sends them.`
          : "All clean against the voice guide. Worth a read before they go.",
      href: "/outreach",
    });
  }

  /* A campaign marked running whose sending steps are all drafts will sit
     there looking busy and reach nobody. It is the failure most likely to
     waste a week without anyone noticing. */
  const stalled = running.filter((c) => c.armedSteps < c.stepCount && !sending.includes(c));
  for (const campaign of stalled) {
    items.push({
      id: `stalled:${campaign.uuid}`,
      urgency: "waiting",
      title: `"${campaign.name}" is running but cannot send`,
      detail: `${campaign.armedSteps} of ${campaign.stepCount} steps are armed. The rest are drafts, so it will research and stop.`,
      href: "/campaigns",
    });
  }

  const emptyRunning = running.filter((c) => c.people === 0);
  for (const campaign of emptyRunning) {
    items.push({
      id: `empty:${campaign.uuid}`,
      urgency: "waiting",
      title: `"${campaign.name}" has nobody in it`,
      detail: "Give it an audience in Linked Helper, or it has nothing to work on.",
      href: "/campaigns",
    });
  }

  if (campaigns.length === 0 && !problem) {
    items.push({
      id: "no-campaigns",
      urgency: "waiting",
      title: "No campaigns yet",
      detail: "Make one from the campaigns page. It arrives paused, so nothing sends.",
      href: "/campaigns",
    });
  }

  if (licenceDaysLeft !== null && licenceDaysLeft <= 7) {
    items.push({
      id: "licence",
      urgency: licenceDaysLeft <= 2 ? "blocked" : "waiting",
      title: `Licence runs out in ${licenceDaysLeft} day${licenceDaysLeft === 1 ? "" : "s"}`,
      detail: "Campaigns stop when it lapses. Renewing is not something the console can do.",
    });
  }

  if (sending.length > 0) {
    const reach = sending.reduce((n, c) => n + c.people, 0);
    const days = account?.dailyMax ? Math.ceil(reach / account.dailyMax) : null;
    items.push({
      id: "sending",
      urgency: "watch",
      title: `${reach.toLocaleString("en-GB")} people are in reach`,
      detail: days
        ? `At ${account?.dailyMax} a day that runs about ${days} day${days === 1 ? "" : "s"}.`
        : "No daily cap is set, which is worth fixing before this runs.",
      href: "/campaigns",
    });
  }

  // The email sequencer folds into the same list rather than owning a second
  // one. "What needs a person right now" has to be one surface or it is none.
  items.push(...salesnavItems());

  items.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]);

  return {
    reachable: !problem,
    campaigns: campaigns.length,
    running: running.length,
    sending: sending.length,
    people: account?.peopleCollected ?? 0,
    dailyMax: account?.dailyMax ?? null,
    licenceDaysLeft,
    items,
  };
}
