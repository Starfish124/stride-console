import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { GRAPH_DIR } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

/**
 * The graph's own interactive page, as graphify drew it. Served through the
 * console so it sits behind the login like everything else — it is a map of
 * client work.
 */
export async function GET() {
  const file = path.join(GRAPH_DIR, "out", "graph.html");
  try {
    return new NextResponse(fs.readFileSync(file, "utf8"), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(
      "<p style=\"font:16px -apple-system;padding:2rem;color:#5A6172\">No graph yet. Build one from the Graph page.</p>",
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
