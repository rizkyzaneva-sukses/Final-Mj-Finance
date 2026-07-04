import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { importTransactions } from "@/lib/matching";
import { parseBankFile } from "@/lib/mimo";
import { parseQrisWorkbook } from "@/lib/qris";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "QRIS" && kind !== "BANK")) {
    return NextResponse.json({ error: "File atau jenis impor tidak valid." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Ukuran file melebihi 15 MB." }, { status: 413 });

  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferredMime = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const source = kind === "QRIS" ? "QRIS_XLSX" : extension === "pdf" ? "BANK_PDF" : "BANK_SCREENSHOT";
  const batch = await db.importBatch.create({ data: { fileName: file.name.slice(0, 255), source } });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = kind === "QRIS" ? parseQrisWorkbook(buffer) : await parseBankFile(buffer, file.type || inferredMime);
    const counts = await importTransactions(batch.id, rows);
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        totalRows: rows.length,
        importedRows: counts.imported,
        duplicateRows: counts.duplicate,
        matchedRows: counts.matched,
        unmatchedRows: counts.unmatched,
        skippedRows: counts.skipped,
        completedAt: new Date(),
      },
    });
    return NextResponse.json(counts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan impor tidak dikenal.";
    await db.importBatch.update({ where: { id: batch.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000), completedAt: new Date() } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
