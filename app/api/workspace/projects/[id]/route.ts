import fs from "node:fs";
import { NextResponse } from "next/server";
import { deleteProject, getProject } from "@/lib/workspace/store";
import { projectDir } from "@/lib/workspace/files";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  // The directory too: a deleted project that keeps a client's files on disk
  // is not deleted.
  fs.rmSync(projectDir(project), { recursive: true, force: true });
  deleteProject(id);
  return NextResponse.json({ ok: true });
}
