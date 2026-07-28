import Link from "next/link";
import type { QuickTile } from "@/lib/dashboard";
import { iconByName } from "@/components/icons";

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
 */

const TONE: Record<NonNullable<QuickTile["tone"]>, string> = {
  good: "text-lime",
  warn: "text-amber",
};

export function QuickMenu({ tiles }: { tiles: QuickTile[] }) {
  return (
    <section className="mb-10">
      <p className="eyebrow mb-3 text-slate">Go somewhere</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = iconByName(tile.icon);
          const hasCount = tile.count !== undefined;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="card-lift card-raised flex flex-col rounded-card border border-line bg-white px-4 py-3.5"
            >
              <span className="flex items-start justify-between gap-2">
                <Icon
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
              <span className="mt-0.5 block text-[12px] leading-snug text-slate">
                {tile.note}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
