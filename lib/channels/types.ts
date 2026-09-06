/**
 * A channel is a way posts or messages actually reach LinkedIn.
 *
 * There are two, and they are not rivals — they do different halves of the job:
 *
 *   linkedin-api   publishes content the console has written (inert; the
 *                  founders still copy-and-post by hand).
 *   email          the console's own email sequencer, which does its own
 *                  scheduling and its own sending, dry by default.
 *
 * Outbound LinkedIn is deliberately not a channel any more. Linked Helper 2
 * used to be one; it drove a founder's own account, which is the account that
 * gets restricted for automating LinkedIn. Apollo finds the people now and a
 * person sends the message, so there is nothing here to report the health of.
 *
 * Both answer status() the same way, so the console can render "is this thing
 * working" without knowing anything about OAuth or debugger sockets.
 */

export type ChannelId = "linkedin-api" | "email";

/**
 * off      — deliberately not switched on. Not a problem, just not in use.
 * ready    — reachable and usable right now.
 * degraded — reachable, but something it needs is missing or expiring.
 * error    — should be working and is not. This is the one worth a red dot.
 */
export type ChannelState = "off" | "ready" | "degraded" | "error";

export interface ChannelStatus {
  id: ChannelId;
  label: string;
  state: ChannelState;
  /** One sentence a founder can act on, not a stack trace. */
  detail: string;
  /** Anything channel-specific worth showing: accounts, licences, versions. */
  facts?: ChannelFact[];
  checkedAt: string;
}

export interface ChannelFact {
  label: string;
  value: string;
  /** Set when this fact is the reason the channel is degraded. */
  warn?: boolean;
}

export interface Channel {
  id: ChannelId;
  label: string;
  status(): Promise<ChannelStatus>;
}
