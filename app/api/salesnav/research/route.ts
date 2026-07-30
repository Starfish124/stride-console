import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClient } from "@/lib/store";
import { researchAccount } from "@/lib/salesnav/research";
import { researchFor } from "@/lib/salesnav/store";

export const dynamic = "force-dynamic";
/** The deep pass reads pages and thinks about them. It takes minutes, not seconds. */
export const maxDuration = 800;

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  return NextResponse.json({ research: researchFor(clientId) ?? null });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { clientId?: string; url?: string };
  const client = getClient(body.clientId ?? "");
  if (!client) return NextResponse.json({ error: "No such client." }, { status: 400 });

  const result = await researchAccount({
    clientId: client.id,
    name: client.name,
    company: client.company,
    email: client.email,
    url: body.url,
  });

  if (!result.ok) return NextResponse.json({ error: result.problem }, { status: 502 });
  // The record carries its own fabricatedSource violations. A dropped citation
  // is reported, never quietly removed.
  return NextResponse.json({ research: result.record });
}
