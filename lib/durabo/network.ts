// The who-feeds-whom network, straight from the dossiers.
//
// Edges come from each person's MAP-DATA `in_from` / `out_to` prose by
// spotting other roster names in it. Free text in, so this is deliberately
// recognition not parsing: a name match makes an edge, everything else stays
// what it is — prose on the dossier. Empty dossiers render as open rings,
// the map's version of Jort's red gaps: a visible hole is data.

import fs from "node:fs";
import path from "node:path";
import { duraboRoot, readRoster } from "./io.ts";
import type { RosterRow } from "./parse.ts";

export interface MapData {
  status?: string;
  in_from?: string;
  out_to?: string;
  external?: string;
  [k: string]: unknown;
}

export function readMapData(slug: string): MapData {
  try {
    const md = fs.readFileSync(path.join(duraboRoot(), "employees", slug, `${slug}.md`), "utf8");
    const block = md.match(/<!-- MAP-DATA:START -->[\s\S]*?```json\n([\s\S]*?)```/);
    return block ? (JSON.parse(block[1]) as MapData) : {};
  } catch {
    return {};
  }
}

export interface NetLink {
  from: string; // slug
  to: string; // slug
}

/**
 * Names in prose → directed edges. `in_from` text naming X makes X→me,
 * `out_to` text naming X makes me→X. Matching is on first name or full name,
 * word-bounded, case-insensitive — first names are unique on this roster
 * (Erik Smit / Eric Markus differ in spelling).
 */
export function matchEdges(rows: RosterRow[], dataBySlug: Record<string, MapData>): NetLink[] {
  const links = new Map<string, NetLink>();
  const finders = rows.map((r) => ({
    slug: r.slug,
    re: new RegExp(
      `\\b(${r.name.replace(/[.*+?^${}()|[\]\\]/g, "")}|${r.name.split(" ")[0]})\\b`,
      "i",
    ),
  }));
  for (const row of rows) {
    const data = dataBySlug[row.slug];
    if (!data) continue;
    for (const [field, dir] of [
      ["in_from", "in"],
      ["out_to", "out"],
    ] as const) {
      const text = typeof data[field] === "string" ? (data[field] as string) : "";
      if (!text) continue;
      for (const f of finders) {
        if (f.slug === row.slug || !f.re.test(text)) continue;
        const link = dir === "in" ? { from: f.slug, to: row.slug } : { from: row.slug, to: f.slug };
        links.set(`${link.from}→${link.to}`, link);
      }
    }
  }
  return [...links.values()];
}

export interface Network {
  nodes: (RosterRow & { filled: boolean; external: string })[];
  links: NetLink[];
}

export function buildNetwork(): Network {
  const rows = readRoster();
  const dataBySlug: Record<string, MapData> = {};
  for (const r of rows) dataBySlug[r.slug] = readMapData(r.slug);
  return {
    nodes: rows.map((r) => {
      const d = dataBySlug[r.slug];
      const filled = Object.entries(d).some(
        ([k, v]) => !["status", "excluded", "sharp"].includes(k) && typeof v === "string" && v.trim() !== "",
      );
      return { ...r, filled, external: typeof d.external === "string" ? d.external : "" };
    }),
    links: matchEdges(rows, dataBySlug),
  };
}
