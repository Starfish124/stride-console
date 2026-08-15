"use client";

import NumberFlow from "@number-flow/react";

/**
 * A stat figure that rolls to its value like an odometer instead of blinking.
 *
 * Only plain numbers animate. The band's em-dash-for-unknown rule and
 * formatted strings ("€ 2.1k", "12 / 30") print as they are — a tile must
 * never re-do arithmetic the dashboard already did, and NumberFlow animating
 * half a string would read as a glitch, not a detail.
 */
export function NumberFigure({ value }: { value: string }) {
  const numeric = /^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : null;
  if (numeric === null) return <>{value}</>;
  return <NumberFlow value={numeric} animated respectMotionPreference />;
}
