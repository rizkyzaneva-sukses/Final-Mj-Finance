import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseHistoricalWorkbook, stageHistoricalWorkbook } from "@/lib/historical-import";
import { stageImportTransactions, type NormalizedTransaction } from "@/lib/matching";
import { parseBankFile } from "@/lib/mimo";
import { parseQrisWorkbook } from "@/lib/qris";

export const runtime = "nodejs";
export const maxDuration = 480;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const form = await request.formData();
  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
  const kind = form.get("kind");
  if (!files.length || (kind !== "QRIS" && kind !== "BANK" && kind !== "HISTORICAL")) {
    return NextResponse.json({ error: "File atau jenis impor tidak valid." }, { status: 400 });
  }
  if (kind !== "BANK" && files.length > 1) {
    return NextResponse.json({ error: "Jenis impor ini hanya menerima satu file." }, { status: 400 });
  }
  for (const entry of files) {
    if (entry.size > 15 * 1024 * 1024) return NextResponse.json({ error: `Ukuran file "${entry.name}" melebihi 15 MB.` }, { status: 413 });
  }

  const file = files[0];

  if (kind === "HISTORICAL") {
    if (session.role !== "FINANCE") {
      return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mengimpor data lama FINAL." }, { status: 403 });
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "xlsx") {
      return NextResponse.json({ error: "Data lama FINAL wajib menggunakan format .xlsx." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
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

  const extension = file.name.split(".").pop()?.toLowerCase();
  const source = kind === "QRIS" ? "QRIS_XLSX" : extension === "pdf" ? "BANK_PDF" : "BANK_SCREENSHOT";
  const fileName = files.length > 1
    ? `${files.length} file · ${files.map((entry) => entry.name).slice(0, 2).join(", ")}${files.length > 2 ? `, +${files.length - 2} lainnya` : ""}`
    : file.name;
  const batch = await db.importBatch.create({ data: { fileName: fileName.slice(0, 255), source } });

  try {
    let parsed: { accountHolder: string | null; accountNumber: string | null; transactions: NormalizedTransaction[] };
    if (kind === "QRIS") {
      const buffer = Buffer.from(await file.arrayBuffer());
      parsed = { accountHolder: null, accountNumber: null, transactions: parseQrisWorkbook(buffer) };
    } else {
      let accountHolder: string | null = null;
      let accountNumber: string | null = null;
      const transactions: NormalizedTransaction[] = [];
      for (const entry of files) {
        const entryExtension = entry.name.split(".").pop()?.toLowerCase();
        const inferredMime = entryExtension === "pdf" ? "application/pdf" : entryExtension === "png" ? "image/png" : entryExtension === "webp" ? "image/webp" : "image/jpeg";
        const buffer = Buffer.from(await entry.arrayBuffer());
        const result = await parseBankFile(buffer, entry.type || inferredMime);
        accountHolder ||= result.accountHolder;
        accountNumber ||= result.accountNumber;
        transactions.push(...result.transactions);
      }
      parsed = { accountHolder, accountNumber, transactions };
    }
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
