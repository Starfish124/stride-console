import { NextResponse } from "next/server";
import { AUTH_COOKIE, FOUNDER_COOKIE, FOUNDERS, getPassword, sessionToken } from "@/lib/auth";
import { allowRequest } from "@/lib/rateLimit";

export async function POST(request: Request) {
  // The console faces the public internet through Funnel; the login takes
  // 10 attempts per IP per 15 minutes and not one more.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`login:${ip}`, Date.now(), 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes." },
      { status: 429 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    founder?: string;
  };
  if (!body.password || body.password !== getPassword()) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  const founder = FOUNDERS.includes(body.founder as (typeof FOUNDERS)[number])
    ? (body.founder as string)
    : FOUNDERS[0];
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(AUTH_COOKIE, await sessionToken(getPassword()), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set(FOUNDER_COOKIE, founder, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
