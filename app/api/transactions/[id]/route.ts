import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const transaction = await db.transaction.findUnique({ where: { id } });
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan." }, { status: 404 });

  if (body.action === "skip") {
    await db.transaction.update({ where: { id }, data: { status: "SKIPPED", skipReason: "Dilewati manual", ministryId: null, eventId: null, incomeTypeId: null, expenseTypeId: null, assignedAt: null, assignedByRole: session.role } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "reopen") {
    await db.transaction.update({ where: { id }, data: { status: "UNMATCHED", skipReason: null } });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "assign") return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });

  if (transaction.direction === "IN") {
    const type = await db.incomeType.findUnique({ where: { id: String(body.incomeTypeId || "") }, include: { event: true } });
    if (!type || !type.active) return NextResponse.json({ error: "Jenis pemasukan tidak valid." }, { status: 400 });
    await db.transaction.update({ where: { id }, data: { status: "MATCHED", ministryId: type.event.ministryId, eventId: type.eventId, incomeTypeId: type.id, expenseTypeId: null, skipReason: null, assignedAt: new Date(), assignedByRole: session.role } });
  } else {
    const event = await db.event.findUnique({ where: { id: String(body.eventId || "") } });
    if (!event || event.ministryId !== body.ministryId) return NextResponse.json({ error: "Event tidak sesuai dengan kementerian." }, { status: 400 });
    const expenseType = await db.expenseType.findUnique({ where: { id: String(body.expenseTypeId || "") } });
    if (!expenseType || !expenseType.active) return NextResponse.json({ error: "Jenis pengeluaran tidak valid." }, { status: 400 });
    await db.transaction.update({ where: { id }, data: { status: "MATCHED", ministryId: event.ministryId, eventId: event.id, incomeTypeId: null, expenseTypeId: expenseType.id, skipReason: null, assignedAt: new Date(), assignedByRole: session.role } });
  }
  return NextResponse.json({ ok: true });
}
