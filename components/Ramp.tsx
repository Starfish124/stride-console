import { MARK_POLYGONS } from "@/lib/brand";

/**
 * The stride accent, traced from the icon library.
 *
 * Five bars sheared along the mark's own diagonal, fading back. The library is
 * strict about it: use once per surface, top-left of a title. So this is not a
 * decoration to sprinkle. One per page, or it stops meaning anything.
 *
 * The polygons are the library's own coordinates rather than a CSS skew, so
 * the accent and the mark are cut at exactly the same angle.
 */
export function Ramp({
  className = "",
  width = 86,
  tone = "currentColor",
}: {
  className?: string;
  width?: number;
  /** Blue by default. The library also ships it in white and partner lime. */
  tone?: string;
}) {
  return (
    <svg
      viewBox="0 0 86 24"
      width={width}
      height={(width / 86) * 24}
      fill={tone}
      className={className}
      aria-hidden="true"
    >
      <polygon points="12,0 42,0 30,24 0,24" />
      <polygon points="43,0 53,0 41,24 31,24" opacity=".62" />
      <polygon points="54,0 64,0 52,24 42,24" opacity=".42" />
      <polygon points="65,0 75,0 63,24 53,24" opacity=".28" />
      <polygon points="76,0 86,0 74,24 64,24" opacity=".18" />
    </svg>
  );
}

/**
 * The mark: two bars, offset. Below about 20px the library says to drop the
 * offset and use a single bar, because the two-bar mark fills in and turns
 * into a smudge.
 *
 * The coordinates are the library's own, not a redraw. The console used to
 * carry a hand-traced approximation with rounded corners, which is exactly
 * what the library's first rule forbids.
 */
export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {size < 20 ? (
        <polygon points={MARK_POLYGONS.small} />
      ) : (
        <>
          <polygon points={MARK_POLYGONS.top} />
          <polygon points={MARK_POLYGONS.bottom} />
        </>
      )}
    </svg>
  );
}
