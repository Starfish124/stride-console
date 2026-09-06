import Image from "next/image";
import type { DraftStatus } from "@/lib/types";
import { WorkspaceToolbar } from "@/components/WorkspaceToolbar";

import { BRAND } from "@/lib/brand";

/**
 * The full lockup — mark and wordmark — as the brand ships it, rather than the
 * mark beside the name reset in Playfair. The library's first rule about the
 * logo is not to redraw it, and setting the name in a different face than the
 * artwork uses is a redraw by another route.
 */
export function Wordmark({ height = 26 }: { height?: number }) {
  // The dark variant is the same artwork with the ink recoloured to the dark
  // theme's ink — the mark itself is untouched, so this is a reversed lockup,
  // not a redraw. Both render and CSS picks one; a ~22KB PNG is cheaper than
  // a flash of the wrong logo while script decides.
  const common = {
    width: Math.round(height * (660 / 161)),
    height,
    // Next 16 deprecated `priority` for this. The lockup is above the fold on
    // every screen, so it should never be the thing that pops in late.
    preload: true,
    style: { height },
  } as const;
  return (
    <>
      <Image alt="StrideAI" src="/brand/strideai.png" className="w-auto dark:hidden" {...common} />
      <Image alt="StrideAI" src="/brand/strideai-dark.png" className="hidden w-auto dark:block" {...common} />
    </>
  );
}

const STATUS_STYLES: Record<DraftStatus, string> = {
  draft: "bg-white text-slate border-line",
  approved: "bg-indigo-tint text-indigo border-indigo-tint",
  posted: "bg-ink text-white border-ink",
};

export function StatusBadge({ status }: { status: DraftStatus }) {
  return (
    <span
      className={`eyebrow inline-block rounded-full border px-3 py-1 ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function Header() { return <WorkspaceToolbar />; }

/** Dotted concentric radar circles, the brand background device. */
export function Radar({
  className,
  dot = true,
}: {
  className?: string;
  /** The centre blip. Off when something real — a logo, a mark — sits on
   *  the same centre point already; two things marking one spot is a glitch,
   *  not an accent. */
  dot?: boolean;
}) {
  const rings = [46, 34, 22, 10];
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      {rings.map((r) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r}
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="0.7 3"
        />
      ))}
      {dot && <rect x="48.5" y="48.5" width="3" height="3" fill={BRAND.indigo} />}
    </svg>
  );
}
