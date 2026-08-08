import * as XLSX from "xlsx";
import type { NormalizedTransaction } from "@/lib/matching";
import { parseIdrInput, roundMoney } from "@/lib/money";

type QrisRow = Record<string, string | number | null | undefined>;

/** Maksimal alasan baris gagal yang ikut ditampilkan pada pesan error. */
const MAX_REPORTED_PROBLEMS = 10;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Ubah komponen tanggal/jam WIB menjadi Date yang benar.
 * Semua jalur parsing bermuara ke sini supaya offset +07:00 hanya ditulis di satu tempat.
 */
function jakartaStamp(
  year: number | string,
  month: number | string,
  day: number | string,
  hour: number | string,
  minute: number | string,
  second: number | string,
) {
  const iso = `${year}-${pad(Number(month))}-${pad(Number(day))}T${pad(Number(hour))}:${pad(Number(minute))}:${pad(Number(second))}+07:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse tanggal QRIS ke waktu Jakarta (WIB).
 *
 * PENTING: SheetJS (`XLSX.read(..., { cellDates: true })`) mengembalikan Date yang
 * meng-encode *wall time* sel sebagai UTC — nilai "2026-03-01 17:30" di Excel menjadi
 * `2026-03-01T17:30:00Z`. Kalau Date itu dipakai apa adanya, transaksi pukul 17:00–23:59 WIB
 * tersimpan ke TANGGAL BERIKUTNYA (geser 7 jam) dan bocor ke periode laporan bulan lain.
 * Jadi komponen UTC-nya dibaca apa adanya lalu di-anchor ulang ke +07:00 — logika yang sama
 * persis dengan `jakartaDate` di lib/historical-import.ts (dengan `includeTime = true`,
 * karena QRIS punya kolom APPROVAL_DATE_TIME).
 */
function parseQrisDate(value: unknown, excelRow: number): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid.`);
    }
    const parsed = jakartaStamp(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
    );
    if (!parsed) throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid.`);
    return parsed;
  }

  const source = text(value);
  if (!source) throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid: kosong.`);

  // Format Indonesia DD/MM/YYYY atau DD-MM-YYYY, jam opsional.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(source);
  if (dmy) {
    const [, day, month, year, hour, minute, second] = dmy;
    const hasTime = hour !== undefined;
    const parsed = hasTime
      ? jakartaStamp(year, month, day, hour, minute ?? 0, second ?? 0)
      : jakartaStamp(year, month, day, 12, 0, 0);
    if (!parsed) throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid: ${source}`);
    return parsed;
  }

  // Format YYYY-MM-DD atau YYYY/MM/DD, jam opsional (pemisah spasi maupun "T").
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(source);
  if (ymd) {
    const [, year, month, day, hour, minute, second] = ymd;
    const hasTime = hour !== undefined;
    // Tanpa jam dipatok 12:00 WIB (sama seperti lib/historical-import.ts) supaya
    // pembulatan zona waktu tidak pernah menggeser tanggalnya.
    const parsed = hasTime
      ? jakartaStamp(year, month, day, hour, minute ?? 0, second ?? 0)
      : jakartaStamp(year, month, day, 12, 0, 0);
    if (!parsed) throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid: ${source}`);
    return parsed;
  }

  throw new Error(`Tanggal QRIS baris ${excelRow} tidak valid: ${source}`);
}

/**
 * Nominal QRIS selalu positif. Angka asli dari Excel dipakai langsung supaya tidak
 * salah tafsir sebagai pemisah ribuan; teks dilewatkan ke `parseIdrInput` agar konsisten
 * dengan seluruh aplikasi ("1.500.000" → 1500000).
 */
function parseQrisAmount(value: unknown): number | null {
  const parsed = typeof value === "number" && Number.isFinite(value) ? roundMoney(value) : parseIdrInput(value);
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function parseQrisWorkbook(buffer: Buffer): NormalizedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets.Report ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Worksheet QRIS tidak ditemukan.");
  const rows = XLSX.utils.sheet_to_json<QrisRow>(sheet, { defval: null });

  const transactions: NormalizedTransaction[] = [];
  const problems: string[] = [];
  let approvedRows = 0;

  rows.forEach((row, index) => {
    // Baris 1 di Excel adalah header, jadi data indeks ke-0 = baris 2.
    const excelRow = index + 2;
    if (text(row.TRANSACTION_STATUS).toUpperCase() !== "APPROVED") return;
    approvedRows++;

    try {
      const amount = parseQrisAmount(row.AMOUNT);
      if (amount === null) {
        throw new Error(`Nominal QRIS baris ${excelRow} tidak valid: ${text(row.AMOUNT) || "kosong"}.`);
      }

      const transactionDate = parseQrisDate(row.APPROVAL_DATE_TIME || row.CREATED_DATE, excelRow);
      // Urutan fallback dipertahankan persis seperti sebelumnya supaya fingerprint tidak berubah.
      const reference = String(row.TRANSACTION_ID || row.RRN || row.INVOICE_NUMBER || "").trim();

      transactions.push({
        transactionDate,
        description: `QRIS ${String(row.MERCHANT_NAME || "Muda Juara")} - RRN ${String(row.RRN || "-")}`,
        amount,
        direction: "IN" as const,
        source: "QRIS_XLSX" as const,
        sourceReference: reference || null,
        rawData: JSON.parse(JSON.stringify(row)),
      });
    } catch (error) {
      // Satu baris rusak tidak boleh membatalkan seluruh file — catat alasannya lalu lanjut.
      problems.push(error instanceof Error ? error.message : `Baris ${excelRow} gagal dibaca.`);
    }
  });

  if (!transactions.length) {
    const detail = problems.length
      ? problems.slice(0, MAX_REPORTED_PROBLEMS).join(" ") +
        (problems.length > MAX_REPORTED_PROBLEMS ? ` (+${problems.length - MAX_REPORTED_PROBLEMS} baris bermasalah lainnya)` : "")
      : approvedRows
        ? "Semua baris APPROVED gagal dibaca."
        : "Tidak ada baris berstatus APPROVED di dalam file.";
    throw new Error(`Tidak ada baris QRIS yang bisa diimpor. ${detail}`);
  }

  if (problems.length) {
    console.warn(
      `Impor QRIS: ${problems.length} baris dilewati karena tidak valid. ${problems
        .slice(0, MAX_REPORTED_PROBLEMS)
        .join(" ")}`,
    );
  }

  return transactions;
}
