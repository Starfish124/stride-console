import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addMyth, listMyths, removeMyth } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";

export async function GET() {
  return NextResponse.json(listMyths());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text required." }, { status: 400 });
  const jar = await cookies();
  const myth = addMyth(text, jar.get(FOUNDER_COOKIE)?.value);
  return NextResponse.json(myth);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeMyth(id)) {
    return NextResponse.json({ error: "No such myth." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
