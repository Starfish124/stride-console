import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordReply, secretMatches } from "@/lib/outreach/replies";
import { allowRequest } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Where Linked Helper reports back.
 *
 * This route is public by necessity: LH2 posts to it from the Mac, but the
 * console is served over Tailscale Funnel, so the internet can reach it too.
 * The secret in the path query is the only guard, which is why it is compared
 * in constant time and why the endpoint is rate limited whether or not the
 * secret is right.
 *
 * It answers 200 to anything it accepts and never explains a rejection, so a
 * caller learns nothing about why a guess failed.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // allowRequest(ip, now, max, windowMs). Passing 120 as `now` pinned the
  // clock, so no recorded hit ever aged out and the intended 120-per-minute
  // became a permanent 60,000-request counter that blocked the IP until the
  // next restart.
  if (!allowRequest(`hook:${ip}`, Date.now(), 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const offered =
    request.nextUrl.searchParams.get("token") ?? request.headers.get("x-stride-token");
  if (!secretMatches(offered)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // LH2 has been known to post form-encoded bodies; keep whatever arrives.
    body = { unparsed: await request.text().catch(() => "") };
  }

  const reply = recordReply(body);
  return NextResponse.json({ ok: true, id: reply.id });
}

/** LH2 pings the URL when you save it. Confirm without leaking anything. */
export async function GET(request: NextRequest) {
  const offered =
    request.nextUrl.searchParams.get("token") ?? request.headers.get("x-stride-token");
  if (!secretMatches(offered)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ready: true });
}
