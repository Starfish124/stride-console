import Image from "next/image";
import Link from "next/link";
import type { DraftStatus } from "@/lib/types";
import { NavLinks } from "@/components/NavLinks";
import { BRAND } from "@/lib/brand";

/**
 * The full lockup — mark and wordmark — as the brand ships it, rather than the
 * mark beside the name reset in Playfair. The library's first rule about the
 * logo is not to redraw it, and setting the name in a different face than the
 * artwork uses is a redraw by another route.
 */
export function Wordmark({ height = 26 }: { height?: number }) {
  return (
    <Image
      src="/brand/strideai.png"
      alt="StrideAI"
      width={Math.round(height * (660 / 161))}
      height={height}
      // Next 16 deprecated `priority` for this. The lockup is above the fold on
      // every screen, so it should never be the thing that pops in late.
      preload
      className="w-auto"
      style={{ height }}
    />
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

export function Header() {
  return (
    // No bar at all. A white strip pinned to the top, blurred or not, is the
    // most web-page thing an interface can do. The mark and the avatar sit
    // straight on the paper and scroll away with everything else.
    <header className="pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-1.5 sm:px-6 sm:py-2.5">
        <Link href="/" className="pressable -m-2 p-2" aria-label="Stride console">
          <Wordmark height={24} />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          {/* Phone widths navigate with the bottom tab bar instead. */}
          <span className="hidden items-center gap-4 sm:flex sm:gap-6">
            <NavLinks />
          </span>

        </nav>
      </div>
    </header>
  );
}

/** Dotted concentric radar circles, the brand background device. */
export function Radar({ className }: { className?: string }) {
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
      <rect x="48.5" y="48.5" width="3" height="3" fill={BRAND.indigo} />
    </svg>
  );
}
