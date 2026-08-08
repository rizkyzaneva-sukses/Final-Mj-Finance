import type { Prisma, TransactionSource } from "@prisma/client";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

/**
 * Satu sumber kebenaran untuk "rekening mana yang dipantau" dan
 * "baris mana yang membentuk saldo rekening".
 *
 * Sebelumnya daftar ini diduplikasi di lib/meeting-report.ts dan app/(panel)/dashboard/page.tsx
 * dengan aturan pencocokan yang berbeda-beda, sehingga saldo di dua tempat tidak pernah cocok.
 *
 * CATATAN: daftar ini masih statis. Memindahkannya ke tabel master butuh migrasi Prisma
 * dan belum dikerjakan — lihat catatan audit.
 */
export const BANK_SOURCES: TransactionSource[] = ["BANK_PDF", "BANK_SCREENSHOT"];

export type TrackedAccount = {
  label: string;
  matcher: string;
  usesQrisEstimate: boolean;
};

export const TRACKED_ACCOUNTS: readonly TrackedAccount[] = [
  { label: "Muhammad Rizky", matcher: "muhammad rizky", usesQrisEstimate: false },
  { label: "Sugiarsa", matcher: "sugiarsa", usesQrisEstimate: true },
] as const;

/** Label khusus untuk mutasi bank yang tidak cocok ke satu pun rekening terpantau. */
export const UNCLAIMED_ACCOUNT_LABEL = "Rekening lain / belum dikenali";

export function normalizeHolder(value: string | null | undefined) {
  return String(value || "").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim();
}

export function holderMatches(holder: string | null | undefined, matcher: string) {
  return normalizeHolder(holder).includes(matcher);
}

/**
 * Kunci reset QRIS. Harus dipakai SAMA PERSIS saat menulis (POST /api/qris-reset)
 * dan saat membaca (lib/meeting-report.ts), kalau tidak resetnya tidak akan pernah cocok.
 */
export function qrisResetKey(accountNumber: string | null | undefined, accountHolder: string | null | undefined) {
  const number = String(accountNumber || "").replace(/\D/g, "");
  return number || normalizeHolder(accountHolder);
}

/**
 * Baris yang membentuk saldo rekening: seluruh mutasi bank + saldo awal manual.
 * Sengaja TIDAK memfilter `status` — status (MATCHED/UNMATCHED/SKIPPED) adalah soal
 * klasifikasi pelaporan, bukan soal apakah uangnya benar-benar bergerak di rekening.
 */
export function balanceSourceWhere(): Prisma.TransactionWhereInput {
  return {
    OR: [
      { source: { in: BANK_SOURCES } },
      { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
    ],
  };
}

/** Baris yang HARUS dikeluarkan dari laporan arus kas: saldo awal manual. */
export function excludeOpeningBalanceWhere(): Prisma.TransactionWhereInput {
  return { NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } } };
}
