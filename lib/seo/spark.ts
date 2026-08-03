// Sparkline geometry, and nothing else.
//
// This is its own file because the dashboard is a client component and every
// other module in lib/seo/ reaches the filesystem or the network. Importing
// this from analytics.ts pulled searchConsole.ts, and with it node:fs, into the
// browser bundle — the build caught it, the tests did not, because a test runs
// in node where node:fs is simply there.
//
// Pure, dependency-free, importable from either side.

/**
 * The points of a sparkline path, normalised to a 0..1 box. y is already
 * flipped for SVG, where 0 is the top.
 *
 * A flat series sits on the baseline instead of dividing by a zero range, and a
 * single day is one point rather than a line — a two-point line drawn from one
 * measurement is a trend nobody measured.
 */
export function sparkPoints(values: number[]): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  return values.map((v, i) => ({
    x: values.length === 1 ? 0.5 : i / (values.length - 1),
    y: range === 0 ? 1 : 1 - (v - min) / range,
  }));
}
