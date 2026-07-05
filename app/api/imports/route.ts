import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseHistoricalWorkbook, stageHistoricalWorkbook } from "@/lib/historical-import";
import { stageImportTransactions } from "@/lib/matching";
import { parseBankFile } from "@/lib/mimo";
import { parseQrisWorkbook } from "@/lib/qris";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "QRIS" && kind !== "BANK" && kind !== "HISTORICAL")) {
    return NextResponse.json({ error: "File atau jenis impor tidak valid." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Ukuran file melebihi 15 MB." }, { status: 413 });

  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "HISTORICAL") {
    if (session.role !== "FINANCE") {
      return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mengimpor data lama FINAL." }, { status: 403 });
    }
    if (extension !== "xlsx") {
      return NextResponse.json({ error: "Data lama FINAL wajib menggunakan format .xlsx." }, { status: 400 });
    }
    try {
      const parsed = parseHistoricalWorkbook(buffer, {
        holder: String(form.get("qrisAccountHolder") || "").trim() || null,
        number: String(form.get("qrisAccountNumber") || "").trim() || null,
      });
      const result = await stageHistoricalWorkbook({
        parsed,
        fileName: file.name,
        replaceExisting: form.get("replaceExisting") === "true",
        assignedByRole: session.role,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Impor data lama gagal." }, { status: 400 });
    }
  }

  const inferredMime = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const source = kind === "QRIS" ? "QRIS_XLSX" : extension === "pdf" ? "BANK_PDF" : "BANK_SCREENSHOT";
  const batch = await db.importBatch.create({ data: { fileName: file.name.slice(0, 255), source } });

  try {
    const parsed = kind === "QRIS"
      ? { accountHolder: null, accountNumber: null, transactions: parseQrisWorkbook(buffer) }
      : await parseBankFile(buffer, file.type || inferredMime);
    if (!parsed.transactions.length) {
      throw new Error("Tidak ada transaksi yang berhasil dibaca dari file ini.");
    }
    const counts = await stageImportTransactions(batch.id, parsed.transactions);
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        accountHolder: parsed.accountHolder,
        accountNumber: parsed.accountNumber,
        status: "REVIEW",
        totalRows: parsed.transactions.length,
        importedRows: counts.imported,
        duplicateRows: counts.duplicate,
        matchedRows: counts.matched,
        unmatchedRows: counts.unmatched,
        skippedRows: counts.skipped,
      },
    });
    return NextResponse.json({ batchId: batch.id, ...counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan impor tidak dikenal.";
    await db.importBatch.update({ where: { id: batch.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000), completedAt: new Date() } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
