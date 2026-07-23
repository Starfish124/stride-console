import { NextResponse } from "next/server";
import { getDraft, saveDraft } from "@/lib/store";
import { lint } from "@/lib/pipeline/lint";
import type { Destination } from "@/lib/types";

const DESTINATIONS: Destination[] = ["page", "founderA", "founderB"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = getDraft(id);
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(draft);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = getDraft(id);
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    destination?: Destination;
    text?: string;
  };
  if (!body.destination || !DESTINATIONS.includes(body.destination) || typeof body.text !== "string") {
    return NextResponse.json({ error: "destination and text required." }, { status: 400 });
  }
  draft.variants[body.destination] = body.text;
  draft.lint[body.destination] = lint(body.text);
  if (draft.status === "approved") draft.status = "draft";
  saveDraft(draft);
  return NextResponse.json(draft);
}
