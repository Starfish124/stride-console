import { NextResponse } from "next/server";
import { brain } from "@/lib/brain/store";
import { retrieve } from "@/lib/brain/retrieve";

export const dynamic = "force-dynamic";

/**
 * Search the brain. Hybrid: FTS5 keyword rank fused with local-embedding
 * cosine when the embedder is warm, keyword-only when it is not. Behind the
 * console login like everything else.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  try {
    if (!q) return NextResponse.json({ memories: brain().recent(30) });
    const passages = await retrieve(q, { limit: 30 });
    return NextResponse.json({ memories: passages.map((p) => p.memory) });
  } catch {
    return NextResponse.json({ memories: [] });
  }
}
