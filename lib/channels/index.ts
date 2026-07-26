import { linkedinEnabled } from "./linkedinApi.ts";
import { linkedHelperChannel } from "./linkedHelper.ts";
import type { Channel, ChannelStatus } from "./types.ts";

export type { Channel, ChannelId, ChannelState, ChannelStatus, ChannelFact } from "./types.ts";

/**
 * The LinkedIn publishing API, still deliberately inert. It reports its own
 * state so the console can say "off, on purpose" rather than staying silent
 * about a whole half of the channel.
 */
export const linkedinApiChannel: Channel = {
  id: "linkedin-api",
  label: "LinkedIn publishing API",

  async status(): Promise<ChannelStatus> {
    const checkedAt = new Date().toISOString();
    return linkedinEnabled()
      ? {
          id: "linkedin-api",
          label: "LinkedIn publishing API",
          state: "ready",
          detail: "Credentials are set. A founder still approves, then publishes — nothing auto-posts.",
          checkedAt,
        }
      : {
          id: "linkedin-api",
          label: "LinkedIn publishing API",
          state: "off",
          detail: "Off by design. Posts are copied out of the console by hand. Set STRIDE_LINKEDIN=on plus the LINKEDIN_* credentials to change that.",
          checkedAt,
        };
  },
};

export const channels: Channel[] = [linkedHelperChannel, linkedinApiChannel];

/**
 * Status of every channel. One slow or broken channel must never hide the
 * others, so failures are caught per channel and reported in place.
 */
export async function channelHealth(): Promise<ChannelStatus[]> {
  return Promise.all(
    channels.map(async (channel) => {
      try {
        return await channel.status();
      } catch (err) {
        return {
          id: channel.id,
          label: channel.label,
          state: "error" as const,
          detail: err instanceof Error ? err.message : String(err),
          checkedAt: new Date().toISOString(),
        };
      }
    }),
  );
}
