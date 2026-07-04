import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

type BulkBody = {
  ids?: string[];
  action?: "assign" | "skip" | "reopen";
  ministryId?: string;
  eventId?: string;
  incomeTypeId?: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const body = await request.json().catch(() => ({} as BulkBody));
  const ids = Array.isArray(body.ids) ? body.ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0) : [];
  if (!ids.length) return NextResponse.json({ error: "Belum ada transaksi yang dipilih." }, { status: 400 });

  const transactions = await db.transaction.findMany({ where: { id: { in: ids } } });
  if (transactions.length !== ids.length) return NextResponse.json({ error: "Sebagian transaksi tidak ditemukan." }, { status: 404 });

  if (body.action === "skip") {
    await db.transaction.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "SKIPPED",
        skipReason: "Dilewati manual",
        ministryId: null,
        eventId: null,
        incomeTypeId: null,
        assignedAt: null,
        assignedByRole: session.role,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reopen") {
    await db.transaction.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "UNMATCHED",
        skipReason: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "assign") return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });

  const direction = transactions[0]?.direction;
  if (!direction || transactions.some((transaction) => transaction.direction !== direction)) {
    return NextResponse.json({ error: "Bulk assign hanya bisa untuk transaksi dengan arah yang sama." }, { status: 400 });
  }

  if (direction === "IN") {
    const type = await db.incomeType.findUnique({ where: { id: String(body.incomeTypeId || "") }, include: { event: true } });
    if (!type || !type.active) return NextResponse.json({ error: "Jenis pemasukan tidak valid." }, { status: 400 });
    await db.transaction.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "MATCHED",
        ministryId: type.event.ministryId,
        eventId: type.eventId,
        incomeTypeId: type.id,
        skipReason: null,
        assignedAt: new Date(),
        assignedByRole: session.role,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const event = await db.event.findUnique({ where: { id: String(body.eventId || "") } });
  if (!event || event.ministryId !== body.ministryId) {
    return NextResponse.json({ error: "Event tidak sesuai dengan kementerian." }, { status: 400 });
  }
  await db.transaction.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "MATCHED",
      ministryId: event.ministryId,
      eventId: event.id,
      incomeTypeId: null,
      skipReason: null,
      assignedAt: new Date(),
      assignedByRole: session.role,
    },
  });
  return NextResponse.json({ ok: true });
}
