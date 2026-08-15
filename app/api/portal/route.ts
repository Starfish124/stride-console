import { NextResponse } from "next/server";
import { getClient } from "@/lib/store";
import {
  mintPortalToken,
  portalTokenFor,
  revokePortalToken,
} from "@/lib/portal";

// Founder-only, and deliberately NOT in the proxy allowlist: the session
// cookie gates every call here. The public half is /portal/<token>, where
// the token itself is the credential. Minting stays a founder's move.

/**
 * Relative on purpose. The founder's browser origin completes it, so the
 * same link works on localhost and wherever the console is deployed.
 */
function portalUrl(token: string): string {
  return `/portal/${token}`;
}

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!getClient(clientId)) {
    return NextResponse.json({ error: "No such client." }, { status: 404 });
  }
  const existing = portalTokenFor(clientId);
  return NextResponse.json({ url: existing ? portalUrl(existing.token) : null });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";

  // A token for somebody not in the book would be a link to nothing and a
  // way to probe ids, so an unknown client gets the same bare 404 either way.
  if (!getClient(clientId)) {
    return NextResponse.json({ error: "No such client." }, { status: 404 });
  }

  if (body.action === "mint") {
    const record = mintPortalToken(clientId);
    return NextResponse.json({ url: portalUrl(record.token) });
  }
  if (body.action === "revoke") {
    revokePortalToken(clientId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Action is mint or revoke." }, { status: 400 });
}
