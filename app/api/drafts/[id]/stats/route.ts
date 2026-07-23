import { NextResponse } from "next/server";
import { recordPostStats } from "@/lib/store";
import type { Destination } from "@/lib/types";

const DESTINATIONS: Destination[] = ["page", "founderA", "founderB"];
const FIELDS = ["impressions", "reactions", "comments", "saves"] as const;

/** Record manually entered LinkedIn numbers for a posted destination. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const destination = body.destination as Destination;
  if (!DESTINATIONS.includes(destination)) {
    return NextResponse.json({ error: "destination required." }, { status: 400 });
  }
  const stats = { impressions: 0, reactions: 0, comments: 0, saves: 0 };
  for (const field of FIELDS) {
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json(
        { error: `${field} must be a number, 0 or higher.` },
        { status: 400 },
      );
    }
    stats[field] = Math.round(value);
  }
  const entry = recordPostStats(id, destination, stats);
  if (!entry) {
    return NextResponse.json(
      { error: "Mark the draft posted first." },
      { status: 404 },
    );
  }
  return NextResponse.json(entry);
}
