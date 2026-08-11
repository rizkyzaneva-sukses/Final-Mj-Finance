import * as XLSX from "xlsx";
import type { NormalizedTransaction } from "@/lib/matching";

/**
 * Parse file Excel mutasi bank.
 *
 * Format kolom (header baris 1):
 *   Tanggal | Deskripsi | Nominal | Arah
 *
 * - Tanggal: YYYY-MM-DD atau DD/MM/YYYY atau angka Excel serial date
 * - Deskripsi: teks bebas
 * - Nominal: angka positif (tanpa pemisah ribuan)
 * - Arah: IN / OUT / Masuk / Keluar / + / -
 */

type Row = {
  tanggal: string;
  deskripsi: string;
  nominal: number;
  arah: string;
};

const HEADER_ALIASES: Record<string, keyof Row> = {
  tanggal: "tanggal",
  date: "tanggal",
  tgl: "tanggal",
  deskripsi: "deskripsi",
  description: "deskripsi",
  desc: "deskripsi",
  keterangan: "deskripsi",
  nominal: "nominal",
  amount: "nominal",
  jumlah: "nominal",
  nilai: "nominal",
  arah: "arah",
  direction: "arah",
  masuk: "arah",
  keluar: "arah",
  type: "arah",
  in: "arah",
  out: "arah",
  "in/out": "arah",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number") {
    // Excel serial date
    const d = new Date((value - 25569) * 86400 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const s = String(value ?? "").trim();
  if (!s) return null;

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;

  // DD/MM/YY
  const dmy2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (dmy2) {
    const year = 2000 + Number(dmy2[3]);
    return `${year}-${pad(Number(dmy2[2]))}-${pad(Number(dmy2[1]))}`;
  }

  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Math.abs(value);
  const s = String(value ?? "")
    .replace(/[Rp\s]/gi, "")
    .replace(/\./g, "")  // thousand separator titik
    .replace(/,/g, "."); // koma sebagai desimal
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function parseDirection(value: unknown): "IN" | "OUT" | null {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "IN" || s === "MASUK" || s === "+" || s === "CR" || s === "KREDIT") return "IN";
  if (s === "OUT" || s === "KELUAR" || s === "-" || s === "DB" || s === "DEBIT") return "OUT";
  return null;
}

export function parseBankXlsx(
  buffer: Buffer,
  accountHolder: string | null,
  accountNumber: string | null,
): NormalizedTransaction[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (!rows.length) throw new Error("File Excel kosong.");

  // Map header aliases
  const rawHeaders = Object.keys(rows[0]);
  const colMap = new Map<string, keyof Row>();
  for (const h of rawHeaders) {
    const key = h.toLowerCase().trim().replace(/[^a-z0-9/]/g, "");
    const mapped = HEADER_ALIASES[key];
    if (mapped) colMap.set(h, mapped);
  }

  if (!colMap.has(rawHeaders[0]) || !colMap.has(rawHeaders[1])) {
    throw new Error(
      "Header tidak dikenali. Gunakan: Tanggal | Deskripsi | Nominal | Arah"
    );
  }

  const transactions: NormalizedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped: Record<string, string | number | undefined> = {};
    for (const entry of Array.from(colMap)) {
      const header = entry[0];
      const field = entry[1];
      mapped[field] = raw[header] as string;
    }

    const dateStr = parseDateCell(mapped.tanggal);
    const description = String(mapped.deskripsi ?? "").trim();
    const amount = parseAmount(mapped.nominal);
    const direction = parseDirection(mapped.arah);

    if (!dateStr || !description || !amount || !direction) {
      errors.push(`Baris ${i + 2}: data tidak lengkap (tgl="${mapped.tanggal}", desc="${description}", amt=${amount}, dir=${direction})`);
      continue;
    }

    transactions.push({
      transactionDate: new Date(`${dateStr}T12:00:00+07:00`),
      description,
      amount,
      direction,
      source: "BANK_SCREENSHOT" as const,
      accountHolder: accountHolder || null,
      accountNumber: accountNumber || null,
      sourceReference: null,
    });
  }

  if (errors.length && !transactions.length) {
    throw new Error(`Semua baris gagal dibaca:\n${errors.slice(0, 10).join("\n")}`);
  }

  return transactions;
}
