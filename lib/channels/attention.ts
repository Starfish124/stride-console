import { cache } from "react";
import { listReplies } from "../outreach/replies.ts";
import { salesnavItems } from "../salesnav/attention.ts";
import { readLeads, contactableCount } from "../leads.ts";

/**
 * What needs a founder right now, across every channel.
 *
 * A dashboard that only reports numbers makes you work out what to do about
 * them. This works it out instead: it reads the machine's state and returns
 * the things that are waiting on a person, worst first.
 *
 * Everything here is derived. Nothing is stored, so nothing can go stale.
 *
 * This used to be Linked Helper's pulse and nothing else. LH2 is gone: the
 * outbound half is now Apollo for finding people and a founder's own hands for
 * sending, so the only things that can be "out of reach" are local files. That
 * is why nothing here can fail any more, and why the reachable flag went with
 * the bridge that justified it.
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

export interface Pulse {
  /** People held in the lead book. */
  leads: number;
  /** How many of those Apollo has a verified email for. */
  contactable: number;
  /** How many the saved Apollo search matches in total, held or not. */
  pool: number;
  items: AttentionItem[];
}

/**
 * Deduplicated per render.
 *
 * The front page reads the pulse for its figures and the leads panel reads it
 * again for what needs a person. React's cache collapses them to one call per
 * request, and callers stay unaware. Cheap now that it is all local disk, but
 * the panels still each want their own copy and this keeps that honest.
 */
export const readPulse = cache(uncachedReadPulse);

async function uncachedReadPulse(): Promise<Pulse> {
  const book = readLeads();
  const replies = listReplies();
  const items: AttentionItem[] = [];

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

  if (book.leads.length === 0) {
    items.push({
      id: "no-leads",
      urgency: "waiting",
      title: "No leads pulled yet",
      detail: "Build a list in Apollo against the ICP and export it, or there is nobody to write to.",
      href: "/leads",
    });
  } else {
    const contactable = contactableCount(book.leads);
    const missing = book.leads.length - contactable;
    if (missing > 0) {
      items.push({
        id: "leads-no-email",
        urgency: "watch",
        title: `${missing} lead${missing === 1 ? " has" : "s have"} no email`,
        detail: "LinkedIn is the only way to reach them. The sequencer cannot pick them up.",
        href: "/leads",
      });
    }
  }

  // The email sequencer folds into the same list rather than owning a second
  // one. "What needs a person right now" has to be one surface or it is none.
  items.push(...salesnavItems());

  items.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]);

  return {
    leads: book.leads.length,
    contactable: contactableCount(book.leads),
    pool: book.poolSize,
    items,
  };
}
