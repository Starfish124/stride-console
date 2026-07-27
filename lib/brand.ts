// The Stride palette, from the icon library (v1.0 · 2026), which calls itself
// the single source of truth.
//
// This file is that truth for everything written in TypeScript: the playbook
// page, the render pipeline, any component that needs a literal hex. The
// @theme block in globals.css mirrors it, because Tailwind needs its tokens as
// literal CSS and cannot import from here. Those are the only two copies —
// when the library moves, they are the two places to change.

export const BRAND = {
  indigo: "#2E30F8",
  indigoDeep: "#2325C9",
  indigoTint: "#ECECFE",
  violet: "#6D6FFA",
  signal: "#2BA6FF",
  lime: "#76B900",
  amber: "#FFA92B",
  coral: "#FF5A5A",

  ink: "#0A0C14",
  slate: "#5A6172",
  mute: "#8A90A0",
  paper: "#F6F7FA",
  line: "#E5E8F0",
  white: "#FFFFFF",
} as const;

/** What the library says each colour is for. The playbook page reads this. */
export const PALETTE: { name: string; hex: string; note: string }[] = [
  { name: "Stride blue", hex: BRAND.indigo, note: "The brand colour. Buttons, links, the one emphasised word. One accent per surface." },
  { name: "Blue deep", hex: BRAND.indigoDeep, note: "Pressed and hover states." },
  { name: "Blue tint", hex: BRAND.indigoTint, note: "Approved badges, soft fills." },
  { name: "Violet", hex: BRAND.violet, note: "Waiting. Secondary detail on dark, where blue is never used." },
  { name: "Signal", hex: BRAND.signal, note: "Live data, links out to a source." },
  { name: "Lime", hex: BRAND.lime, note: "Good — a number moving the right way. Partner colour." },
  { name: "Amber", hex: BRAND.amber, note: "Warn. Status only, never decoration." },
  { name: "Coral", hex: BRAND.coral, note: "Stop. Status only, never decoration." },
  { name: "Ink", hex: BRAND.ink, note: "Text. Posted badges. The dark surface." },
  { name: "Slate", hex: BRAND.slate, note: "Secondary text." },
  { name: "Mute", hex: BRAND.mute, note: "Labels, captions, the quiet mono voice." },
  { name: "Paper", hex: BRAND.paper, note: "The background everything sits on." },
  { name: "Line", hex: BRAND.line, note: "Borders, dividers, hairlines." },
];

/**
 * The mark, as the library draws it: two bars sheared along a 12:24 diagonal
 * on a 24 grid. Below 20px the library says to drop the offset and use a
 * single bar, because the two-bar mark fills in and turns into a smudge.
 */
export const MARK_POLYGONS = {
  top: "19.43,1 9.75,1 1.37,12.19 10.99,12.19",
  bottom: "22.63,11.41 14.03,11.41 5.33,23 13.97,23",
  small: "21.03,2 11.35,2 2.97,22 12.59,22",
} as const;
