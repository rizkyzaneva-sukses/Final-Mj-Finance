import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "FINANCE") return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mengubah master." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.entity === "ministry") {
      const code = Number(body.code);
      const name = String(body.name || "").trim();
      if (!Number.isInteger(code) || code < 0 || !name) throw new Error("Kode dan nama kementerian wajib valid.");
      const row = await db.ministry.create({ data: { code, name } });
      return NextResponse.json(row);
    }
    if (body.entity === "event") {
      const name = String(body.name || "").trim();
      const ministryId = String(body.ministryId || "");
      if (!name || !ministryId) throw new Error("Kementerian dan nama event wajib diisi.");
      const row = await db.event.create({ data: { name, ministryId, category: String(body.category || "").trim() || null } });
      return NextResponse.json(row);
    }
    if (body.entity === "income") {
      const name = String(body.name || "").trim();
      const eventId = String(body.eventId || "");
      const uniqueCode = String(body.uniqueCode || "").trim();
      if (!name || !eventId || !/^(0|[1-9]\d*)$/.test(uniqueCode)) throw new Error("Event, nama, dan kode unik tanpa nol depan wajib diisi.");
      if (uniqueCode.length > 8) throw new Error("Kode unik maksimal 8 digit.");
      const row = await db.incomeType.create({ data: { name, eventId, uniqueCode } });
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "Jenis master tidak dikenal." }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Kode atau nama tersebut sudah digunakan." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Data gagal disimpan." }, { status: 400 });
  }
}
