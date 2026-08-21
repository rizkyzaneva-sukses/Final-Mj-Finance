import { safeCodeEqual } from "@/lib/auth";
import { db } from "@/lib/db";
import { defaultMinistries } from "@/lib/default-master";

export type ResolvedLogin =
  | { kind: "FINANCE" }
  | { kind: "MINISTRY"; role: "MINISTRY" | "MENSOS"; ministryId: string; ministryCode: number; ministryName: string };

function envCodeForMinistry(code: number) {
  return process.env[`MINISTRY_${code}_LOGIN_CODE`];
}

export function knownMinistryCodes() {
  const fromDefaults = defaultMinistries.map(([code]) => code);
  const fromEnv = Object.keys(process.env)
    .map((key) => {
      const match = /^MINISTRY_(\d+)_LOGIN_CODE$/.exec(key);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  return [...new Set([...fromDefaults, ...fromEnv, 4])].sort((a, b) => a - b);
}

export async function resolveLoginCode(code: string): Promise<ResolvedLogin | null> {
  if (safeCodeEqual(code, process.env.FINANCE_LOGIN_CODE)) {
    return { kind: "FINANCE" };
  }

  if (safeCodeEqual(code, process.env.MENSOS_LOGIN_CODE) || safeCodeEqual(code, envCodeForMinistry(4))) {
    const ministry = await db.ministry.findUnique({ where: { code: 4 } });
    if (!ministry) return null;
    return {
      kind: "MINISTRY",
      role: "MENSOS",
      ministryId: ministry.id,
      ministryCode: ministry.code,
      ministryName: ministry.name,
    };
  }

  for (const ministryCode of knownMinistryCodes()) {
    if (ministryCode === 4) continue;
    if (!safeCodeEqual(code, envCodeForMinistry(ministryCode))) continue;
    const ministry = await db.ministry.findUnique({ where: { code: ministryCode } });
    if (!ministry) return null;
    return {
      kind: "MINISTRY",
      role: "MINISTRY",
      ministryId: ministry.id,
      ministryCode: ministry.code,
      ministryName: ministry.name,
    };
  }

  return null;
}

export async function canAccessEventDocuments(
  session: { role: string; ministryId?: string; ministryCode?: number },
  eventId: string,
) {
  if (session.role === "FINANCE") return { ok: true as const, canWrite: true };
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, ministryId: true, ministry: { select: { code: true } } },
  });
  if (!event) return { ok: false as const, status: 404 as const, error: "Event tidak ditemukan." };

  const owns =
    (session.ministryId && session.ministryId === event.ministryId) ||
    (session.role === "MENSOS" && event.ministry.code === 4) ||
    (typeof session.ministryCode === "number" && session.ministryCode === event.ministry.code);

  if (!owns) return { ok: false as const, status: 403 as const, error: "Dokumen ini di luar lingkup kementerian Anda." };
  return { ok: true as const, canWrite: true, event };
}
