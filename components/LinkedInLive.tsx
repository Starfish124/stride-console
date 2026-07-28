import { readPulse } from "@/lib/channels/attention";
import { campaignsTile, linkedInStat } from "@/lib/dashboard";
import { StatTile, StatTileSkeleton } from "@/components/StatBand";
import { QuickTileCard, QuickTileSkeleton } from "@/components/QuickMenu";
import { IconPipeline } from "@/components/icons";

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

/** The panel's own placeholder: its heading, and the shape of what is coming. */
export function LhPulseSkeleton() {
  return (
    <section className="mb-10" aria-busy="true">
      <div className="mb-4 flex items-center gap-3">
        <IconPipeline size={22} className="shrink-0 text-indigo" />
        <h2 className="display text-[22px] text-ink">The LinkedIn machine.</h2>
      </div>
      <div className="card-glass mb-3 flex items-center gap-3 rounded-card border border-line bg-white px-5 py-4">
        <span className="size-2.5 shrink-0 rounded-full bg-slate/30" />
        <span className="shimmer h-[13px] flex-1 rounded" />
      </div>
      <div className="card-glass flex items-start gap-3 rounded-card border border-line bg-white px-5 py-4">
        <span className="shimmer h-[13px] w-2/3 rounded" />
      </div>
    </section>
  );
}
