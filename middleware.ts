import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "mjf_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

const MENSOS_ALLOWED = ["/mensos"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/") || pathname.startsWith("/event-sheet") || pathname.startsWith("/meeting-sheet") || pathname === "/") {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const key = secret();
  if (!key) return NextResponse.next();

  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.role === "MENSOS" && !MENSOS_ALLOWED.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/mensos", request.url));
    }
  } catch {
    // Invalid token — let the panel layout handle it
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
