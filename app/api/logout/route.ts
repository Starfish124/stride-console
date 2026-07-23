import { NextResponse } from "next/server";
import { AUTH_COOKIE, FOUNDER_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE);
  response.cookies.delete(FOUNDER_COOKIE);
  return response;
}
