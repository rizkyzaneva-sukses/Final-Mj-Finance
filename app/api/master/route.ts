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

/**
 * Pencocokan otomatis memakai `wholeAmount.endsWith(uniqueCode)` (lihat `findIncomeMatch`
 * di `lib/matching.ts`). Karena itu kode pendek sangat berbahaya: kode "0" cocok dengan
 * SEMUA nominal berakhiran nol, dan kode 1-2 digit gampang cocok dengan nominal donasi bulat.
 */
const UNIQUE_CODE_MIN_LENGTH = 3;
const UNIQUE_CODE_MAX_LENGTH = 8;

function normalizeUniqueCode(value: unknown) {
  const code = String(value ?? "").trim();
  if (!code) throw new Error("Kode unik wajib diisi.");
  if (!/^\d+$/.test(code)) throw new Error("Kode unik hanya boleh berisi angka.");
  if (/^0+$/.test(code)) {
    throw new Error("Kode unik tidak boleh bernilai nol. Kode nol akan cocok dengan hampir semua nominal, sehingga semua donasi masuk ke event ini.");
  }
  if (code.startsWith("0")) throw new Error("Kode unik tidak boleh diawali angka nol.");
  if (code.length < UNIQUE_CODE_MIN_LENGTH) {
    throw new Error(`Kode unik minimal ${UNIQUE_CODE_MIN_LENGTH} digit. Pencocokan memakai digit akhir nominal, jadi kode pendek seperti "0" atau "50" akan cocok dengan banyak nominal donasi dan membuat transaksi salah masuk event.`);
  }
  if (code.length > UNIQUE_CODE_MAX_LENGTH) throw new Error(`Kode unik maksimal ${UNIQUE_CODE_MAX_LENGTH} digit.`);
  return code;
}

/**
 * Tolak kode yang ambigu terhadap kode aktif lain: bila kode baru merupakan akhiran dari
 * kode lain (atau sebaliknya), satu nominal bisa cocok ke dua event sekaligus.
 * `findIncomeMatch` memang memilih kode terpanjang, tetapi kondisi ini menyesatkan user
 * sehingga lebih baik ditolak sejak input.
 */
async function assertUniqueCodeNotAmbiguous(uniqueCode: string, excludeId?: string) {
  const others = await db.incomeType.findMany({
    where: {
      active: true,
      uniqueCode: { not: null },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { uniqueCode: true, name: true, event: { select: { name: true } } },
  });

  const conflict = others.find((row) => {
    const other = row.uniqueCode!;
    return uniqueCode.endsWith(other) || other.endsWith(uniqueCode);
  });
  if (!conflict) return;

  const label = conflict.event?.name ? `${conflict.event.name} · ${conflict.name}` : conflict.name;
  if (conflict.uniqueCode === uniqueCode) {
    throw new Error(`Kode unik ${uniqueCode} sudah dipakai mapping ${label}.`);
  }
  throw new Error(
    `Kode unik ${uniqueCode} bentrok dengan kode ${conflict.uniqueCode} (${label}). Salah satu kode adalah akhiran dari yang lain, jadi satu nominal bisa cocok ke dua event sekaligus. Pakai kode lain.`,
  );
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
      if (!eventId || !incomeMasterId) throw new Error("Event dan master pemasukan wajib diisi.");
      const uniqueCode = normalizeUniqueCode(body.uniqueCode);
      await assertUniqueCodeNotAmbiguous(uniqueCode);
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
      if (!id || !eventId || !incomeMasterId) throw new Error("Event dan master pemasukan wajib diisi.");
      const uniqueCode = normalizeUniqueCode(body.uniqueCode);
      // Baris yang sedang diedit dikecualikan supaya kodenya sendiri tidak dianggap bentrok.
      if (body.active !== false) await assertUniqueCodeNotAmbiguous(uniqueCode, id);
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
