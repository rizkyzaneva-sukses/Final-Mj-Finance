import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

import { excludeOpeningBalanceWhere } from "@/lib/accounts";
import { qrisFeeFor, roundMoney } from "@/lib/money";

export type MinistryReportRow = {
  code: number;
  ministry: string;
  income: number;
  expense: number;
  /**
   * Pemasukan - pengeluaran, BELUM dikurangi potongan QRIS.
   * Sengaja dipertahankan apa adanya karena ekspor Excel dan lembar F4 sudah memakai angka ini
   * sebagai "Arus Bersih" basis bruto. Untuk angka yang sebanding dengan `EventReportRow.net`
   * (sudah dikurangi fee), pakai `netAfterFee`.
   */
  net: number;
  /** BARU — akumulasi potongan QRIS 0,7% dari seluruh pemasukan kementerian ini (per transaksi). */
  qrisFee: number;
  /** BARU — pemasukan - fee - pengeluaran. Basis yang sebanding dengan `EventReportRow.net`. */
  netAfterFee: number;
  /** BARU — bagian yang juga muncul di tabel event (punya `eventId`). */
  eventIncome: number;
  eventExpense: number;
  /** BARU — bagian yang HANYA muncul di tabel kementerian (tanpa `eventId`). Ini penyebab utama total dua tabel berbeda. */
  nonEventIncome: number;
  nonEventExpense: number;
};

export type EventIncomeRow = { type: string; code: string | null; amount: number };
export type EventExpenseRow = { type: string; amount: number };

export type EventReportRow = {
  event: string;
  ministry: string;
  income: number;
  qrisFee: number;
  expense: number;
  net: number;
  incomeRows: EventIncomeRow[];
  /** BARU — rincian pengeluaran per jenis, sejalan dengan `getEventBreakdown`. */
  expenseRows: EventExpenseRow[];
};

/** Ringkasan sekelompok transaksi: berapa baris, berapa masuk, berapa keluar, berapa netonya. */
export type StatusSummary = { count: number; income: number; expense: number; net: number };

/** Transaksi yang ADA di periode/event tapi TIDAK ikut terhitung di laporan (bukan MATCHED). */
export type PendingSummary = {
  unmatched: StatusSummary;
  skipped: StatusSummary;
  total: StatusSummary;
};

export type ReportTotals = {
  /** Basis tabel kementerian: transaksi MATCHED yang punya kementerian aktif. */
  ministry: { income: number; expense: number; qrisFee: number; net: number; netAfterFee: number };
  /** Basis tabel event: transaksi MATCHED yang punya event DAN kementerian. */
  event: { income: number; expense: number; qrisFee: number; net: number };
  /** Selisih dua basis di atas: MATCHED bertanda kementerian tapi tanpa event. */
  nonEvent: { income: number; expense: number; qrisFee: number; net: number };
  /** MATCHED tapi tidak masuk tabel kementerian sama sekali (tanpa kementerian / kementerian nonaktif). */
  untagged: StatusSummary;
};

/**
 * Placeholder baris pemasukan untuk event yang hanya punya pengeluaran.
 * Nominalnya SELALU 0 supaya aman ikut ke-`reduce` di mana pun — tabel laporan dan
 * ekspor Excel sama-sama menjumlahkan `incomeRows[].amount`. Gunanya cuma menjaga
 * `rowSpan` tabel tetap valid saat sebuah event tidak punya pemasukan.
 */
const emptyIncomeRow = (): EventIncomeRow => ({ type: "—", code: null, amount: 0 });

type MoneyRow = { direction: string; amount: Prisma.Decimal | number };

type AggregatableRow = MoneyRow & {
  source: string;
  incomeTypeId?: string | null;
  expenseTypeId?: string | null;
  incomeType?: { name: string; uniqueCode: string | null } | null;
  expenseType?: { name: string } | null;
};

type EventAggregate = {
  income: number;
  expense: number;
  qrisFee: number;
  incomes: Map<string, EventIncomeRow>;
  expenses: Map<string, EventExpenseRow>;
};

function createEventAggregate(): EventAggregate {
  return { income: 0, expense: 0, qrisFee: 0, incomes: new Map(), expenses: new Map() };
}

/**
 * Satu-satunya tempat logika agregasi event ditulis — dipakai `getReportData` maupun
 * `getEventBreakdown` supaya keduanya tidak pernah lagi menghitung dengan cara berbeda.
 */
function addToEventAggregate(aggregate: EventAggregate, row: AggregatableRow) {
  const amount = Number(row.amount);
  if (row.direction === "OUT") {
    aggregate.expense += amount;
    const key = row.expenseTypeId || "other";
    const current = aggregate.expenses.get(key) || { type: row.expenseType?.name || "Pengeluaran lainnya", amount: 0 };
    current.amount += amount;
    aggregate.expenses.set(key, current);
    return;
  }
  aggregate.income += amount;
  // Bank memotong dan membulatkan PER transaksi, jadi fee dijumlahkan dari hasil per transaksi.
  if (row.source === "QRIS_XLSX") aggregate.qrisFee += qrisFeeFor(amount);
  const key = row.incomeTypeId || "other";
  const current = aggregate.incomes.get(key)
    || { type: row.incomeType?.name || "Pemasukan lainnya", code: row.incomeType?.uniqueCode || null, amount: 0 };
  current.amount += amount;
  aggregate.incomes.set(key, current);
}

function finalizeEventAggregate(aggregate: EventAggregate) {
  const income = roundMoney(aggregate.income);
  const expense = roundMoney(aggregate.expense);
  const qrisFee = roundMoney(aggregate.qrisFee);
  return {
    income,
    expense,
    qrisFee,
    net: roundMoney(income - qrisFee - expense),
    incomeRows: [...aggregate.incomes.values()].map((row) => ({ ...row, amount: roundMoney(row.amount) })),
    expenseRows: [...aggregate.expenses.values()].map((row) => ({ ...row, amount: roundMoney(row.amount) })),
  };
}

function summarizeRows(rows: MoneyRow[]): StatusSummary {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (row.direction === "OUT") expense += amount;
    else income += amount;
  }
  income = roundMoney(income);
  expense = roundMoney(expense);
  return { count: rows.length, income, expense, net: roundMoney(income - expense) };
}

export async function getReportData(startDate: Date, endDate: Date) {
  /** Basis periode yang dipakai laporan MAUPUN ringkasan "belum masuk laporan", supaya sebanding. */
  const periodWhere: Prisma.TransactionWhereInput = {
    isDraft: false,
    transactionDate: { gte: startDate, lte: endDate },
    ...excludeOpeningBalanceWhere(),
  };

  const [transactions, ministries, pendingRows] = await Promise.all([
    db.transaction.findMany({
      where: { ...periodWhere, status: "MATCHED" },
      include: { ministry: true, event: true, incomeType: true, expenseType: true },
      orderBy: { transactionDate: "asc" },
    }),
    db.ministry.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.transaction.findMany({
      where: { ...periodWhere, status: { in: ["UNMATCHED", "SKIPPED"] } },
      select: { status: true, direction: true, amount: true },
    }),
  ]);

  const activeMinistryIds = new Set(ministries.map((ministry) => ministry.id));
  const ministryAggregates = new Map<string, { income: number; expense: number; qrisFee: number; eventIncome: number; eventExpense: number }>();
  const eventAggregates = new Map<string, { event: string; ministry: string; aggregate: EventAggregate }>();
  const untaggedRows: MoneyRow[] = [];
  const nonEvent = { income: 0, expense: 0, qrisFee: 0 };

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    const isExpense = transaction.direction === "OUT";
    const fee = !isExpense && transaction.source === "QRIS_XLSX" ? qrisFeeFor(amount) : 0;
    const inMinistryTable = Boolean(transaction.ministryId && activeMinistryIds.has(transaction.ministryId));
    const inEventTable = Boolean(transaction.event && transaction.ministry);

    if (inMinistryTable) {
      const key = transaction.ministryId as string;
      const bucket = ministryAggregates.get(key) || { income: 0, expense: 0, qrisFee: 0, eventIncome: 0, eventExpense: 0 };
      if (isExpense) {
        bucket.expense += amount;
        if (transaction.eventId) bucket.eventExpense += amount;
      } else {
        bucket.income += amount;
        bucket.qrisFee += fee;
        if (transaction.eventId) bucket.eventIncome += amount;
      }
      ministryAggregates.set(key, bucket);

      if (!inEventTable) {
        if (isExpense) nonEvent.expense += amount;
        else {
          nonEvent.income += amount;
          nonEvent.qrisFee += fee;
        }
      }
    } else {
      // MATCHED tapi tidak punya kementerian aktif — tidak muncul di tabel kementerian mana pun.
      untaggedRows.push(transaction);
    }

    if (inEventTable) {
      const eventId = transaction.event!.id;
      let entry = eventAggregates.get(eventId);
      if (!entry) {
        entry = { event: transaction.event!.name, ministry: transaction.ministry!.name, aggregate: createEventAggregate() };
        eventAggregates.set(eventId, entry);
      }
      addToEventAggregate(entry.aggregate, transaction);
    }
  }

  const ministryRows: MinistryReportRow[] = ministries
    .map((ministry) => {
      const bucket = ministryAggregates.get(ministry.id) || { income: 0, expense: 0, qrisFee: 0, eventIncome: 0, eventExpense: 0 };
      const income = roundMoney(bucket.income);
      const expense = roundMoney(bucket.expense);
      const qrisFee = roundMoney(bucket.qrisFee);
      return {
        code: ministry.code,
        ministry: ministry.name,
        income,
        expense,
        net: roundMoney(income - expense),
        qrisFee,
        netAfterFee: roundMoney(income - qrisFee - expense),
        eventIncome: roundMoney(bucket.eventIncome),
        eventExpense: roundMoney(bucket.eventExpense),
        nonEventIncome: roundMoney(income - bucket.eventIncome),
        nonEventExpense: roundMoney(expense - bucket.eventExpense),
      };
    })
    .filter((row) => row.income || row.expense);

  const eventRows: EventReportRow[] = [...eventAggregates.values()]
    .map(({ event, ministry, aggregate }) => {
      const totals = finalizeEventAggregate(aggregate);
      return {
        event,
        ministry,
        income: totals.income,
        qrisFee: totals.qrisFee,
        expense: totals.expense,
        net: totals.net,
        incomeRows: totals.incomeRows.length ? totals.incomeRows : [emptyIncomeRow()],
        expenseRows: totals.expenseRows,
      };
    })
    .sort((a, b) => a.ministry.localeCompare(b.ministry) || a.event.localeCompare(b.event));

  const ministryTotals = ministryRows.reduce(
    (acc, row) => ({
      income: acc.income + row.income,
      expense: acc.expense + row.expense,
      qrisFee: acc.qrisFee + row.qrisFee,
    }),
    { income: 0, expense: 0, qrisFee: 0 },
  );
  const eventTotals = eventRows.reduce(
    (acc, row) => ({
      income: acc.income + row.income,
      expense: acc.expense + row.expense,
      qrisFee: acc.qrisFee + row.qrisFee,
    }),
    { income: 0, expense: 0, qrisFee: 0 },
  );

  const totals: ReportTotals = {
    ministry: {
      income: roundMoney(ministryTotals.income),
      expense: roundMoney(ministryTotals.expense),
      qrisFee: roundMoney(ministryTotals.qrisFee),
      net: roundMoney(ministryTotals.income - ministryTotals.expense),
      netAfterFee: roundMoney(ministryTotals.income - ministryTotals.qrisFee - ministryTotals.expense),
    },
    event: {
      income: roundMoney(eventTotals.income),
      expense: roundMoney(eventTotals.expense),
      qrisFee: roundMoney(eventTotals.qrisFee),
      net: roundMoney(eventTotals.income - eventTotals.qrisFee - eventTotals.expense),
    },
    nonEvent: {
      income: roundMoney(nonEvent.income),
      expense: roundMoney(nonEvent.expense),
      qrisFee: roundMoney(nonEvent.qrisFee),
      net: roundMoney(nonEvent.income - nonEvent.qrisFee - nonEvent.expense),
    },
    untagged: summarizeRows(untaggedRows),
  };

  const unassigned: PendingSummary = {
    unmatched: summarizeRows(pendingRows.filter((row) => row.status === "UNMATCHED")),
    skipped: summarizeRows(pendingRows.filter((row) => row.status === "SKIPPED")),
    total: summarizeRows(pendingRows),
  };

  return { ministryRows, eventRows, transactions, totals, unassigned };
}

export type EventBreakdown = {
  eventId: string;
  eventName: string;
  ministryName: string | null;
  income: number;
  qrisFee: number;
  expense: number;
  net: number;
  incomeRows: EventIncomeRow[];
  expenseRows: EventExpenseRow[];
  /** Jumlah transaksi MATCHED — sama basisnya dengan angka-angka di atas. */
  transactionCount: number;
  transactions: { id: string; date: string; description: string; direction: string; amount: number; source: string }[];
  /** BARU — transaksi event ini yang BELUM masuk hitungan karena statusnya bukan MATCHED. */
  pending: PendingSummary;
};

export async function getEventBreakdown(eventId: string): Promise<EventBreakdown | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, include: { ministry: true } });
  if (!event) return null;

  const baseWhere: Prisma.TransactionWhereInput = {
    isDraft: false,
    eventId,
    ...excludeOpeningBalanceWhere(),
  };

  const [rows, pendingRows] = await Promise.all([
    // Basis SAMA PERSIS dengan tabel laporan (`getReportData`): hanya MATCHED.
    db.transaction.findMany({
      where: { ...baseWhere, status: "MATCHED" },
      include: { incomeType: true, expenseType: true },
      orderBy: { transactionDate: "desc" },
    }),
    db.transaction.findMany({
      where: { ...baseWhere, status: { in: ["UNMATCHED", "SKIPPED"] } },
      select: { status: true, direction: true, amount: true },
    }),
  ]);

  const aggregate = createEventAggregate();
  const transactions = rows.map((row) => {
    addToEventAggregate(aggregate, row);
    return {
      id: row.id,
      date: row.transactionDate.toISOString(),
      description: row.description,
      direction: row.direction,
      amount: Number(row.amount),
      source: row.source,
    };
  });

  const totals = finalizeEventAggregate(aggregate);

  return {
    eventId: event.id,
    eventName: event.name,
    ministryName: event.ministry?.name || null,
    income: totals.income,
    qrisFee: totals.qrisFee,
    expense: totals.expense,
    net: totals.net,
    incomeRows: totals.incomeRows.sort((a, b) => b.amount - a.amount),
    expenseRows: totals.expenseRows.sort((a, b) => b.amount - a.amount),
    transactionCount: rows.length,
    transactions,
    pending: {
      unmatched: summarizeRows(pendingRows.filter((row) => row.status === "UNMATCHED")),
      skipped: summarizeRows(pendingRows.filter((row) => row.status === "SKIPPED")),
      total: summarizeRows(pendingRows),
    },
  };
}
