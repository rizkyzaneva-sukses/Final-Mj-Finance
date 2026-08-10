import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";
import { recalculateBatchStats } from "@/lib/matching";

/** Hanya N impor COMPLETED terbaru yang boleh dibatalkan (hapus transaksi + riwayat). */
const UNDO_WINDOW = 2;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  if (session.role !== "FINANCE") {
    return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat membatalkan impor." }, { status: 403 });
  }

  const { id } = await params;
  const batch = await db.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Batch impor tidak ditemukan." }, { status: 404 });

  if (batch.status === "REVIEW") {
    return NextResponse.json({ error: "Draft review dibuang lewat tombol Buang draft, bukan batalkan impor." }, { status: 400 });
  }
  if (batch.status === "PROCESSING") {
    return NextResponse.json({ error: "Impor masih diproses. Tunggu selesai dulu." }, { status: 400 });
  }

  // FAILED: tidak ada transaksi final; cukup bersihkan baris riwayat.
  if (batch.status === "FAILED") {
    await db.importBatch.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedTransactions: 0, reopenedDuplicates: 0 });
  }

  if (batch.status !== "COMPLETED") {
    return NextResponse.json({ error: "Status batch tidak bisa dibatalkan." }, { status: 400 });
  }

  const recentCompleted = await db.importBatch.findMany({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: UNDO_WINDOW,
    select: { id: true },
  });
  if (!recentCompleted.some((row) => row.id === id)) {
    return NextResponse.json(
      {
        error: `Hanya ${UNDO_WINDOW} impor selesai terakhir yang bisa dibatalkan. Impor lebih lama biarkan tetap di buku.`,
      },
      { status: 400 },
    );
  }

  const transactions = await db.transaction.findMany({
    where: { importBatchId: id },
    select: {
      id: true,
      isDraft: true,
      source: true,
      sourceReference: true,
      direction: true,
      amount: true,
    },
  });

  // Guard: jangan pernah sentuh baris saldo awal (seharusnya tidak punya importBatchId).
  const openingLeak = transactions.some(
    (row) =>
      row.source === "MANUAL" &&
      String(row.sourceReference || "").startsWith(OPENING_BALANCE_PREFIX),
  );
  if (openingLeak) {
    return NextResponse.json(
      { error: "Batch ini mengandung saldo awal. Pembatalan dibatalkan demi keamanan." },
      { status: 409 },
    );
  }

  const txIds = transactions.map((row) => row.id);

  const result = await db.$transaction(async (tx) => {
    // Buka ulang baris di batch lain yang di-SKIP karena duplikat dari transaksi batch ini.
    let reopenedDuplicates = 0;
    const siblingBatchIds = new Set<string>();
    if (txIds.length) {
      const skippedSiblings = await tx.transaction.findMany({
        where: {
          status: "SKIPPED",
          isDraft: false,
          importBatchId: { not: id },
          OR: txIds.map((txId) => ({ skipReason: { contains: txId } })),
        },
        select: { id: true, importBatchId: true, skipReason: true },
      });
      const reopenIds = skippedSiblings
        .filter((row) => String(row.skipReason || "").startsWith("Duplikasi dari sumber lain"))
        .map((row) => {
          if (row.importBatchId) siblingBatchIds.add(row.importBatchId);
          return row.id;
        });
      if (reopenIds.length) {
        await tx.transaction.updateMany({
          where: { id: { in: reopenIds } },
          data: { status: "UNMATCHED", skipReason: null },
        });
        reopenedDuplicates = reopenIds.length;
      }

      await tx.transaction.deleteMany({ where: { importBatchId: id } });
    }

    await tx.importBatch.delete({ where: { id } });
    return { reopenedDuplicates, siblingBatchIds: [...siblingBatchIds] };
  });

  // Stats riwayat batch lain — di luar transaksi utama; gagal di sini tidak membatalkan undo saldo.
  for (const batchId of result.siblingBatchIds) {
    try {
      await recalculateBatchStats(batchId);
    } catch {
      // Stats riwayat tidak kritis untuk saldo.
    }
  }

  return NextResponse.json({
    ok: true,
    deletedTransactions: transactions.length,
    reopenedDuplicates: result.reopenedDuplicates,
  });
}
