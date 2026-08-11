import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/template/mutasi-bank
 * Download template Excel untuk import mutasi bank.
 */
export async function GET() {
  const wb = XLSX.utils.book_new();

  const data = [
    ["Tanggal", "Deskripsi", "Nominal", "Arah"],
    ["2026-08-03", "TRF BATCH MYBB - PEMBAYARAN TRX 03 AGS", 57425, "IN"],
    ["2026-08-03", "MBSTRF 0590040242 to 0770015477", 11163304, "OUT"],
    ["2026-08-05", "PEMBELIAN DI TOKOPEDIA", 150000, "OUT"],
    ["2026-08-06", "QRIS PAYMENT MERCHANT ABC", 250000, "IN"],
    ["2026-08-07", "BIAYA ADM BANK", 5000, "OUT"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Lebar kolom
  ws["!cols"] = [
    { wch: 12 }, // Tanggal
    { wch: 50 }, // Deskripsi
    { wch: 15 }, // Nominal
    { wch: 6 },  // Arah
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Mutasi");

  // Sheet instruksi
  const instruksi = XLSX.utils.aoa_to_sheet([
    ["FORMAT IMPORT MUTASI BANK"],
    [""],
    ["Kolom yang wajib ada (baris 1 = header):"],
    ["  Tanggal  — format: YYYY-MM-DD atau DD/MM/YYYY"],
    ["  Deskripsi — teks bebas"],
    ["  Nominal  — angka positif tanpa titik/koma"],
    ["  Arah     — IN (masuk) atau OUT (keluar)"],
    [""],
    ["Variasi yang dikenali untuk kolom Arah:"],
    ["  Masuk: IN, MASUK, +, CR, KREDIT"],
    ["  Keluar: OUT, KELUAR, -, DB, DEBIT"],
    [""],
    ["Variasi header yang dikenali:"],
    ["  Tanggal / Date / Tgl"],
    ["  Deskripsi / Description / Desc / Keterangan"],
    ["  Nominal / Amount / Jumlah / Nilai"],
    ["  Arah / Direction / Masuk / Keluar / Type"],
    [""],
    ["Tips:"],
    ["  - Pastikan setiap baris LENGKAP (tidak ada kolom kosong)"],
    ["  - TRF BATCH MYBB akan otomatis di-skip (QRIS settlement)"],
    ["  - Pilih Rekening Tujuan sebelum upload"],
  ]);
  instruksi["!cols"] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, instruksi, "Instruksi");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Template Mutasi Bank.xlsx"',
    },
  });
}
