import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, getPassword, sessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // /pitch is the public signup page; the PWA shell files must load pre-login.
  // The Linked Helper webhook carries its own secret and cannot present a
  // founder cookie, since the caller is an app rather than a browser.
  const isPublic =
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/pitch" ||
    pathname === "/api/pitch" ||
    pathname === "/api/hooks/linked-helper" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/icons/");
  if (isPublic) return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  const expected = await sessionToken(getPassword());
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
