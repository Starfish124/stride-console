// Live status of the trend engine, read straight from its data directory —
// the same way lib/durabo/io.ts reads the discovery repo. Every field is
// nullable: a missing file prints an em dash, never an invented number.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TrendItem {
  title: string;
  growth: number | null;
}

export interface TrendStatus {
  freshAt: string | null; // ISO mtime of the newest feed
  top: TrendItem[];
  insights: string | null; // head of insights_latest.md
  hasClusters: boolean;
}

export function trendRoot(): string {
  return process.env.TREND_DIR ?? path.join(os.homedir(), "durabo-trend-engine");
}

export function readTrendStatus(): TrendStatus {
  const dataDir = path.join(trendRoot(), "data");
  const out: TrendStatus = { freshAt: null, top: [], insights: null, hasClusters: false };

  try {
    const feeds = fs
      .readdirSync(dataDir)
      .filter((f) => /^trend_feed_.*\.json$/.test(f))
      .sort();
    const newest = feeds[feeds.length - 1];
    if (newest) {
      const file = path.join(dataDir, newest);
      out.freshAt = fs.statSync(file).mtime.toISOString();
      const feed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      const items = Array.isArray(feed)
        ? feed
        : Array.isArray((feed as { items?: unknown[] }).items)
          ? (feed as { items: unknown[] }).items
          : [];
      out.top = items.slice(0, 5).map((raw) => {
        const r = raw as Record<string, unknown>;
        const title = typeof r.entity_id === "string" ? r.entity_id : "—";
        const growth = typeof r.growth_ratio === "number" ? r.growth_ratio : null;
        return { title, growth };
      });
    }
  } catch {
    // No feed yet, or unreadable — the nulls above already say so.
  }

  try {
    const md = fs.readFileSync(path.join(dataDir, "insights_latest.md"), "utf8");
    out.insights = md.split("\n").slice(0, 10).join("\n").trim() || null;
  } catch {
    // absent — stays null
  }

  out.hasClusters = fs.existsSync(path.join(dataDir, "visual_clusters.html"));
  return out;
}
