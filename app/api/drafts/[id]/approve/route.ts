import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDraft, saveDraft } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = getDraft(id);
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const blocking = Object.values(draft.lint).reduce((n, r) => n + r.errors, 0);
  if (blocking > 0) {
    return NextResponse.json(
      { error: `The voice gate found ${blocking} blocking violation${blocking === 1 ? "" : "s"}. Fix them first.` },
      { status: 409 },
    );
  }
  const jar = await cookies();
  draft.status = "approved";
  draft.approvedBy = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";
  draft.approvedAt = new Date().toISOString();
  saveDraft(draft);
  return NextResponse.json(draft);
}
