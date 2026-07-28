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
 */

export function StatBand({ stats }: { stats: Stat[] }) {
  return (
    <section className="mb-10">
      {/* Separate tiles rather than one divided plate: a shared plate needs a
          rule between neighbours, and a rule that is right in one column is in
          the wrong place at two and at five. */}
      {/* Two up on a phone, five across on a desk. One per row on a phone
          turned five numbers into most of a screen, and a glance is the whole
          point of the band. The odd one out takes the full width rather than
          leaving a hole. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {stats.map((stat, i) => {
          const last = i === stats.length - 1 && stats.length % 2 === 1;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className={`card-lift card-glass rounded-card border border-line bg-white px-4 py-3.5 ${
                last ? "col-span-2 lg:col-span-1" : ""
              }`}
            >
              <p className="eyebrow text-slate">{stat.label}</p>
              <p className="figure mt-1.5 text-[26px] text-ink">{stat.value}</p>
              <p className="mt-1 text-[12px] leading-snug text-slate">{stat.note}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
