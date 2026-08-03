import { NextResponse } from "next/server";
import { listSessionNotes } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

/**
 * What the graph has been fed. Behind the console login — the ingest side
 * lives at /api/graph/ingest on its own path precisely so that opening that
 * path to token callers does not open this one to everybody.
 */
export async function GET() {
  return NextResponse.json(listSessionNotes());
}
