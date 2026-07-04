import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

function ensureFinance(session: Awaited<ReturnType<typeof getSession>>) {
  if (session?.role !== "FINANCE") {
    return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mengubah master." }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
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
      const eventId = String(body.eventId || "");
      const incomeMasterId = String(body.incomeMasterId || "");
      const uniqueCode = String(body.uniqueCode || "").trim();
      if (!eventId || !incomeMasterId || !/^(0|[1-9]\d*)$/.test(uniqueCode)) throw new Error("Event, master pemasukan, dan kode unik tanpa nol depan wajib diisi.");
      if (uniqueCode.length > 8) throw new Error("Kode unik maksimal 8 digit.");
      const incomeMaster = await db.incomeMaster.findUnique({ where: { id: incomeMasterId } });
      if (!incomeMaster || !incomeMaster.active) throw new Error("Master pemasukan tidak valid.");
      const row = await db.incomeType.create({ data: { name: incomeMaster.name, eventId, uniqueCode, incomeMasterId: incomeMaster.id } });
      return NextResponse.json(row);
    }
    if (body.entity === "incomeMaster") {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("Nama master pemasukan wajib diisi.");
      const row = await db.incomeMaster.create({ data: { name } });
      return NextResponse.json(row);
    }
    if (body.entity === "expenseType") {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("Nama jenis pengeluaran wajib diisi.");
      const row = await db.expenseType.create({ data: { name } });
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "Jenis master tidak dikenal." }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Kode atau nama tersebut sudah digunakan." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Data gagal disimpan." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));

  try {
    if (body.entity === "ministry") {
      const id = String(body.id || "");
      const code = Number(body.code);
      const name = String(body.name || "").trim();
      if (!id || !Number.isInteger(code) || code < 0 || !name) throw new Error("Kode dan nama kementerian wajib valid.");
      const row = await db.ministry.update({ where: { id }, data: { code, name, active: body.active !== false } });
      return NextResponse.json(row);
    }

    if (body.entity === "event") {
      const id = String(body.id || "");
      const name = String(body.name || "").trim();
      const ministryId = String(body.ministryId || "");
      if (!id || !name || !ministryId) throw new Error("Kementerian dan nama event wajib diisi.");
      const row = await db.event.update({
        where: { id },
        data: {
          name,
          ministryId,
          category: String(body.category || "").trim() || null,
          active: body.active !== false,
        },
      });
      return NextResponse.json(row);
    }

    if (body.entity === "income") {
      const id = String(body.id || "");
      const eventId = String(body.eventId || "");
      const incomeMasterId = String(body.incomeMasterId || "");
      const uniqueCode = String(body.uniqueCode || "").trim();
      if (!id || !eventId || !incomeMasterId || !/^(0|[1-9]\d*)$/.test(uniqueCode)) throw new Error("Event, master pemasukan, dan kode unik tanpa nol depan wajib diisi.");
      if (uniqueCode.length > 8) throw new Error("Kode unik maksimal 8 digit.");
      const incomeMaster = await db.incomeMaster.findUnique({ where: { id: incomeMasterId } });
      if (!incomeMaster || !incomeMaster.active) throw new Error("Master pemasukan tidak valid.");
      const row = await db.incomeType.update({
        where: { id },
        data: { name: incomeMaster.name, eventId, uniqueCode, incomeMasterId: incomeMaster.id, active: body.active !== false },
      });
      return NextResponse.json(row);
    }
    if (body.entity === "incomeMaster") {
      const id = String(body.id || "");
      const name = String(body.name || "").trim();
      if (!id || !name) throw new Error("Nama master pemasukan wajib diisi.");
      const row = await db.incomeMaster.update({ where: { id }, data: { name, active: body.active !== false } });
      await db.incomeType.updateMany({ where: { incomeMasterId: id }, data: { name } });
      return NextResponse.json(row);
    }
    if (body.entity === "expenseType") {
      const id = String(body.id || "");
      const name = String(body.name || "").trim();
      if (!id || !name) throw new Error("Nama jenis pengeluaran wajib diisi.");
      const row = await db.expenseType.update({ where: { id }, data: { name, active: body.active !== false } });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Jenis master tidak dikenal." }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Kode atau nama tersebut sudah digunakan." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Data yang ingin diubah tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Data gagal diubah." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const entity = String(body.entity || "");
  const id = String(body.id || "");
  if (!entity || !id) return NextResponse.json({ error: "Entity dan id wajib diisi." }, { status: 400 });

  try {
    if (entity === "income") {
      const linked = await db.transaction.count({ where: { incomeTypeId: id } });
      if (linked) return NextResponse.json({ error: "Jenis pemasukan ini sudah dipakai transaksi dan tidak bisa dihapus." }, { status: 409 });
      await db.incomeType.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (entity === "incomeMaster") {
      const linked = await db.incomeType.count({ where: { incomeMasterId: id } });
      if (linked) return NextResponse.json({ error: "Master pemasukan ini masih dipakai mapping event dan tidak bisa dihapus." }, { status: 409 });
      await db.incomeMaster.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (entity === "expenseType") {
      const linked = await db.transaction.count({ where: { expenseTypeId: id } });
      if (linked) return NextResponse.json({ error: "Jenis pengeluaran ini sudah dipakai transaksi dan tidak bisa dihapus." }, { status: 409 });
      await db.expenseType.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (entity === "event") {
      const linked = await db.transaction.count({ where: { eventId: id } });
      if (linked) return NextResponse.json({ error: "Event ini sudah dipakai transaksi dan tidak bisa dihapus." }, { status: 409 });
      await db.$transaction(async (tx) => {
        await tx.incomeType.deleteMany({ where: { eventId: id } });
        await tx.event.delete({ where: { id } });
      });
      return NextResponse.json({ ok: true });
    }

    if (entity === "ministry") {
      const linked = await db.transaction.count({ where: { ministryId: id } });
      if (linked) return NextResponse.json({ error: "Kementerian ini sudah dipakai transaksi dan tidak bisa dihapus." }, { status: 409 });
      await db.$transaction(async (tx) => {
        const eventIds = (await tx.event.findMany({ where: { ministryId: id }, select: { id: true } })).map((row) => row.id);
        if (eventIds.length) await tx.incomeType.deleteMany({ where: { eventId: { in: eventIds } } });
        await tx.event.deleteMany({ where: { ministryId: id } });
        await tx.ministry.delete({ where: { id } });
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Jenis master tidak dikenal." }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Data yang ingin dihapus tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Data gagal dihapus." }, { status: 400 });
  }
}
