import fs from "node:fs";
import { NextResponse } from "next/server";
import { getClient, newId } from "@/lib/store";
import { getConnector, hasSecret, listProjects, putProject } from "@/lib/workspace/store";
import { ensureProjectDir, projectDir } from "@/lib/workspace/files";
import { WORK_BRANCH, cloneProject } from "@/lib/workspace/git";
import type { Project } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";
// A first clone of a real repo pulls history; give it the clone's own budget.
export const maxDuration = 400;

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
  return NextResponse.json(listProjects(clientId));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

  if (!getClient(clientId)) {
    return NextResponse.json({ error: "No such client." }, { status: 404 });
  }
  if (!name) {
    return NextResponse.json({ error: "A project needs a name." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: newId("proj"),
    clientId,
    name,
    kind: "files",
    createdAt: now,
    updatedAt: now,
  };

  // A repo project clones the client's repo through a git connector instead
  // of starting empty.
  if (body.kind === "repo") {
    const connector = getConnector(
      typeof body.connectorId === "string" ? body.connectorId : "",
    );
    if (!connector || connector.kind !== "git" || !hasSecret(connector.id)) {
      return NextResponse.json(
        { error: "That needs a git connector with its key in place." },
        { status: 400 },
      );
    }
    project.kind = "repo";
    project.repoUrl = connector.repoUrl;
    project.workBranch = WORK_BRANCH;
    const cloned = cloneProject(connector, projectDir(project));
    if (!cloned.ok) {
      // Never leave a half-clone behind a phantom record.
      fs.rmSync(projectDir(project), { recursive: true, force: true });
      return NextResponse.json({ error: cloned.message }, { status: 502 });
    }
    project.defaultBranch = cloned.defaultBranch;
    putProject(project);
    return NextResponse.json(project);
  }

  // Directory first, record second: a failed mkdir must not leave a phantom
  // project in the list.
  try {
    ensureProjectDir(project);
  } catch (err) {
    console.error("workspace/projects:", err);
    return NextResponse.json(
      { error: "The project folder could not be created." },
      { status: 500 },
    );
  }
  putProject(project);
  return NextResponse.json(project);
}
