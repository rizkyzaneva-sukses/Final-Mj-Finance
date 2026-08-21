import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { resolveLoginCode } from "@/lib/ministry-login";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const state = attempts.get(ip);
  if (state && state.resetAt > now && state.count >= 8) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const resolved = code ? await resolveLoginCode(code) : null;

  if (!resolved) {
    const current = state && state.resetAt > now ? state : { count: 0, resetAt: now + 15 * 60_000 };
    attempts.set(ip, { ...current, count: current.count + 1 });
    return NextResponse.json({ error: "Kode akses tidak dikenali." }, { status: 401 });
  }

  attempts.delete(ip);

  if (resolved.kind === "FINANCE") {
    await createSession("FINANCE");
    return NextResponse.json({ ok: true, role: "FINANCE", redirectTo: "/dashboard" });
  }

  await createSession(resolved.role, {
    ministryId: resolved.ministryId,
    ministryCode: resolved.ministryCode,
    ministryName: resolved.ministryName,
  });

  const redirectTo = resolved.role === "MENSOS" || resolved.ministryCode === 4 ? "/mensos" : "/ministry";
  return NextResponse.json({
    ok: true,
    role: resolved.role,
    ministryCode: resolved.ministryCode,
    ministryName: resolved.ministryName,
    redirectTo,
  });
}
