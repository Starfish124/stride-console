import { NextResponse } from "next/server";
import { deviceForToken, markDeviceUsed, saveSessionNote } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

/** A long session note is still just text; past this something is wrong. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Where a finished Claude session lands in the graph.
 *
 * This route is in the PUBLIC allowlist in proxy.ts because the caller is a
 * hook script on a founder's machine, not a browser: it has no session
 * cookie and never will. It carries a per-device bearer token instead, and a
 * wrong one gets a bare 404 — the Linked Helper webhook's posture, so a
 * scanner learns nothing about what lives here.
 *
 * It is POST-only and on its own path on purpose. The allowlist matches a
 * path, not a verb, so anything readable must live somewhere else: reading
 * the notes back is /api/graph/sessions, behind the login.
 */
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const device = deviceForToken(bearer);
  if (!device) return new NextResponse("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const title = typeof body.title === "string" ? body.title : "session";

  if (!markdown.trim()) {
    return NextResponse.json({ error: "The session was empty." }, { status: 400 });
  }
  if (Buffer.byteLength(markdown) > MAX_BYTES) {
    return NextResponse.json({ error: "That session note is too big." }, { status: 413 });
  }

  const stored = saveSessionNote({
    deviceLabel: device.label,
    sessionId: sessionId || "unknown",
    title,
    markdown,
  });
  markDeviceUsed(device.id);
  return NextResponse.json({ ok: true, stored });
}
