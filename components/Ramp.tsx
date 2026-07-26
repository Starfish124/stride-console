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
 */
export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  if (size < 20) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
        <polygon points="9,2 22,2 15,22 2,22" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <polygon points="10.5,2 23,2 17,11.5 4.5,11.5" />
      <polygon points="7,12.5 19.5,12.5 13.5,22 1,22" />
    </svg>
  );
}
