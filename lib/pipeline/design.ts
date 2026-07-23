// Stage 4 — branded visuals. satori renders object trees (no JSX, so Node tests
// can run this directly) to SVG, resvg rasterizes to PNG, pdf-lib assembles
// carousels into a LinkedIn document. 1200x1500, 4:5 portrait.

import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import {
  isEventRecipe,
  type EventRecipeId,
  type MythSlide,
  type RecipeId,
} from "../types.ts";

export const CANVAS = { width: 1200, height: 1500 } as const;

const C = {
  indigo: "#3D44D9",
  indigoTint: "#E9EAFB",
  ink: "#101116",
  slate: "#5E647B",
  paper: "#F4F4F8",
  line: "#E3E4EC",
  midnight: "#101126",
  white: "#FFFFFF",
} as const;

// ---------- fonts (woff, NOT woff2 — satori can't read woff2) ----------

interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700 | 800;
  style: "normal";
}

let fontCache: SatoriFont[] | undefined;

function loadFont(pkg: string, file: string): Buffer {
  if (!file.endsWith(".woff")) throw new Error(`satori needs .woff, got ${file}`);
  // Walk up from cwd so this works from the project root and from bundled
  // server output alike. No dynamic require: Turbopack can't resolve those.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const full = path.join(dir, "node_modules", pkg, "files", file);
    if (fs.existsSync(full)) return fs.readFileSync(full);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Font not found: ${pkg}/files/${file}`);
}

export function loadFonts(): SatoriFont[] {
  if (fontCache) return fontCache;
  fontCache = [
    { name: "Archivo", data: loadFont("@fontsource/archivo", "archivo-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Archivo", data: loadFont("@fontsource/archivo", "archivo-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Archivo", data: loadFont("@fontsource/archivo", "archivo-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "IBM Plex Mono", data: loadFont("@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff"), weight: 500, style: "normal" },
  ];
  return fontCache;
}

// ---------- satori node helpers (plain object trees, no JSX) ----------

type Node = { type: string; props: Record<string, unknown> };

function el(
  type: string,
  style: Record<string, unknown>,
  children?: Node | Node[] | string,
): Node {
  return { type, props: { style, children } };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

const mono = (size: number, color: string, extra: Record<string, unknown> = {}) => ({
  fontFamily: "IBM Plex Mono",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: size * 0.14,
  fontSize: size,
  color,
  ...extra,
});

/** Dotted concentric radar circles around a solid indigo square, as a data-URI SVG. */
function radarSvg(size: number, stroke: string): string {
  const c = size / 2;
  const rings = [0.48, 0.36, 0.24, 0.12]
    .map(
      (r) =>
        `<circle cx="${c}" cy="${c}" r="${size * r}" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="2 9"/>`,
    )
    .join("");
  const sq = size * 0.032;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${rings}<rect x="${c - sq / 2}" y="${c - sq / 2}" width="${sq}" height="${sq}" fill="${C.indigo}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function radar(size: number, stroke: string, position: Record<string, unknown>): Node {
  return {
    type: "img",
    props: {
      src: radarSvg(size, stroke),
      width: size,
      height: size,
      style: { position: "absolute", ...position },
    },
  };
}

function wordmark(size: number, aiColor: string): Node {
  return el("div", { display: "flex", alignItems: "baseline" }, [
    el("span", { fontWeight: 800, fontSize: size, letterSpacing: size * -0.02, color: C.indigo }, "Stride"),
    el("span", { fontWeight: 800, fontSize: size, letterSpacing: size * -0.02, color: aiColor, marginLeft: size * 0.28 }, "AI"),
  ]);
}

function frame(bg: string, borderColor: string, children: Node[]): Node {
  return el(
    "div",
    {
      width: CANVAS.width,
      height: CANVAS.height,
      display: "flex",
      flexDirection: "column",
      backgroundColor: bg,
      border: `2px solid ${borderColor}`,
      padding: 84,
      fontFamily: "Archivo",
      position: "relative",
    },
    children,
  );
}

// ---------- templates ----------

export function tldrTree(weekNumber: number, titles: string[]): Node {
  const items = titles.slice(0, 7).map((title, i) =>
    el(
      "div",
      {
        display: "flex",
        alignItems: "flex-start",
        paddingTop: 26,
        paddingBottom: 26,
        borderBottom: `2px solid ${C.line}`,
      },
      [
        el("span", mono(30, C.indigo, { marginRight: 36, marginTop: 8, flexShrink: 0 }), String(i + 1).padStart(2, "0")),
        el("span", { fontWeight: 700, fontSize: 40, color: C.ink, lineHeight: 1.25 }, truncate(title, 82)),
      ],
    ),
  );
  return frame(C.paper, C.line, [
    radar(560, C.slate, { right: -160, top: -160, opacity: 0.16 }),
    el("div", mono(26, C.slate), `THE STRIDE TLDR — WEEK ${weekNumber}`),
    el(
      "div",
      { fontWeight: 800, fontSize: 76, letterSpacing: -1.5, color: C.ink, marginTop: 28, marginBottom: 30, display: "flex" },
      "This week, in one line each.",
    ),
    el("div", { display: "flex", flexDirection: "column", flexGrow: 1 }, items),
    el(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40 },
      [wordmark(40, C.slate), el("span", mono(22, C.slate), "LINKS IN THE FIRST COMMENT")],
    ),
  ]);
}

/** Headline words; the word wrapped in *stars* (or the first noun-ish word) goes indigo. */
function headlineWords(headline: string, baseColor: string): Node[] {
  const words = headline.split(/\s+/).filter(Boolean);
  let markedIndex = words.findIndex((w) => /^\*.+\*[.,]?$/.test(w));
  if (markedIndex < 0) markedIndex = words.length > 1 ? 1 : 0;
  return words.map((w, i) => {
    const clean = w.replace(/\*/g, "");
    return el(
      "span",
      {
        fontWeight: 800,
        fontSize: 104,
        letterSpacing: -2,
        lineHeight: 1.06,
        color: i === markedIndex ? C.indigo : baseColor,
        marginRight: 24,
      },
      clean,
    );
  });
}

export function newsTree(headline: string, stat: string | undefined, dateLabel: string): Node {
  return frame(C.midnight, C.midnight, [
    radar(620, C.slate, { left: -200, bottom: -200, opacity: 0.28 }),
    el("div", mono(26, C.slate), `BREAKING THIS WEEK — ${dateLabel}`),
    el(
      "div",
      { display: "flex", flexWrap: "wrap", marginTop: 120, flexGrow: 1, alignContent: "flex-start" },
      headlineWords(truncate(headline, 90), C.white),
    ),
    ...(stat
      ? [el("div", mono(48, C.indigoTint, { marginBottom: 56 }), stat.toUpperCase())]
      : []),
    el("div", { display: "flex" }, [wordmark(40, C.slate)]),
  ]);
}

export function mythCoverTree(seq: number): Node {
  return frame(C.paper, C.line, [
    radar(560, C.slate, { right: -160, top: -160, opacity: 0.16 }),
    el("div", mono(26, C.slate), `AI IMPLEMENTATION — N.${String(seq).padStart(2, "0")}`),
    el(
      "div",
      { display: "flex", flexWrap: "wrap", marginTop: 140, flexGrow: 1, alignContent: "flex-start" },
      [
        el("span", { fontWeight: 800, fontSize: 132, letterSpacing: -2.6, color: C.ink, marginRight: 30 }, "Myth"),
        el("span", { fontWeight: 800, fontSize: 132, letterSpacing: -2.6, color: C.ink, marginRight: 30 }, "vs"),
        el("span", { fontWeight: 800, fontSize: 132, letterSpacing: -2.6, color: C.indigo, marginRight: 30 }, "reality."),
      ],
    ),
    el("div", mono(26, C.slate, { marginBottom: 40 }), "WHAT WE HEAR — WHAT WE SEE"),
    el("div", { display: "flex" }, [wordmark(40, C.slate)]),
  ]);
}

export function mythSlideTree(index: number, text: string): Node {
  const nn = String(index).padStart(2, "0");
  return frame(C.midnight, C.midnight, [
    el("div", mono(30, C.slate), `MYTH — ${nn}`),
    el(
      "div",
      { fontWeight: 800, fontSize: 84, letterSpacing: -1.6, lineHeight: 1.15, color: C.slate, marginTop: 120, display: "flex", flexGrow: 1 },
      `“${truncate(text.replace(/[.]$/, ""), 130)}.”`,
    ),
    el("div", { display: "flex" }, [wordmark(40, C.slate)]),
  ]);
}

export function realitySlideTree(index: number, text: string): Node {
  const nn = String(index).padStart(2, "0");
  const words = truncate(text, 170).split(/\s+/).filter(Boolean);
  // One key phrase in indigo: the opening words, up to ~24 characters.
  let budget = 24;
  const nodes = words.map((w) => {
    const key = budget > 0;
    budget -= w.length + 1;
    return el(
      "span",
      {
        fontWeight: 800,
        fontSize: 72,
        letterSpacing: -1.4,
        lineHeight: 1.18,
        color: key ? C.indigo : C.ink,
        marginRight: 20,
      },
      w,
    );
  });
  return frame(C.paper, C.line, [
    el("div", mono(30, C.indigo), `REALITY — ${nn}`),
    el(
      "div",
      { display: "flex", flexWrap: "wrap", marginTop: 120, flexGrow: 1, alignContent: "flex-start" },
      nodes,
    ),
    el("div", { display: "flex" }, [wordmark(40, C.slate)]),
  ]);
}

export function mythClosingTree(): Node {
  return frame(C.midnight, C.midnight, [
    radar(760, C.slate, { right: -240, top: -240, opacity: 0.3 }),
    el("div", { display: "flex", flexGrow: 1, flexDirection: "column", justifyContent: "center" }, [
      el("div", { display: "flex" }, [wordmark(96, "#9AA0B5")]),
      el("div", { fontWeight: 400, fontSize: 40, color: "#9AA0B5", marginTop: 32, display: "flex" }, "AI solutions, built to scale."),
    ]),
    el("div", mono(26, C.slate), "STRIDE-AI.COM"),
  ]);
}

const EVENT_EYEBROWS: Record<EventRecipeId, string> = {
  eventAnnounce: "THE ANNOUNCEMENT",
  eventLineup: "THE LINEUP",
  eventReminder: "ONE WEEK OUT",
  eventRecap: "THE RECAP",
};

/** 1 Min AI Pitch poster: paper, big ink headline, one indigo word, event date. */
export function eventTree(
  recipe: EventRecipeId,
  headline: string,
  stat: string | undefined,
  dateLabel: string | undefined,
): Node {
  return frame(C.paper, C.line, [
    radar(620, C.slate, { right: -180, top: -180, opacity: 0.16 }),
    el(
      "div",
      mono(26, C.slate),
      `1 MIN AI PITCH — ${EVENT_EYEBROWS[recipe]}${dateLabel ? ` — ${dateLabel}` : ""}`,
    ),
    el(
      "div",
      { display: "flex", flexWrap: "wrap", marginTop: 120, flexGrow: 1, alignContent: "flex-start" },
      headlineWords(truncate(headline, 90), C.ink),
    ),
    ...(stat
      ? [el("div", mono(48, C.indigo, { marginBottom: 56 }), stat.toUpperCase())]
      : []),
    el(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "center" },
      [wordmark(40, C.slate), el("span", mono(22, C.slate), "SIGNUP LINK IN THE FIRST COMMENT")],
    ),
  ]);
}

// ---------- rendering ----------

export async function renderPng(tree: Node): Promise<Buffer> {
  const svg = await satori(tree as never, {
    width: CANVAS.width,
    height: CANVAS.height,
    fonts: loadFonts() as never,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CANVAS.width } });
  return Buffer.from(resvg.render().asPng());
}

export async function assemblePdf(pngs: Buffer[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const png of pngs) {
    const image = await doc.embedPng(png);
    const page = doc.addPage([CANVAS.width, CANVAS.height]);
    page.drawImage(image, { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height });
  }
  return Buffer.from(await doc.save());
}

export interface RenderSpec {
  recipe: RecipeId;
  weekNumber: number;
  titles?: string[];
  imageHeadline: string;
  imageStat?: string;
  slides?: MythSlide[];
  mythSeq?: number;
  dateLabel?: string;
}

export interface RenderOutput {
  images: string[];
  pdf?: string;
}

/** Renders a draft's visuals into outDir. Returns filenames relative to outDir. */
export async function renderToDir(spec: RenderSpec, outDir: string): Promise<RenderOutput> {
  fs.mkdirSync(outDir, { recursive: true });
  if (spec.recipe === "tldr") {
    const png = await renderPng(tldrTree(spec.weekNumber, spec.titles ?? []));
    fs.writeFileSync(path.join(outDir, "tldr.png"), png);
    return { images: ["tldr.png"] };
  }
  if (spec.recipe === "news") {
    const dateLabel =
      spec.dateLabel ??
      new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
    const png = await renderPng(newsTree(spec.imageHeadline, spec.imageStat, dateLabel));
    fs.writeFileSync(path.join(outDir, "news.png"), png);
    return { images: ["news.png"] };
  }
  if (isEventRecipe(spec.recipe)) {
    const png = await renderPng(
      eventTree(spec.recipe, spec.imageHeadline, spec.imageStat, spec.dateLabel),
    );
    fs.writeFileSync(path.join(outDir, "event.png"), png);
    return { images: ["event.png"] };
  }
  // Myth carousel: cover + myth/reality pairs + closing slide, plus a PDF.
  const slides = spec.slides ?? [];
  const pngs: Buffer[] = [await renderPng(mythCoverTree(spec.mythSeq ?? 1))];
  for (let i = 0; i < slides.length; i++) {
    pngs.push(await renderPng(mythSlideTree(i + 1, slides[i].myth)));
    pngs.push(await renderPng(realitySlideTree(i + 1, slides[i].reality)));
  }
  pngs.push(await renderPng(mythClosingTree()));
  const images: string[] = [];
  pngs.forEach((png, i) => {
    const name = `myth-${String(i + 1).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(outDir, name), png);
    images.push(name);
  });
  const pdf = await assemblePdf(pngs);
  fs.writeFileSync(path.join(outDir, "myth.pdf"), pdf);
  return { images, pdf: "myth.pdf" };
}
