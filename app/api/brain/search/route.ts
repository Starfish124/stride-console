import { NextResponse } from "next/server";
import { brain } from "@/lib/brain/store";

export const dynamic = "force-dynamic";

/** Search the brain. Behind the console login like everything else. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  try {
    const memories = q ? brain().search(q, 30) : brain().recent(30);
    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json({ memories: [] });
  }
}
