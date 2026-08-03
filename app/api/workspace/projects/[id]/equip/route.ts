import { NextResponse } from "next/server";
import { getProject } from "@/lib/workspace/store";
import { equipped, listLibrary, syncEquipment } from "@/lib/workspace/library";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  return NextResponse.json({ library: listLibrary(), equipped: equipped(project) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clean = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  try {
    const result = syncEquipment(project, {
      skills: clean(body.skills),
      agents: clean(body.agents),
    });
    return NextResponse.json({ equipped: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The tooling could not be installed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
