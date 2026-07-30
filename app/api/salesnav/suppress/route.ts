import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { listSuppressions, removeSuppression, suppress } from "@/lib/salesnav/suppress";
import type { Suppression } from "@/lib/salesnav/types";

export const dynamic = "force-dynamic";

const REASONS: Suppression["reason"][] = [
  "unsubscribed",
  "bounced",
  "complained",
  "blocked",
  "invalid",
];

export async function GET() {
  return NextResponse.json({ suppressions: listSuppressions() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
    reason?: string;
    note?: string;
  };
  const address = (body.address ?? "").trim();
  if (!address) return NextResponse.json({ error: "Which address." }, { status: 400 });

  const reason = REASONS.find((r) => r === body.reason) ?? "blocked";
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";
  return NextResponse.json({ suppression: suppress({ address, reason, by: who, note: body.note }) });
}

/** Taking somebody off the list is the risky direction, so it records who. */
export async function DELETE(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Which address." }, { status: 400 });
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";
  const removed = removeSuppression(address, who);
  if (!removed) return NextResponse.json({ error: "That address was not on the list." }, { status: 404 });
  return NextResponse.json({ ok: true, removedBy: who });
}
