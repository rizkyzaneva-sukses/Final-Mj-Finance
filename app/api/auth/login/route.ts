import { NextRequest, NextResponse } from "next/server";
import { createSession, safeCodeEqual } from "@/lib/auth";

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
  const role = safeCodeEqual(code, process.env.FINANCE_LOGIN_CODE)
    ? "FINANCE"
    : safeCodeEqual(code, process.env.MINISTRY_LOGIN_CODE)
      ? "MINISTRY"
      : null;

  if (!role) {
    const current = state && state.resetAt > now ? state : { count: 0, resetAt: now + 15 * 60_000 };
    attempts.set(ip, { ...current, count: current.count + 1 });
    return NextResponse.json({ error: "Kode akses tidak dikenali." }, { status: 401 });
  }

  attempts.delete(ip);
  await createSession(role);
  return NextResponse.json({ ok: true, role });
}
