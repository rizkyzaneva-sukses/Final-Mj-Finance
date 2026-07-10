import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const body = await request.json();
  const { accountNumber, accountHolder } = body;

  if (!accountNumber && !accountHolder) {
    return NextResponse.json({ error: "Rekening harus diisi." }, { status: 400 });
  }

  await db.qrisReset.create({
    data: {
      accountNumber: accountNumber || null,
      accountHolder: accountHolder || null,
      resetAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
