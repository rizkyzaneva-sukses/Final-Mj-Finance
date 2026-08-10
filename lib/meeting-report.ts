import { db } from "@/lib/db";
import { getReportData } from "@/lib/reports";
import { BATCH_QRIS_MARKER } from "@/lib/matching";
import { qrisFeeFor, roundMoney } from "@/lib/money";
import {
  BANK_SOURCES,
  TRACKED_ACCOUNTS,
  UNCLAIMED_ACCOUNT_LABEL,
  balanceSourceWhere,
  holderMatches,
  qrisResetKey,
} from "@/lib/accounts";

/** Sumber mutasi bank yang dirinci pada `bySource`. */
export type BankSourceKey = "BANK_PDF" | "BANK_SCREENSHOT";

export type MeetingAccountRow = {
  label: string;
  accountNumber: string | null;
  usesQrisEstimate: boolean;
  /** Saldo awal rekening (bisa negatif). 0 jika belum ditetapkan. */
  openingBalance: number;
  /** Tanggal saldo awal terbaru untuk rekening ini, null jika belum ada. */
  openingBalanceAt: Date | null;
  confirmedBalance: number;
  qrisEstimateGross: number;
  qrisEstimateFee: number;
  qrisEstimateNet: number;
  estimatedBalance: number;
  lastMutationAt: Date | null;
  staleDays: number | null;
  /** Total IN untuk rekening ini (mutasi bank + saldo awal), basis sama dengan `confirmedBalance`. */
  income: number;
  /** Total OUT untuk rekening ini, basis sama dengan `confirmedBalance`. */
  expense: number;
  /**
   * Rincian per sumber impor, dihitung dari basis yang SAMA dengan `confirmedBalance`
   * (tanpa filter `status`) supaya angka di dashboard tidak pernah berbeda dari saldo utama.
   * Saldo awal manual sengaja tidak muncul di sini karena bukan mutasi bank.
   */
  bySource: Record<BankSourceKey, { income: number; expense: number; net: number }>;
};

/** Mutasi pembentuk saldo yang tidak cocok ke satu pun rekening terpantau. */
export type MeetingUnclaimedRow = {
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

const digitsOnly = (value: string | null | undefined) => String(value || "").replace(/\D/g, "");

const sumBy = (rows: { direction: string; amount: unknown }[], direction: "IN" | "OUT") =>
  rows.filter((row) => row.direction === direction).reduce((sum, row) => sum + Number(row.amount), 0);

const laterOf = (a: Date | null, b: Date | null) => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

export async function getBalanceEstimateSummary(endDate: Date) {
  const [balanceRows, qrisRows, qrisResets] = await Promise.all([
    db.transaction.findMany({
      where: {
        isDraft: false,
        transactionDate: { lte: endDate },
        ...balanceSourceWhere(),
      },
      select: {
        accountHolder: true,
        accountNumber: true,
        direction: true,
        amount: true,
        source: true,
        transactionDate: true,
        description: true,
      },
      orderBy: { transactionDate: "asc" },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        direction: "IN",
        source: "QRIS_XLSX",
        transactionDate: { lte: endDate },
        // Sengaja TANPA filter `status`: uang QRIS tetap nyata walaupun barisnya belum di-assign
        // ke kegiatan. Kalau difilter `MATCHED`, estimasi berubah-ubah tiap kali orang meng-assign
        // transaksi padahal uang riilnya tidak bergerak sama sekali.
        //
        // `SKIPPED` tetap dibuang, karena pada baris QRIS_XLSX status itu hanya muncul untuk
        // (a) duplikasi lintas sumber — uangnya sudah terhitung di mutasi bank, atau
        // (b) "Dilewati manual" — sengaja dianggap bukan pemasukan sah.
        // Catatan: baris SKIPPED bertanda BATCH_QRIS_MARKER ("Gabungan pencairan QRIS...") adalah
        // baris MUTASI BANK, bukan QRIS_XLSX, jadi tidak terkena filter ini dan tetap menambah
        // saldo terkonfirmasi seperti seharusnya.
        status: { not: "SKIPPED" },
      },
      select: {
        transactionDate: true,
        amount: true,
        accountHolder: true,
        accountNumber: true,
      },
      orderBy: { transactionDate: "asc" },
    }),
    db.qrisReset.findMany({ orderBy: { resetAt: "desc" } }),
  ]);

  // Kunci reset dibuat dengan helper yang SAMA PERSIS dipakai saat menulis di
  // POST /api/qris-reset, kalau tidak resetnya tidak akan pernah cocok (bug lama:
  // UI mengirim label "Sugiarsa" sementara pembacanya mencari matcher "sugiarsa").
  const latestResetByKey = new Map<string, Date>();
  for (const reset of qrisResets) {
    const key = qrisResetKey(reset.accountNumber, reset.accountHolder);
    if (!key) continue;
    // qrisResets sudah urut `resetAt` menurun, jadi entri pertama adalah yang terbaru.
    if (!latestResetByKey.has(key)) latestResetByKey.set(key, reset.resetAt);
  }

  // Peta nomor rekening -> label, supaya baris dengan `accountHolder` kosong (umum pada impor
  // screenshot) tetap terklaim ke rekening yang benar lewat nomor rekeningnya.
  const numberToLabel = new Map<string, string>();
  for (const row of [...balanceRows, ...qrisRows]) {
    const number = digitsOnly(row.accountNumber);
    if (!number || numberToLabel.has(number)) continue;
    const owner = TRACKED_ACCOUNTS.find((account) => holderMatches(row.accountHolder, account.matcher));
    if (owner) numberToLabel.set(number, owner.label);
  }

  /** Menentukan pemilik satu baris. Selalu mengembalikan paling banyak SATU label — tidak ada baris yang terhitung dobel. */
  const resolveLabel = (accountHolder: string | null, accountNumber: string | null) => {
    const byHolder = TRACKED_ACCOUNTS.find((account) => holderMatches(accountHolder, account.matcher));
    if (byHolder) return byHolder.label;
    const number = digitsOnly(accountNumber);
    return number ? numberToLabel.get(number) ?? null : null;
  };

  type BalanceRow = (typeof balanceRows)[number];
  type QrisRow = (typeof qrisRows)[number];

  const balanceByLabel = new Map<string, BalanceRow[]>();
  const unclaimedRows: BalanceRow[] = [];
  for (const row of balanceRows) {
    const label = resolveLabel(row.accountHolder, row.accountNumber);
    if (!label) {
      unclaimedRows.push(row);
      continue;
    }
    const bucket = balanceByLabel.get(label);
    if (bucket) bucket.push(row);
    else balanceByLabel.set(label, [row]);
  }

  // Rekening penampung default untuk baris QRIS yang tidak membawa informasi rekening sama sekali
  // (impor QRIS lama tidak mengisi accountHolder/accountNumber). Fallback ini SATU rekening saja,
  // supaya satu baris QRIS tidak pernah terhitung di dua rekening sekaligus.
  const qrisFallbackLabel =
    (TRACKED_ACCOUNTS.find((account) => account.usesQrisEstimate) ?? TRACKED_ACCOUNTS[0])?.label ?? null;

  const qrisByLabel = new Map<string, QrisRow[]>();
  for (const row of qrisRows) {
    // Bila datanya ada, baris QRIS mengikuti rekening tujuannya sendiri (lihat parseQris di
    // lib/historical-import.ts). Bila tidak ada — atau rekeningnya tidak terpantau — baris tetap
    // jatuh ke rekening fallback agar uangnya tidak hilang diam-diam dari estimasi.
    const label = resolveLabel(row.accountHolder, row.accountNumber) ?? qrisFallbackLabel;
    if (!label) continue;
    const bucket = qrisByLabel.get(label);
    if (bucket) bucket.push(row);
    else qrisByLabel.set(label, [row]);
  }

  const accountRows: MeetingAccountRow[] = TRACKED_ACCOUNTS.map((account) => {
    const relevant = balanceByLabel.get(account.label) ?? [];
    const bankRows = relevant.filter((row) => BANK_SOURCES.includes(row.source as BankSourceKey));
    // balanceSourceWhere() hanya mengizinkan MANUAL untuk baris saldo awal, jadi filter source cukup.
    const openingRows = relevant.filter((row) => row.source === "MANUAL");

    const income = sumBy(relevant, "IN");
    const expense = sumBy(relevant, "OUT");
    const confirmedBalance = income - expense;
    const openingIncome = sumBy(openingRows, "IN");
    const openingExpense = sumBy(openingRows, "OUT");
    const openingBalance = roundMoney(openingIncome - openingExpense);
    const openingBalanceAt = openingRows.reduce<Date | null>(
      (latest, row) => (!latest || row.transactionDate > latest ? row.transactionDate : latest),
      null,
    );

    const bySource = BANK_SOURCES.reduce((acc, source) => {
      const rows = bankRows.filter((row) => row.source === source);
      const sourceIncome = roundMoney(sumBy(rows, "IN"));
      const sourceExpense = roundMoney(sumBy(rows, "OUT"));
      acc[source as BankSourceKey] = {
        income: sourceIncome,
        expense: sourceExpense,
        net: roundMoney(sourceIncome - sourceExpense),
      };
      return acc;
    }, {} as Record<BankSourceKey, { income: number; expense: number; net: number }>);

    const accountNumber =
      relevant.find((row) => digitsOnly(row.accountNumber))?.accountNumber ??
      (qrisByLabel.get(account.label) ?? []).find((row) => digitsOnly(row.accountNumber))?.accountNumber ??
      null;

    const lastMutationAt = bankRows.reduce<Date | null>(
      (latest, row) => (!latest || row.transactionDate > latest ? row.transactionDate : latest),
      null,
    );

    // Batas "sudah cair": reset manual dari tombol di dashboard, ATAU pencairan batch QRIS yang
    // memang sudah masuk sebagai mutasi bank (ditandai BATCH_QRIS_MARKER, lihat lib/matching.ts).
    // Tanpa batas otomatis ini estimasi akan menumpuk seluruh QRIS sepanjang sejarah, padahal
    // uangnya sudah tercermin di saldo terkonfirmasi.
    const lastResetAt = [
      qrisResetKey(accountNumber, null),
      qrisResetKey(null, account.label),
      qrisResetKey(null, account.matcher),
    ].reduce<Date | null>((latest, key) => (key ? laterOf(latest, latestResetByKey.get(key) ?? null) : latest), null);
    const lastDisbursementAt = bankRows
      .filter((row) => row.direction === "IN" && row.description.toUpperCase().includes(BATCH_QRIS_MARKER))
      .reduce<Date | null>((latest, row) => laterOf(latest, row.transactionDate), null);
    const qrisCutoff = laterOf(lastResetAt, lastDisbursementAt);

    const pendingQris = (qrisByLabel.get(account.label) ?? []).filter(
      (row) => !qrisCutoff || row.transactionDate > qrisCutoff,
    );

    const qrisEstimateGross = pendingQris.reduce((sum, row) => sum + Number(row.amount), 0);
    // Bank memotong fee per transaksi, jadi fee agregat dijumlahkan dari hasil per transaksi.
    const qrisEstimateFee = roundMoney(pendingQris.reduce((sum, row) => sum + qrisFeeFor(Number(row.amount)), 0));
    const qrisEstimateNet = roundMoney(qrisEstimateGross - qrisEstimateFee);
    const estimatedBalance = roundMoney(confirmedBalance + qrisEstimateNet);
    const staleDays = lastMutationAt
      ? Math.max(0, Math.floor((endDate.getTime() - lastMutationAt.getTime()) / 86_400_000))
      : null;

    return {
      label: account.label,
      accountNumber,
      usesQrisEstimate: account.usesQrisEstimate,
      openingBalance,
      openingBalanceAt,
      confirmedBalance: roundMoney(confirmedBalance),
      qrisEstimateGross: roundMoney(qrisEstimateGross),
      qrisEstimateFee,
      qrisEstimateNet,
      estimatedBalance,
      lastMutationAt,
      staleDays,
      income: roundMoney(income),
      expense: roundMoney(expense),
      bySource,
    };
  });

  const unclaimedIncome = roundMoney(sumBy(unclaimedRows, "IN"));
  const unclaimedExpense = roundMoney(sumBy(unclaimedRows, "OUT"));
  const unclaimed: MeetingUnclaimedRow | null = unclaimedRows.length
    ? {
        label: UNCLAIMED_ACCOUNT_LABEL,
        income: unclaimedIncome,
        expense: unclaimedExpense,
        net: roundMoney(unclaimedIncome - unclaimedExpense),
        count: unclaimedRows.length,
      }
    : null;

  // Total ikut menghitung bucket `unclaimed`. Kalau tidak, mutasi bank yang nama pemiliknya kosong
  // atau berbeda ejaan akan lenyap diam-diam dari total saldo.
  const confirmedTotal = roundMoney(
    accountRows.reduce((sum, row) => sum + row.confirmedBalance, 0) + (unclaimed?.net ?? 0),
  );
  const openingTotal = roundMoney(accountRows.reduce((sum, row) => sum + row.openingBalance, 0));
  const qrisPendingGross = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateGross, 0));
  const qrisPendingFee = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateFee, 0));
  const qrisPendingNet = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateNet, 0));
  const estimatedTotal = roundMoney(confirmedTotal + qrisPendingNet);

  return {
    accountRows,
    unclaimed,
    confirmedTotal,
    openingTotal,
    qrisPendingGross,
    qrisPendingFee,
    qrisPendingNet,
    estimatedTotal,
  };
}

export async function getMeetingReportData(startDate: Date, endDate: Date) {
  const [reportData, balanceSummary, bankPeriodRows, unmatchedCount] = await Promise.all([
    getReportData(startDate, endDate),
    getBalanceEstimateSummary(endDate),
    db.transaction.findMany({
      where: {
        isDraft: false,
        source: { in: BANK_SOURCES },
        transactionDate: { gte: startDate, lte: endDate },
      },
      select: { direction: true, amount: true, status: true },
    }),
    db.transaction.count({
      where: {
        isDraft: false,
        status: "UNMATCHED",
        transactionDate: { gte: startDate, lte: endDate },
      },
    }),
  ]);

  // `bankIncome`/`bankExpense` = SELURUH mutasi bank pada periode, tanpa memandang status
  // assignment. Itu basis yang benar untuk "uang yang benar-benar bergerak di rekening", tetapi
  // BUKAN basis yang sama dengan `reportData` (yang hanya berisi baris MATCHED dan mencakup
  // sumber non-bank seperti QRIS). Karena dua angka ini tampil berdampingan di halaman laporan,
  // varian `...Matched` di bawah disediakan supaya perbandingannya bisa apel-ke-apel.
  const bankIncome = roundMoney(sumBy(bankPeriodRows, "IN"));
  const bankExpense = roundMoney(sumBy(bankPeriodRows, "OUT"));
  const matchedBankRows = bankPeriodRows.filter((row) => row.status === "MATCHED");
  const bankIncomeMatched = roundMoney(sumBy(matchedBankRows, "IN"));
  const bankExpenseMatched = roundMoney(sumBy(matchedBankRows, "OUT"));

  const eventHighlights = [...reportData.eventRows]
    .sort((a, b) => b.net - a.net || b.income - a.income)
    .slice(0, 5);

  return {
    ...reportData,
    bankIncome,
    bankExpense,
    bankNet: roundMoney(bankIncome - bankExpense),
    bankIncomeMatched,
    bankExpenseMatched,
    bankNetMatched: roundMoney(bankIncomeMatched - bankExpenseMatched),
    unmatchedCount,
    ...balanceSummary,
    eventHighlights,
  };
}
