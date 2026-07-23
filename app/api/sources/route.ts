import { NextResponse } from "next/server";
import { listSources, saveSources } from "@/lib/store";
import type { SourceEntry } from "@/lib/types";

export async function GET() {
  return NextResponse.json(listSources());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as SourceEntry[] | null;
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a source array." }, { status: 400 });
  }
  const cleaned = body
    .filter((s) => s && typeof s.url === "string" && s.url.trim())
    .map((s, i) => ({
      id: s.id || `src_${i}_${Date.now().toString(36)}`,
      name: (s.name || s.url).trim(),
      url: s.url.trim(),
      kind: s.kind === "page" ? ("page" as const) : ("rss" as const),
      tier: ([1, 2, 3].includes(Number(s.tier)) ? Number(s.tier) : 2) as 1 | 2 | 3,
    }));
  saveSources(cleaned);
  return NextResponse.json(cleaned);
}
