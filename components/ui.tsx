import Link from "next/link";
import type { DraftStatus } from "@/lib/types";

export function Wordmark({ size = "text-xl" }: { size?: string }) {
  return (
    <span className={`display ${size} leading-none`}>
      <span className="text-indigo">Stride</span>{" "}
      <span className="text-slate">AI</span>
    </span>
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

export function Header({ founder }: { founder?: string }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold text-ink hover:text-indigo">
            Console
          </Link>
          <Link
            href="/events"
            className="text-sm font-semibold text-ink hover:text-indigo"
          >
            Events
          </Link>
          <Link
            href="/settings"
            className="text-sm font-semibold text-ink hover:text-indigo"
          >
            Settings
          </Link>
          {founder ? <span className="eyebrow text-slate">{founder}</span> : null}
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
