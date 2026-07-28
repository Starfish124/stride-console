import Link from "next/link";
import type { QuickTile } from "@/lib/dashboard";
import { Glyph } from "@/components/icons";

/**
 * The jump-off grid.
 *
 * Sitting under the figures, this is the part that gets tapped: eight places
 * to go, each carrying how much is waiting there. The tiles are raised rather
 * than flat because they are the one thing on this page you act on — the rest
 * of the front page reports, this navigates.
 *
 * Ask Stride has no queue behind it, so it carries its glyph where the others
 * carry a number rather than a zero that would read as work nobody has done.
 *
 * Campaigns is passed in as `leading` rather than built with the rest: its
 * count is the only one that costs a round trip to Linked Helper, so it
 * streams. It stays first in the DOM as well as on screen — reordering with
 * CSS would put a screen reader and the tab key in a different order than the
 * eye, which is a worse trade than a tile that fills in a moment late.
 */

const TONE: Record<NonNullable<QuickTile["tone"]>, string> = {
  good: "text-lime",
  warn: "text-amber",
};

export function QuickTileCard({ tile }: { tile: QuickTile }) {
  const hasCount = tile.count !== undefined;
  return (
    <Link
      href={tile.href}
      className="card-lift card-raised flex flex-col rounded-card border border-line bg-white px-4 py-3.5"
    >
      <span className="flex items-start justify-between gap-2">
        <Glyph
          name={tile.icon}
          size={20}
          className={`shrink-0 ${tile.tone ? TONE[tile.tone] : "text-indigo"}`}
        />
        {hasCount && (
          <span
            className={`figure text-[26px] leading-none ${
              tile.tone ? TONE[tile.tone] : "text-ink"
            }`}
          >
            {tile.count === null ? "—" : tile.count}
          </span>
        )}
      </span>
      <span className="mt-3 block text-[15px] font-semibold leading-snug text-ink">
        {tile.label}
      </span>
      <span className="mt-0.5 block text-[12px] leading-snug text-slate">{tile.note}</span>
    </Link>
  );
}

export function QuickTileSkeleton({ label, icon }: { label: string; icon: string }) {
  return (
    <div
      className="card-raised flex flex-col rounded-card border border-line bg-white px-4 py-3.5"
      aria-busy="true"
    >
      <span className="flex items-start justify-between gap-2">
        <Glyph name={icon} size={20} className="shrink-0 text-indigo" />
        <span className="shimmer block h-[22px] w-8 rounded" />
      </span>
      <span className="mt-3 block text-[15px] font-semibold leading-snug text-ink">{label}</span>
      <span className="shimmer mt-1.5 block h-[11px] w-20 rounded" />
    </div>
  );
}

export function QuickMenu({
  tiles,
  leading,
}: {
  tiles: QuickTile[];
  leading?: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <p className="eyebrow mb-3 text-slate">Go somewhere</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {leading}
        {tiles.map((tile) => (
          <QuickTileCard key={tile.label} tile={tile} />
        ))}
      </div>
    </section>
  );
}
