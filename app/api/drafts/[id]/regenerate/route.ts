import { NextResponse } from "next/server";
import { getDraft } from "@/lib/store";
import { regenerateDraft } from "@/lib/pipeline/run";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = getDraft(id);
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const updated = await regenerateDraft(draft);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regeneration failed." },
      { status: 500 },
    );
  }
}
