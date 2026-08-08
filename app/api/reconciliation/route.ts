import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TRACKED_ACCOUNTS,
  balanceSourceWhere,
  holderMatches,
  normalizeHolder,
} from "@/lib/accounts";
import { roundMoney } from "@/lib/money";

/**
 * Rekonsiliasi saldo rekening.
 *
 * BASIS PERHITUNGAN harus SAMA PERSIS dengan dashboard / laporan rapat, kalau tidak
 * user akan melihat selisih palsu yang tidak akan pernah bisa dijelaskan.
 * Sebelumnya file ini memfilter HANYA `accountNumber`, sedangkan lib/meeting-report.ts
 * mencocokkan berdasarkan nama pemilik ATAU nomor rekening. Transaksi hasil impor
 * screenshot sering punya `accountNumber` null sehingga ikut di dashboard tetapi
 * hilang di sini. Sekarang keduanya memakai `balanceSourceWhere()` + `TRACKED_ACCOUNTS`
 * + `holderMatches` dari @/lib/accounts.
 */

type ReconciliationItem = {
  accountNumber?: unknown;
  label?: unknown;
  actualBalance?: unknown;
};

export const runtime = "nodejs";

const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** Cocokkan sebuah teks (label dari dashboard atau nama pemilik) ke rekening terpantau. */
function trackedByLabel(value: unknown) {
  const normalized = normalizeHolder(String(value ?? ""));
  if (!normalized) return null;
  return (
    TRACKED_ACCOUNTS.find(
      (tracked) => normalizeHolder(tracked.label) === normalized || holderMatches(normalized, tracked.matcher),
    )?.label ?? null
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const items: ReconciliationItem[] = Array.isArray(body?.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ error: "Belum ada data rekening yang diisi." }, { status: 400 });
  }

  // Validasi tegas: nilai yang hilang BUKAN nol, dan NaN/Infinity harus ditolak
  // dengan pesan yang jelas — bukan diam-diam dianggap 0.
  const requests: { accountNumber: string; label: string | null; actualBalance: number }[] = [];
  for (const item of items) {
    const accountNumber = digitsOnly(item.accountNumber);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const identity = accountNumber || label;
    if (!identity) {
      return NextResponse.json(
        { error: "Data tidak valid: nomor rekening atau nama rekening wajib diisi." },
        { status: 400 },
      );
    }
    if (item.actualBalance === undefined || item.actualBalance === null || item.actualBalance === "") {
      return NextResponse.json(
        { error: `Saldo aktual untuk rekening ${identity} belum diisi. Kosongkan rekening yang tidak ikut diperiksa, jangan kirim tanpa nilai.` },
        { status: 400 },
      );
    }
    if (typeof item.actualBalance !== "number" || !Number.isFinite(item.actualBalance)) {
      return NextResponse.json(
        { error: `Saldo aktual untuk rekening ${identity} bukan angka yang sah. Gunakan format angka seperti 1.500.000.` },
        { status: 400 },
      );
    }
    requests.push({ accountNumber, label: label || null, actualBalance: roundMoney(item.actualBalance) });
  }

  // Satu query untuk seluruh baris pembentuk saldo (mutasi bank + saldo awal manual),
  // tanpa filter status — sama seperti balanceSourceWhere() dipakai di dashboard.
  const rows = await db.transaction.findMany({
    where: { isDraft: false, ...balanceSourceWhere() },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      direction: true,
      accountHolder: true,
      accountNumber: true,
      status: true,
    },
    orderBy: { transactionDate: "asc" },
  });

  // Klasifikasi baris ke rekening terpantau: nama pemilik dulu, lalu nomor rekening
  // yang sudah terbukti milik rekening itu (untuk baris yang nama pemiliknya tidak terbaca).
  const numberToTracked = new Map<string, string>();
  const rowTracked = new Map<string, string | null>();
  for (const row of rows) {
    const tracked = TRACKED_ACCOUNTS.find((account) => holderMatches(row.accountHolder, account.matcher));
    rowTracked.set(row.id, tracked?.label ?? null);
    const number = digitsOnly(row.accountNumber);
    if (tracked && number && !numberToTracked.has(number)) numberToTracked.set(number, tracked.label);
  }
  for (const row of rows) {
    if (rowTracked.get(row.id)) continue;
    const number = digitsOnly(row.accountNumber);
    const label = number ? numberToTracked.get(number) : undefined;
    if (label) rowTracked.set(row.id, label);
  }

  const claimedIds = new Set<string>();
  const requestedNumbers = new Set(requests.map((item) => item.accountNumber).filter(Boolean));

  const results = requests.map((item) => {
    // Rekening target: dari label yang dikirim client, atau dari nomor rekening yang
    // sudah dikenali sebagai milik salah satu rekening terpantau.
    const targetLabel =
      trackedByLabel(item.label) ?? (item.accountNumber ? numberToTracked.get(item.accountNumber) ?? null : null);

    const owned = rows.filter((row) => {
      if (targetLabel && rowTracked.get(row.id) === targetLabel) return true;
      if (item.accountNumber && digitsOnly(row.accountNumber) === item.accountNumber) return true;
      return false;
    });
    for (const row of owned) claimedIds.add(row.id);

    const calculatedBalance = roundMoney(
      owned.reduce((sum, row) => {
        const value = Number(row.amount);
        return sum + (row.direction === "IN" ? value : -value);
      }, 0),
    );
    const discrepancy = roundMoney(item.actualBalance - calculatedBalance);
    const match = Math.abs(discrepancy) < 0.01;

    // Baris yang HANYA tertangkap lewat nama pemilik — inilah yang dulu hilang dari
    // rekonsiliasi (umumnya hasil impor screenshot tanpa nomor rekening).
    const holderOnlyRows = owned.filter(
      (row) => !item.accountNumber || digitsOnly(row.accountNumber) !== item.accountNumber,
    );

    const suspiciousTransactions: {
      id: string;
      date: string;
      description: string;
      amount: number;
      direction: string;
      status: string;
      accountHolder: string | null;
      reason: string;
    }[] = [];

    if (!match) {
      const seenIds = new Set<string>();
      const push = (row: (typeof rows)[number], reason: string) => {
        if (seenIds.has(row.id)) return;
        seenIds.add(row.id);
        suspiciousTransactions.push({
          id: row.id,
          date: row.transactionDate.toISOString(),
          description: row.description,
          amount: Number(row.amount),
          direction: row.direction,
          status: row.status,
          accountHolder: row.accountHolder,
          reason,
        });
      };

      const unmatched = owned
        .filter((row) => row.status === "UNMATCHED")
        .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())
        .slice(0, 10);
      for (const row of unmatched) push(row, "Belum di-assign");

      const largest = [...owned].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
      for (const row of largest) {
        if (row.status === "UNMATCHED") push(row, "Nominal besar, belum di-assign");
      }

      const holderOnlySample = [...holderOnlyRows]
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5);
      for (const row of holderOnlySample) push(row, "Tanpa nomor rekening, dicocokkan lewat nama pemilik");

      suspiciousTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return {
      accountNumber: item.accountNumber,
      label: targetLabel || item.label || null,
      actualBalance: item.actualBalance,
      calculatedBalance,
      discrepancy,
      transactionCount: owned.length,
      // Berapa baris yang masuk hitungan hanya karena nama pemiliknya cocok.
      // Berguna untuk menjelaskan kenapa angka di sini berbeda dari versi lama.
      matchedByHolderOnlyCount: holderOnlyRows.length,
      match,
      transactions: suspiciousTransactions,
    };
  });

  // Baris pembentuk saldo yang tidak bisa dikaitkan ke rekening mana pun — penjelas
  // sisa selisih supaya user tahu ada uang yang belum punya rumah.
  const unclaimedRows = rows.filter((row) => {
    if (claimedIds.has(row.id)) return false;
    if (rowTracked.get(row.id)) return false;
    return !requestedNumbers.has(digitsOnly(row.accountNumber));
  });
  const unclaimedNet = roundMoney(
    unclaimedRows.reduce((sum, row) => {
      const value = Number(row.amount);
      return sum + (row.direction === "IN" ? value : -value);
    }, 0),
  );

  return NextResponse.json({
    results,
    unclaimed: {
      count: unclaimedRows.length,
      netAmount: unclaimedNet,
      samples: unclaimedRows
        .slice()
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          date: row.transactionDate.toISOString(),
          description: row.description,
          amount: Number(row.amount),
          direction: row.direction,
          accountHolder: row.accountHolder,
          accountNumber: row.accountNumber,
        })),
    },
  });
}
