import { NextResponse } from "next/server";
import { addSignup } from "@/lib/store";
import { allowRequest } from "@/lib/rateLimit";

const MAX_FIELD = 200;

/** Public signup for the 1 Min AI Pitch. Rate-limited by IP, in memory. */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { error: "That is enough signups from this connection for now. Try again in an hour." },
      { status: 429 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const startup = typeof body.startup === "string" ? body.startup.trim() : "";
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (!name || !startup || !idea) {
    return NextResponse.json(
      { error: "Name, startup and the one-line idea are all required." },
      { status: 400 },
    );
  }
  if (name.length > MAX_FIELD || startup.length > MAX_FIELD || idea.length > MAX_FIELD) {
    return NextResponse.json(
      { error: "Keep each field under 200 characters. One line is the format." },
      { status: 400 },
    );
  }
  addSignup({ name, startup, idea });
  return NextResponse.json({ ok: true });
}
