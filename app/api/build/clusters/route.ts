import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { trendRoot } from "@/lib/build/trend";

// The trend engine's CLIP contact sheet, served byte-for-byte — same pattern
// as the Durabo map. The launchd job regenerates it; the console only reads.
export async function GET() {
  try {
    const html = fs.readFileSync(path.join(trendRoot(), "data", "visual_clusters.html"));
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "No contact sheet yet — the engine has not run." }, { status: 404 });
  }
}
