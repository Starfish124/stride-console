import { NextResponse } from "next/server";
import { newId } from "@/lib/store";
import { deleteNote, getProject, listNotes, putNote } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!getProject(projectId)) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  return NextResponse.json(listNotes(projectId));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!getProject(projectId)) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  if (!title) return NextResponse.json({ error: "A note needs a title." }, { status: 400 });

  const id = typeof body.id === "string" && body.id ? body.id : newId("wnote");
  const note = { id, projectId, title, body: text, updatedAt: new Date().toISOString() };
  putNote(note);
  return NextResponse.json(note);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
  deleteNote(id);
  return NextResponse.json({ ok: true });
}
