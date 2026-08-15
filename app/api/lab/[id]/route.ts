import { NextResponse } from "next/server";
import { destroySandbox } from "@/lib/lab/lab";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = destroySandbox(id);
  if (!result.ok) return NextResponse.json({ error: result.problem }, { status: 404 });
  return NextResponse.json({ ok: true });
}
