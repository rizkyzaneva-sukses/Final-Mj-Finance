import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export type AppRole = "FINANCE" | "MINISTRY";
export type AppSession = { role: AppRole; expiresAt: number };

const COOKIE_NAME = "mjf_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET wajib diisi minimal 32 karakter.");
  }
  return new TextEncoder().encode(value);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function safeCodeEqual(input: string, expected?: string) {
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

export async function createSession(role: AppRole) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const token = await new SignJWT({ role, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getSession(): Promise<AppSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "FINANCE" && payload.role !== "MINISTRY") return null;
    return { role: payload.role, expiresAt: Number(payload.expiresAt) };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
