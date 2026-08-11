import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  forceUniqueFingerprint,
  isExactDuplicateSkipReason,
  recalculateBatchStats,
} from "@/lib/matching";

type BulkBody = {
  ids?: string[];
  action?: "assign" | "skip" | "reopen" | "forceUnique" | "setAccount";
  ministryId?: string;
  eventId?: string;
  incomeTypeId?: string;
  expenseTypeId?: string;
  accountHolder?: string;
  accountNumber?: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const body = await request.json().catch(() => ({} as BulkBody));
  const ids = Array.isArray(body.ids) ? body.ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0) : [];
  if (!ids.length) return NextResponse.json({ error: "Belum ada transaksi yang dipilih." }, { status: 400 });

  const transactions = await db.transaction.findMany({ where: { id: { in: ids } }, select: { id: true, importBatchId: true, direction: true } });
  if (transactions.length !== ids.length) return NextResponse.json({ error: "Sebagian transaksi tidak ditemukan." }, { status: 404 });

  const batchIds = [...new Set(transactions.map((t) => t.importBatchId).filter(Boolean))] as string[];

  if (body.action === "skip") {
    await db.transaction.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "SKIPPED",
        skipReason: "Dilewati manual",
        ministryId: null,
        eventId: null,
        incomeTypeId: null,
        expenseTypeId: null,
        assignedAt: null,
        assignedByRole: session.role,
      },
    });
    await Promise.all(batchIds.map(recalculateBatchStats));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reopen") {
    // Exact-duplikat punya fingerprint di-salt; reopen biasa cukup untuk fuzzy skip.
    // Exact harus lewat forceUnique agar fingerprint diganti dan lolos @unique di buku.
    const rows = await db.transaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, skipReason: true },
    });
    const exactIds = rows.filter((row) => isExactDuplicateSkipReason(row.skipReason)).map((row) => row.id);
    const otherIds = rows.filter((row) => !isExactDuplicateSkipReason(row.skipReason)).map((row) => row.id);

    if (otherIds.length) {
      await db.transaction.updateMany({
        where: { id: { in: otherIds } },
        data: {
          status: "UNMATCHED",
          skipReason: null,
        },
      });
    }

    // Exact: ganti fingerprint dulu, baru buka ke UNMATCHED (satu per satu karena hash unik).
    for (const id of exactIds) {
      const base = `force-unique-${id}`;
      await db.transaction.update({
        where: { id },
        data: {
          fingerprint: forceUniqueFingerprint(base),
          status: "UNMATCHED",
          skipReason: null,
          assignedByRole: session.role,
          assignedAt: new Date(),
        },
      });
    }

    await Promise.all(batchIds.map(recalculateBatchStats));
    return NextResponse.json({ ok: true, forcedUnique: exactIds.length, reopened: otherIds.length });
  }

  if (body.action === "setAccount") {
    const accountHolder = typeof body.accountHolder === "string" ? body.accountHolder.trim() || null : null;
    const accountNumber = typeof body.accountNumber === "string"
      ? body.accountNumber.replace(/\D/g, "") || null
      : null;
    if (!accountHolder && !accountNumber) {
      return NextResponse.json({ error: "Pilih rekening tujuan." }, { status: 400 });
    }
    await db.transaction.updateMany({
      where: { id: { in: ids } },
      data: { accountHolder, accountNumber },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "forceUnique") {
    const rows = await db.transaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, skipReason: true },
    });
    const exactIds = rows.filter((row) => isExactDuplicateSkipReason(row.skipReason)).map((row) => row.id);
    if (!exactIds.length) {
      return NextResponse.json(
        { error: "Hanya baris dengan status duplikat exact yang bisa dipaksa unik." },
        { status: 400 },
      );
    }
    for (const id of exactIds) {
      await db.transaction.update({
        where: { id },
        data: {
          fingerprint: forceUniqueFingerprint(id),
          status: "UNMATCHED",
          skipReason: null,
          assignedByRole: session.role,
          assignedAt: new Date(),
        },
      });
    }
    await Promise.all(batchIds.map(recalculateBatchStats));
    return NextResponse.json({ ok: true, forcedUnique: exactIds.length });
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
        expenseTypeId: null,
        skipReason: null,
        assignedAt: new Date(),
        assignedByRole: session.role,
      },
    });
    await Promise.all(batchIds.map(recalculateBatchStats));
    return NextResponse.json({ ok: true });
  }

  const event = await db.event.findUnique({ where: { id: String(body.eventId || "") } });
  if (!event || event.ministryId !== body.ministryId) {
    return NextResponse.json({ error: "Event tidak sesuai dengan kementerian." }, { status: 400 });
  }
  const expenseType = await db.expenseType.findUnique({ where: { id: String(body.expenseTypeId || "") } });
  if (!expenseType || !expenseType.active) {
    return NextResponse.json({ error: "Jenis pengeluaran tidak valid." }, { status: 400 });
  }
  await db.transaction.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "MATCHED",
      ministryId: event.ministryId,
      eventId: event.id,
      incomeTypeId: null,
      expenseTypeId: expenseType.id,
      skipReason: null,
      assignedAt: new Date(),
      assignedByRole: session.role,
    },
  });
  await Promise.all(batchIds.map(recalculateBatchStats));
  return NextResponse.json({ ok: true });
}
