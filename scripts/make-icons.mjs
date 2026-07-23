// Generates the PWA icons from the brand mark: an upward triangle, indigo on
// light, with the same resvg engine the design pipeline uses.
// Run once (outputs are committed): node scripts/make-icons.mjs

import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const INDIGO = "#3D44D9";
const PAPER = "#F4F4F8";

const OUT = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

/** Upward triangle centered on a paper square. pad = fraction of empty edge. */
function markSvg(size, pad) {
  const w = size * (1 - 2 * pad);
  const h = w * 0.88;
  const top = (size - h) / 2;
  const bottom = top + h;
  const cx = size / 2;
  const points = `${cx},${top} ${cx - w / 2},${bottom} ${cx + w / 2},${bottom}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${PAPER}"/>
  <polygon points="${points}" fill="${INDIGO}"/>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, pad: 0.2 },
  { file: "icon-512.png", size: 512, pad: 0.2 },
  // Maskable: the safe zone is the inner 80%, so the mark pulls in further.
  { file: "icon-maskable-512.png", size: 512, pad: 0.28 },
  // iOS rounds this itself; no transparency, full-bleed background.
  { file: "apple-touch-icon.png", size: 180, pad: 0.22 },
];

for (const { file, size, pad } of ICONS) {
  const png = new Resvg(markSvg(size, pad)).render().asPng();
  fs.writeFileSync(path.join(OUT, file), png);
  console.log(`${file}  ${(png.length / 1024).toFixed(1)} KB`);
}
