import { NextResponse } from "next/server";
import { setChecklistItem } from "@/lib/store";

/** Check a checklist item off, or back on. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: string;
    done?: boolean;
  };
  if (!body.itemId || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "itemId and done required." }, { status: 400 });
  }
  const event = setChecklistItem(id, body.itemId, body.done);
  if (!event) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(event);
}
