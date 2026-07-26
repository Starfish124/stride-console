import Link from "next/link";
import type { DraftStatus } from "@/lib/types";
import { NavLinks } from "@/components/NavLinks";

/** The mark, then the name. Playfair, with "AI" carrying the italic accent. */
export function Wordmark({ size = "text-xl" }: { size?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StrideMark />
      <span className={`display ${size} leading-none text-ink`}>
        Stride <span className="accent">AI</span>
      </span>
    </span>
  );
}

/** The two offset bars of the Stride logo, drawn rather than fetched. */
export function StrideMark({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <g className="text-indigo" fill="currentColor">
        <path d="M9.6 2.5h10.2a1 1 0 0 1 .82 1.57L15.1 12.2a1 1 0 0 1-.82.43H4.08a1 1 0 0 1-.82-1.57l5.52-8.13a1 1 0 0 1 .82-.43Z" />
        <path d="M9.72 11.37h10.2a1 1 0 0 1 .82 1.57l-5.52 8.13a1 1 0 0 1-.82.43H4.2a1 1 0 0 1-.82-1.57l5.52-8.13a1 1 0 0 1 .82-.43Z" />
      </g>
    </svg>
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
          <StrideMark className="size-[26px]" />
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
      <rect x="48.5" y="48.5" width="3" height="3" fill="#3D44D9" />
    </svg>
  );
}
