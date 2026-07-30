import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { decodeAddress, suppress, verifyUnsubToken } from "@/lib/salesnav/suppress";

export const dynamic = "force-dynamic";

/**
 * The way out. Public by necessity: the person clicking it has no cookie and
 * never will, and a mail client following the RFC 8058 header is not a browser.
 *
 * The token is an HMAC of the address, so nothing is stored to make this work
 * and nobody can unsubscribe somebody else. Both verbs are idempotent, because
 * a One-Click header is often followed twice and being told "already done" is
 * not an error to the person who asked.
 */
function readRequest(request: NextRequest): { address: string; ok: boolean } {
  const encoded = request.nextUrl.searchParams.get("e") ?? "";
  const token = request.nextUrl.searchParams.get("t");
  let address = "";
  try {
    address = decodeAddress(encoded);
  } catch {
    return { address: "", ok: false };
  }
  return { address, ok: !!address && verifyUnsubToken(address, token) };
}

function stop(address: string): void {
  // suppress() also stops every live enrolment for the address. An unsubscribe
  // that only skips the next email is not an unsubscribe.
  suppress({ address, reason: "unsubscribed", by: "one-click" });
}

/** RFC 8058 one-click. The spec wants a 200 and nothing else. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowRequest(`unsub:${ip}`, Date.now(), 60, 60_000)) {
    return new NextResponse(null, { status: 429 });
  }
  const { address, ok } = readRequest(request);
  if (!ok) return new NextResponse(null, { status: 404 });
  stop(address);
  return new NextResponse(null, { status: 200 });
}

/** A person clicking the line at the bottom of the email. */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowRequest(`unsub:${ip}`, Date.now(), 60, 60_000)) {
    return new NextResponse("Too many requests.", { status: 429 });
  }
  const { address, ok } = readRequest(request);
  if (!ok) {
    return new NextResponse("<!doctype html><title>Not found</title><p>Not found.</p>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  stop(address);
  const safe = address.replace(/[<>&"]/g, "");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Done</title>` +
      `<body style="font-family:system-ui,sans-serif;background:#F6F7FA;color:#0A0C14;margin:0;padding:12vh 6vw">` +
      `<h1 style="font-size:24px;margin:0 0 12px">Done.</h1>` +
      `<p style="font-size:16px;line-height:1.5;color:#5A6172;margin:0">` +
      `We will not email ${safe} again. Nothing else is needed from you.</p></body>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
