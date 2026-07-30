import Link from "next/link";
import type { QuickTile } from "@/lib/dashboard";
import { Glyph, IconChevron } from "@/components/icons";

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

/** 44px is the smallest thing a thumb hits reliably, so it is the floor. */
const ROW = "flex min-h-[44px] items-center gap-3 px-4 py-2.5";

export function QuickTileCard({ tile }: { tile: QuickTile }) {
  const hasCount = tile.count !== undefined;
  return (
    <Link href={tile.href} className={`pressable ${ROW} bg-white active:bg-paper`}>
      <Glyph
        name={tile.icon}
        size={19}
        className={`shrink-0 ${tile.tone ? TONE[tile.tone] : "text-indigo"}`}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{tile.label}</span>
        {/* The note only earns its line where the count means somebody is
            holding something up. A labelled row explains itself. */}
        {tile.tone && (
          <span className="block truncate text-[12px] leading-snug text-slate">{tile.note}</span>
        )}
      </span>

      {hasCount && (
        <span className={`num text-[15px] ${tile.tone ? TONE[tile.tone] : "text-slate"}`}>
          {tile.count === null ? "—" : tile.count}
        </span>
      )}
      <IconChevron size={16} className="shrink-0 text-line" />
    </Link>
  );
}

export function QuickTileSkeleton({ label, icon }: { label: string; icon: string }) {
  return (
    <div className={`${ROW} bg-white`} aria-busy="true">
      <Glyph name={icon} size={19} className="shrink-0 text-indigo" />
      <span className="min-w-0 flex-1 text-[15px] text-ink">{label}</span>
      <span className="shimmer block h-[15px] w-6 rounded" />
      <IconChevron size={16} className="shrink-0 text-line" />
    </div>
  );
}

/**
 * The jump-off list.
 *
 * One grouped plate with hairlines between rows, the way Settings.app does it,
 * rather than eight floating cards on a grey field. A card grid is a web
 * dashboard idiom: it spends a lot of screen saying very little, and eight
 * shadows fighting each other is most of why this page did not feel like it
 * belonged on a home screen.
 *
 * Two columns of plates on a desk, because one column of eight rows across a
 * wide screen is a stripe of white with a lot of nothing beside it.
 */
export function QuickMenu({
  tiles,
  leading,
}: {
  tiles: QuickTile[];
  leading?: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="inset-group lg:columns-2 lg:gap-0 lg:[&>*]:break-inside-avoid">
        {leading}
        {tiles.map((tile) => (
          <QuickTileCard key={tile.label} tile={tile} />
        ))}
      </div>
    </section>
  );
}
