import { MARK_POLYGONS } from "@/lib/brand";

/**
 * The house loader, from the brand book.
 *
 * The mark fills bottom-up, flashes as it tops out, then repeats. It is the
 * one thing that says "the machine is working" — a sweep, a pipeline run, a
 * save — so it is the only spinner in the console. Nothing else spins.
 *
 * The keyframes live in globals.css rather than in a <style> here, so a screen
 * with several loaders on it ships one copy of the animation instead of one
 * per instance. The clip and gradient ids are static for the same reason: the
 * defs are identical everywhere, so a duplicate id resolves to an identical
 * drawing.
 */
export function Loader({
  size = 20,
  className = "",
  /** On ink, where the empty bars need to be visible against the dark. */
  onDark = false,
  label = "Working",
}: {
  size?: number;
  className?: string;
  onDark?: boolean;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`sa-loader ${className}`}
      style={onDark ? ({ "--sa-track": "#fff" } as React.CSSProperties) : undefined}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id="sa-loader-clip">
          <polygon points={MARK_POLYGONS.top} />
          <polygon points={MARK_POLYGONS.bottom} />
        </clipPath>
        <linearGradient id="sa-loader-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.06" stopColor="var(--color-violet)" stopOpacity="0.9" />
          <stop offset="0.14" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <g clipPath="url(#sa-loader-clip)">
        {/* The empty mark, breathing, so there is something to fill. */}
        <rect className="sa-track" x="0" y="0" width="24" height="24" fill="currentColor" />
        <rect className="sa-fill" x="0" y="24" width="24" height="24" fill="url(#sa-loader-grad)" />
        <rect className="sa-flash" x="0" y="0" width="24" height="24" fill="var(--color-violet)" />
      </g>
    </svg>
  );
}

/**
 * Loader plus a word, for the inside of a button that is mid-run. Sized to sit
 * on one line without changing the button's height.
 */
export function Working({ children, onDark }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader size={17} onDark={onDark} label="" />
      {children}
    </span>
  );
}
