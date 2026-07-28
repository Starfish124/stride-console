import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addNote, listNotes, removeNote, updateNote } from "@/lib/store";
import { NOTE_LANES, type NoteLane } from "@/lib/types";
import { FOUNDER_COOKIE } from "@/lib/auth";

function lane(value: unknown): NoteLane | undefined {
  return NOTE_LANES.includes(value as NoteLane) ? (value as NoteLane) : undefined;
}

export async function GET() {
  return NextResponse.json(listNotes());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Nothing to note." }, { status: 400 });
  const jar = await cookies();
  const note = addNote({
    text,
    lane: lane(body.lane),
    area: typeof body.area === "string" && body.area.trim() ? body.area.trim() : undefined,
    // Whose idea it was. Both founders share the board, so it matters who to ask.
    by: jar.get(FOUNDER_COOKIE)?.value,
  });
  return NextResponse.json(note);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which note." }, { status: 400 });

  const patch: { text?: string; lane?: NoteLane; area?: string } = {};
  if (typeof body.text === "string" && body.text.trim()) patch.text = body.text.trim();
  const moved = lane(body.lane);
  if (moved) patch.lane = moved;
  if (typeof body.area === "string") patch.area = body.area.trim() || undefined;

  const note = updateNote(id, patch);
  if (!note) return NextResponse.json({ error: "No such note." }, { status: 404 });
  return NextResponse.json(note);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeNote(id)) {
    return NextResponse.json({ error: "No such note." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
