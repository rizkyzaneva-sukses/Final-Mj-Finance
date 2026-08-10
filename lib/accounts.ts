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
  /** Nomor rekening resmi (hanya digit). Dipakai fallback kalau nama pemilik kosong / beda ejaan. */
  accountNumbers?: readonly string[];
};

export const TRACKED_ACCOUNTS: readonly TrackedAccount[] = [
  {
    label: "Muhammad Rizky",
    matcher: "muhammad rizky",
    usesQrisEstimate: false,
    accountNumbers: ["0770015477"],
  },
  {
    label: "Sugiarsa",
    matcher: "sugiarsa",
    usesQrisEstimate: true,
    // VIDO / mutasi BCA Sugiarsa
    accountNumbers: ["0590040242"],
  },
] as const;

export function digitsOnlyAccount(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

/** Cocokkan nomor rekening ke label rekening terpantau (termasuk nomor resmi di TRACKED_ACCOUNTS). */
export function trackedLabelByAccountNumber(accountNumber: string | null | undefined) {
  const number = digitsOnlyAccount(accountNumber);
  if (!number) return null;
  for (const account of TRACKED_ACCOUNTS) {
    if (account.accountNumbers?.some((n) => n === number)) return account.label;
  }
  return null;
}

/** Cocokkan nama pemilik ke label rekening terpantau. */
export function trackedLabelByHolder(accountHolder: string | null | undefined) {
  const match = TRACKED_ACCOUNTS.find((account) => holderMatches(accountHolder, account.matcher));
  return match?.label ?? null;
}

/**
 * Satu sumber kebenaran: siapa pemilik baris mutasi/saldo awal.
 * Urutan: nama pemilik → nomor resmi di TRACKED_ACCOUNTS → peta nomor dari baris lain.
 */
export function resolveTrackedAccountLabel(
  accountHolder: string | null | undefined,
  accountNumber: string | null | undefined,
  numberToLabel?: Map<string, string> | null,
) {
  const byHolder = trackedLabelByHolder(accountHolder);
  if (byHolder) return byHolder;
  const byKnownNumber = trackedLabelByAccountNumber(accountNumber);
  if (byKnownNumber) return byKnownNumber;
  const number = digitsOnlyAccount(accountNumber);
  if (number && numberToLabel?.has(number)) return numberToLabel.get(number) ?? null;
  return null;
}

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
