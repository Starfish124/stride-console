import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { markPosted } from "@/lib/pipeline/publish";
import { FOUNDER_COOKIE } from "@/lib/auth";
import type { Destination } from "@/lib/types";

const DESTINATIONS: Destination[] = ["page", "founderA", "founderB"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { destination?: Destination };
  if (!body.destination || !DESTINATIONS.includes(body.destination)) {
    return NextResponse.json({ error: "destination required." }, { status: 400 });
  }
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";
  const draft = markPosted(id, body.destination, who);
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(draft);
}
