import { NextResponse } from "next/server";
import { addEvent } from "@/lib/store";

/** Create an event. The T-6-weeks checklist is generated from the date. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";
  const capacity = Number(body.capacity);
  if (!title || !venue) {
    return NextResponse.json({ error: "Title and venue required." }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "A real date required." }, { status: 400 });
  }
  if (!Number.isFinite(capacity) || capacity < 1) {
    return NextResponse.json({ error: "Capacity must be 1 or higher." }, { status: 400 });
  }
  const event = addEvent({ title, date, venue, capacity: Math.round(capacity) });
  return NextResponse.json(event);
}
