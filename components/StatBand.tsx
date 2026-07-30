import Link from "next/link";
import type { Stat } from "@/lib/dashboard";

/**
 * The five numbers the console opens with, one per channel.
 *
 * Measures only, and every one a link — a number a founder cannot act on is
 * decoration. What is waiting on a person is the quick menu's job, one row
 * down, which is why nothing here is coloured for urgency.
 *
 * The rule worth naming: a figure that is not known prints an em dash rather
 * than a zero, since an unreachable machine and an idle one look identical as
 * "0" and mean opposite things.
 *
 * Four of the five come off local disk. The fifth costs a round trip to Linked
 * Helper, so it is passed in as a child and streamed: the band paints at once
 * and that tile fills in behind it.
 */

export function StatTile({ stat, className = "" }: { stat: Stat; className?: string }) {
  return (
    <Link
      href={stat.href}
      className={`card-lift card-glass rounded-card border border-line bg-white px-3 py-2.5 ${className}`}
    >
      <p className="eyebrow text-[10px] text-slate">{stat.label}</p>
      <p className="figure mt-1 text-[21px] text-ink">{stat.value}</p>
      {/* Two lines is the ceiling. A tile in a grid is as tall as the wordiest
          note in its row, so one long sentence used to add height to four
          tiles that had nothing to say. */}
      <p className="mt-0.5 line-clamp-1 text-[11px] leading-[1.3] text-slate sm:line-clamp-2">
        {stat.note}
      </p>
    </Link>
  );
}

/** The same box, holding its place while the real number is on its way. */
export function StatTileSkeleton({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`card-glass rounded-card border border-line bg-white px-3 py-2.5 ${className}`}
      aria-busy="true"
    >
      <p className="eyebrow text-[10px] text-slate">{label}</p>
      {/* Sized to the digits it is about to be replaced by, so the tile does
          not change height when the number lands. */}
      <span className="shimmer mt-1.5 block h-[18px] w-14 rounded" />
      <span className="shimmer mt-1.5 block h-[11px] w-24 rounded" />
    </div>
  );
}

export function StatBand({
  stats,
  children,
}: {
  stats: Stat[];
  children?: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      {/* Separate tiles rather than one divided plate: a shared plate needs a
          rule between neighbours, and a rule that is right in one column is in
          the wrong place at two and at five. */}
      {/* Two up on a phone, five across on a desk. One per row on a phone
          turned five numbers into most of a screen, and a glance is the whole
          point of the band. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatTile key={stat.label} stat={stat} />
        ))}
        {children}
      </div>
    </section>
  );
}
