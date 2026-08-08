import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { qrisResetKey } from "@/lib/accounts";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }

  const { accountNumber, accountHolder } = (body ?? {}) as {
    accountNumber?: string | null;
    accountHolder?: string | null;
  };

  // Kunci reset dibuat dengan helper yang SAMA PERSIS dipakai saat membaca di
  // lib/meeting-report.ts. Kalau kuncinya kosong, resetnya tidak akan pernah cocok
  // dengan rekening mana pun — jadi permintaannya ditolak, bukan disimpan diam-diam.
  const key = qrisResetKey(accountNumber, accountHolder);
  if (!key) {
    return NextResponse.json({ error: "Rekening harus diisi (nomor rekening atau nama pemilik)." }, { status: 400 });
  }

  const normalizedNumber = String(accountNumber || "").replace(/\D/g, "") || null;
  const normalizedHolder = String(accountHolder || "").replace(/\s+/g, " ").trim() || null;

  const reset = await db.qrisReset.create({
    data: {
      accountNumber: normalizedNumber,
      accountHolder: normalizedHolder,
      resetAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, key, resetAt: reset.resetAt });
}
