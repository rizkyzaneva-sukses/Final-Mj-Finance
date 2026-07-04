import * as XLSX from "xlsx";
import type { NormalizedTransaction } from "@/lib/matching";

type QrisRow = Record<string, string | number | null | undefined>;

function parseQrisDate(value: unknown) {
  if (value instanceof Date) return value;
  const text = String(value || "").trim().replaceAll("/", "-").replace(" ", "T");
  const parsed = new Date(`${text}+07:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Tanggal QRIS tidak valid: ${String(value)}`);
  return parsed;
}

export function parseQrisWorkbook(buffer: Buffer): NormalizedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets.Report ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Worksheet QRIS tidak ditemukan.");
  const rows = XLSX.utils.sheet_to_json<QrisRow>(sheet, { defval: null });

  return rows
    .filter((row) => String(row.TRANSACTION_STATUS || "").toUpperCase() === "APPROVED")
    .map((row) => {
      const amount = Number(row.AMOUNT);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal QRIS tidak valid.");
      const reference = String(row.TRANSACTION_ID || row.RRN || row.INVOICE_NUMBER || "").trim();
      return {
        transactionDate: parseQrisDate(row.APPROVAL_DATE_TIME || row.CREATED_DATE),
        description: `QRIS ${String(row.MERCHANT_NAME || "Muda Juara")} - RRN ${String(row.RRN || "-")}`,
        amount,
        direction: "IN" as const,
        source: "QRIS_XLSX" as const,
        sourceReference: reference || null,
        rawData: JSON.parse(JSON.stringify(row)),
      };
    });
}
