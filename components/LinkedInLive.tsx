import { readPulse } from "@/lib/channels/attention";
import { campaignsTile, linkedInStat } from "@/lib/dashboard";
import { StatTile, StatTileSkeleton } from "@/components/StatBand";
import { QuickTileCard, QuickTileSkeleton } from "@/components/QuickMenu";
import { Panel } from "@/components/Panel";

/**
 * The three pieces of the dashboard that have to ask Linked Helper first.
 *
 * Everything else on the front page comes off local disk in about a
 * millisecond. These need the bridge, so they are their own components behind
 * their own Suspense boundaries: the page ships immediately and each of these
 * arrives when it arrives, instead of the whole screen waiting on the slowest
 * thing on it.
 *
 * readPulse is cached per request, so all three share one round trip no matter
 * how many boundaries they sit behind.
 */

export async function LinkedInStatTile() {
  const pulse = await readPulse().catch(() => null);
  // Unreachable and idle are different facts. Null carries the first one all
  // the way to the tile, which prints a dash instead of inventing a zero.
  const live = pulse?.reachable ? pulse : null;
  return (
    <StatTile
      stat={linkedInStat(live?.people ?? null, live?.running ?? null)}
      className="col-span-2 lg:col-span-1"
    />
  );
}

export function LinkedInStatTileSkeleton() {
  return <StatTileSkeleton label="Queued on LinkedIn" className="col-span-2 lg:col-span-1" />;
}

export async function CampaignsQuickTile() {
  const pulse = await readPulse().catch(() => null);
  const live = pulse?.reachable ? pulse : null;
  return <QuickTileCard tile={campaignsTile(live?.running ?? null)} />;
}

export function CampaignsQuickTileSkeleton() {
  return <QuickTileSkeleton label="Campaigns" icon="IconPipeline" />;
}

/**
 * The panel's own placeholder.
 *
 * Same frame, same title bar: the heading is known, so it is real content
 * rather than a grey bar. Only the two lines that need the bridge shimmer,
 * and the slide's height comes from the rail, so nothing moves when the real
 * panel lands.
 */
export function LhPulseSkeleton() {
  return (
    <Panel icon="IconPipeline" title="The LinkedIn machine." href="/campaigns" linkLabel="Open">
      <div aria-busy="true">
        <div className="mb-2.5 flex items-center gap-3 px-1">
          <span className="size-2.5 shrink-0 rounded-full bg-slate/30" />
          <span className="shimmer h-[13px] flex-1 rounded" />
        </div>
        <div className="rounded-card border border-line bg-white px-4 py-3">
          <span className="shimmer block h-[13px] w-2/3 rounded" />
        </div>
      </div>
    </Panel>
  );
}
