import { NextResponse } from "next/server";
import { getProject, putProject } from "@/lib/workspace/store";
import { projectDir } from "@/lib/workspace/files";
import { commitAndPush } from "@/lib/workspace/git";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Push the project's work branch back to the client's repo, for their review. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  if (project.kind !== "repo") {
    return NextResponse.json(
      { error: "Only a repo project has somewhere to push." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 200)
      : "Work from the Stride console";

  const result = commitAndPush(project, projectDir(project), message);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });
  putProject({ ...project, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, message: result.message });
}
