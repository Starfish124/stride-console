// Regenerate every app icon from the one master mark.
//
//   node scripts/make-icons.mjs
//
// Master: brand/stride-mark.png. Change that file, rerun this, commit the
// result — the icons can then never drift from the logo, and nobody has to
// remember which sizes iOS wants.
//
// Sizing differs by target on purpose:
//   standard   the library is explicit: mark at 46% of the tile, optically
//              centred. Bigger than that and it stops looking like the brand
//   maskable   Android crops to a circle, so the mark must survive a 20% bite
//   iOS        full-bleed, fully opaque; the system applies its own squircle,
//              and renders any alpha it finds as black

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MASTER = path.join(ROOT, "brand", "stride-mark.png");

/** Brand paper, matching background_color in the manifest. */
const PAPER = { r: 0xf6, g: 0xf7, b: 0xfa, alpha: 1 };

/** The mark's own blue, sampled from the master. Brighter than UI indigo. */
const MARK = { r: 0x2e, g: 0x30, b: 0xf8 };

/**
 * The mark, trimmed and cut out onto transparency.
 *
 * The master ships as flat blue on pure white. Cropping alone is not enough —
 * the white between and around the two bars would then sit as a visible block
 * on the paper background. So each pixel is un-blended instead: it is some mix
 * of mark-blue over white, and solving that mix for its coverage recovers a
 * clean alpha, anti-aliased edges included.
 *
 * Red is the channel to solve on: it swings 255 -> 48 across the mark, where
 * blue barely moves (255 -> 247) and would amplify noise into garbage.
 */
async function markOnly() {
  const { data, info } = await sharp(MASTER)
    .trim({ threshold: 20 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const span = 255 - MARK.r;
  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const coverage = Math.min(1, Math.max(0, (255 - data[i]) / span));
    rgba[o] = MARK.r;
    rgba[o + 1] = MARK.g;
    rgba[o + 2] = MARK.b;
    rgba[o + 3] = Math.round(coverage * 255);
  }

  return {
    data: await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer(),
    info: { width: info.width, height: info.height },
  };
}

/** Mark centred on paper, scaled so its long edge is `coverage` of the canvas. */
async function icon(size, coverage, mark) {
  const box = Math.round(size * coverage);
  const scale = box / Math.max(mark.info.width, mark.info.height);
  const w = Math.max(1, Math.round(mark.info.width * scale));
  const h = Math.max(1, Math.round(mark.info.height * scale));

  const resized = await sharp(mark.data).resize(w, h, { fit: "fill" }).toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: resized, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toBuffer();
}

/**
 * An .ico wrapping PNG entries — the modern container, understood by every
 * browser we care about. sharp cannot write .ico, and the format is small
 * enough that taking a dependency for it would be the worse trade.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = [];
  let offset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((e) => e.png)]);
}

const written = [];
function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  written.push(`  ${path.relative(ROOT, file).padEnd(48)} ${(buffer.length / 1024).toFixed(1)} KB`);
}

const mark = await markOnly();
console.log(`master  brand/stride-mark.png`);
console.log(`mark    ${mark.info.width}x${mark.info.height} after trim\n`);

// Progressive web app.
write(path.join(ROOT, "public/icons/icon-192.png"), await icon(192, 0.46, mark));
write(path.join(ROOT, "public/icons/icon-512.png"), await icon(512, 0.46, mark));

// Android crops maskable icons to a circle: keep the mark inside the safe zone.
write(path.join(ROOT, "public/icons/icon-maskable-512.png"), await icon(512, 0.38, mark));

// iOS home screen for the web app, and the native shell's icon. Both opaque.
const appleTouch = await sharp(await icon(180, 0.46, mark)).flatten({ background: PAPER }).png().toBuffer();
write(path.join(ROOT, "public/icons/apple-touch-icon.png"), appleTouch);

const ios1024 = await sharp(await icon(1024, 0.46, mark)).flatten({ background: PAPER }).png().toBuffer();
write(path.join(ROOT, "ios/Assets.xcassets/AppIcon.appiconset/icon-1024.png"), ios1024);

// Browser tab.
const icoEntries = [];
for (const size of [16, 32, 48, 256]) {
  icoEntries.push({ size, png: await icon(size, 0.68, mark) });
}
write(path.join(ROOT, "app/favicon.ico"), buildIco(icoEntries));

console.log(written.join("\n"));
