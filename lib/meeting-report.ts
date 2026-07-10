import type { TransactionSource } from "@prisma/client";
import { db } from "@/lib/db";
import { getReportData } from "@/lib/reports";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";
import { Prisma } from "@prisma/client";

const bankSources: TransactionSource[] = ["BANK_PDF", "BANK_SCREENSHOT"];
const QRIS_FEE_RATE = 0.007;
const trackedAccounts = [
  { label: "Muhammad Rizky", matcher: "muhammad rizky", usesQrisEstimate: false },
  { label: "Sugiarsa", matcher: "sugiarsa", usesQrisEstimate: true },
] as const;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type MeetingAccountRow = {
  label: string;
  accountNumber: string | null;
  usesQrisEstimate: boolean;
  confirmedBalance: number;
  qrisEstimateGross: number;
  qrisEstimateFee: number;
  qrisEstimateNet: number;
  estimatedBalance: number;
  lastMutationAt: Date | null;
  staleDays: number | null;
};

export async function getBalanceEstimateSummary(endDate: Date) {
  const [balanceRows, qrisRows, qrisResets] = await Promise.all([
    db.transaction.findMany({
      where: {
        isDraft: false,
        transactionDate: { lte: endDate },
        OR: [
          { source: { in: bankSources } },
          { source: "MANUAL" as const, sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
        ],
      },
      select: {
        accountHolder: true,
        accountNumber: true,
        direction: true,
        amount: true,
        source: true,
        transactionDate: true,
      },
      orderBy: { transactionDate: "asc" },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        direction: "IN",
        source: "QRIS_XLSX",
        transactionDate: { lte: endDate },
      },
      select: { transactionDate: true, amount: true },
      orderBy: { transactionDate: "asc" },
      }),
      db.qrisReset.findMany({
      orderBy: { resetAt: "desc" },
      }),
      ]);

      const latestResetByAccount = new Map<string, Date>();
      for (const reset of qrisResets) {
      const key = reset.accountNumber || reset.accountHolder || "";
      if (!latestResetByAccount.has(key)) {
      latestResetByAccount.set(key, reset.resetAt);
      }
      }

  const numberToLabel = new Map<string, string>();
  for (const account of trackedAccounts) {
    for (const row of balanceRows) {
      if (row.accountNumber && String(row.accountHolder || "").toLocaleLowerCase("id-ID").includes(account.matcher)) {
        numberToLabel.set(row.accountNumber, account.label);
      }
    }
  }

  const accountRows: MeetingAccountRow[] = trackedAccounts.map((account) => {
    const relevant = balanceRows.filter((row) => {
      const matchesByHolder = String(row.accountHolder || "").toLocaleLowerCase("id-ID").includes(account.matcher);
      const matchesByNumber = row.accountNumber ? numberToLabel.get(row.accountNumber) === account.label : false;
      return matchesByHolder || matchesByNumber;
    });
    const confirmedBalance = relevant.reduce((sum, row) => sum + (row.direction === "IN" ? Number(row.amount) : -Number(row.amount)), 0);
    const accountNumber = relevant.find((row) => row.accountNumber)?.accountNumber || null;
    const lastMutationAt = relevant
      .filter((row) => bankSources.includes(row.source))
      .reduce<Date | null>((latest, row) => !latest || row.transactionDate > latest ? row.transactionDate : latest, null);
    const accountKey = accountNumber || "";
    const lastResetAt = latestResetByAccount.get(accountKey) || latestResetByAccount.get(account.matcher) || null;
    const pendingQris = account.usesQrisEstimate
      ? qrisRows.filter((row) => {
          if (lastResetAt && row.transactionDate <= lastResetAt) return false;
          return true;
        })
      : [];
    const qrisEstimateGross = pendingQris.reduce((sum, row) => sum + Number(row.amount), 0);
    const qrisEstimateFee = roundMoney(qrisEstimateGross * QRIS_FEE_RATE);
    const qrisEstimateNet = roundMoney(qrisEstimateGross - qrisEstimateFee);
    const estimatedBalance = roundMoney(confirmedBalance + qrisEstimateNet);
    const staleDays = lastMutationAt ? Math.max(0, Math.floor((endDate.getTime() - lastMutationAt.getTime()) / 86_400_000)) : null;

    return {
      label: account.label,
      accountNumber,
      usesQrisEstimate: account.usesQrisEstimate,
      confirmedBalance: roundMoney(confirmedBalance),
      qrisEstimateGross: roundMoney(qrisEstimateGross),
      qrisEstimateFee,
      qrisEstimateNet,
      estimatedBalance,
      lastMutationAt,
      staleDays,
    };
  });

  const confirmedTotal = roundMoney(accountRows.reduce((sum, row) => sum + row.confirmedBalance, 0));
  const qrisPendingGross = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateGross, 0));
  const qrisPendingFee = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateFee, 0));
  const qrisPendingNet = roundMoney(accountRows.reduce((sum, row) => sum + row.qrisEstimateNet, 0));
  const estimatedTotal = roundMoney(accountRows.reduce((sum, row) => sum + row.estimatedBalance, 0));

  return {
    accountRows,
    confirmedTotal,
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
        source: { in: bankSources },
        transactionDate: { gte: startDate, lte: endDate },
      },
      select: { direction: true, amount: true },
    }),
    db.transaction.count({
      where: {
        isDraft: false,
        status: "UNMATCHED",
        transactionDate: { gte: startDate, lte: endDate },
      },
    }),
  ]);
  const bankIncome = roundMoney(bankPeriodRows.filter((row) => row.direction === "IN").reduce((sum, row) => sum + Number(row.amount), 0));
  const bankExpense = roundMoney(bankPeriodRows.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + Number(row.amount), 0));
  const eventHighlights = [...reportData.eventRows]
    .sort((a, b) => b.net - a.net || b.income - a.income)
    .slice(0, 5);

  return {
    ...reportData,
    bankIncome,
    bankExpense,
    bankNet: roundMoney(bankIncome - bankExpense),
    unmatchedCount,
    ...balanceSummary,
    eventHighlights,
  };
}
