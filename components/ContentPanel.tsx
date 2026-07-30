import Link from "next/link";
import type { Draft, DraftStatus, PostLogEntry } from "@/lib/types";
import { RECIPE_LABELS } from "@/lib/types";
import { sparkPoints, weeklyPosts } from "@/lib/dashboard";
import { Panel } from "@/components/Panel";

/**
 * What has been written, and how often anything goes out.
 *
 * The sparkline annotates the count beside it rather than replacing it. A
 * line with no number on it is a shape, not a measure.
 */

const MARK: Record<DraftStatus, string> = {
  draft: "bg-slate/40",
  approved: "bg-indigo",
  posted: "bg-ink",
};

export function ContentPanel({
  drafts,
  postLog,
  unusedMyths,
}: {
  drafts: Draft[];
  postLog: PostLogEntry[];
  unusedMyths: number;
}) {
  const weeks = weeklyPosts(postLog);
  const posted = weeks.reduce((sum, n) => sum + n, 0);

  return (
    <Panel icon="IconLayers" title="The last runs." href="/library" linkLabel="Library">
      <div className="flex items-center gap-3 px-1 pb-3">
        <span className="figure text-[17px] text-ink">{posted}</span>
        <span className="eyebrow text-slate">posts / 12 wk</span>
        <svg
          aria-hidden
          viewBox="0 0 48 12"
          preserveAspectRatio="none"
          className="h-4 flex-1 text-indigo"
        >
          <polyline
            points={sparkPoints(weeks, 48, 12)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="figure text-[17px] text-ink">{unusedMyths}</span>
        <span className="eyebrow text-slate">myths</span>
      </div>

      {drafts.length === 0 ? (
        <p className="text-[13px] text-slate">No drafts yet.</p>
      ) : (
        <ul className="inset-group">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={`/drafts/${d.id}`}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-paper"
              >
                <span aria-hidden className={`size-1.5 shrink-0 ${MARK[d.status]}`} />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.35] text-ink">
                  {RECIPE_LABELS[d.recipe]}
                </span>
                <span className="eyebrow shrink-0 text-slate">{d.status}</span>
                <span className="num shrink-0 text-[11px] text-slate">
                  {new Date(d.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
