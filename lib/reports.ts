import { db } from "@/lib/db";

import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

export type MinistryReportRow = { code: number; ministry: string; income: number; expense: number; net: number };
export type EventReportRow = {
  event: string;
  ministry: string;
  income: number;
  qrisFee: number;
  expense: number;
  net: number;
  incomeRows: { type: string; code: string | null; amount: number }[];
};

const QRIS_FEE_RATE = 0.007;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function getReportData(startDate: Date, endDate: Date) {
  const [transactions, ministries] = await Promise.all([
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        transactionDate: { gte: startDate, lte: endDate },
        NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
      },
      include: { ministry: true, event: true, incomeType: true },
      orderBy: { transactionDate: "asc" },
    }),
    db.ministry.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);

  const ministryRows: MinistryReportRow[] = ministries.map((ministry) => {
    const relevant = transactions.filter((row) => row.ministryId === ministry.id);
    const income = relevant.filter((row) => row.direction === "IN").reduce((sum, row) => sum + Number(row.amount), 0);
    const expense = relevant.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + Number(row.amount), 0);
    return { code: ministry.code, ministry: ministry.name, income, expense, net: income - expense };
  }).filter((row) => row.income || row.expense);

  const eventMap = new Map<string, EventReportRow & { incomes: Map<string, { type: string; code: string | null; amount: number }> }>();
  for (const transaction of transactions) {
    if (!transaction.event || !transaction.ministry) continue;
    if (!eventMap.has(transaction.event.id)) {
      eventMap.set(transaction.event.id, {
        event: transaction.event.name,
        ministry: transaction.ministry.name,
        income: 0,
        qrisFee: 0,
        incomeRows: [],
        expense: 0,
        net: 0,
        incomes: new Map(),
      });
    }
    const event = eventMap.get(transaction.event.id)!;
    if (transaction.direction === "OUT") event.expense += Number(transaction.amount);
    else {
      const amount = Number(transaction.amount);
      const key = transaction.incomeTypeId || "other";
      const current = event.incomes.get(key) || { type: transaction.incomeType?.name || "Pemasukan lainnya", code: transaction.incomeType?.uniqueCode || null, amount: 0 };
      current.amount += amount;
      event.incomes.set(key, current);
      event.income += amount;
      if (transaction.source === "QRIS_XLSX") event.qrisFee += amount * QRIS_FEE_RATE;
    }
  }
  const eventRows = [...eventMap.values()].map(({ incomes, ...row }) => {
    const qrisFee = roundMoney(row.qrisFee);
    const net = roundMoney(row.income - qrisFee - row.expense);
    return {
      ...row,
      qrisFee,
      net,
      incomeRows: [...incomes.values()].length ? [...incomes.values()] : [{ type: "—", code: null, amount: 0 }],
    };
  }).sort((a, b) => a.ministry.localeCompare(b.ministry) || a.event.localeCompare(b.event));
  return { ministryRows, eventRows, transactions };
}

export type EventBreakdown = {
  eventId: string;
  eventName: string;
  ministryName: string | null;
  income: number;
  qrisFee: number;
  expense: number;
  net: number;
  incomeRows: { type: string; code: string | null; amount: number }[];
  expenseRows: { type: string; amount: number }[];
  transactionCount: number;
  transactions: { id: string; date: string; description: string; direction: string; amount: number; source: string }[];
};

export async function getEventBreakdown(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, include: { ministry: true } });
  if (!event) return null;

  const rows = await db.transaction.findMany({
    where: {
      isDraft: false,
      eventId,
      NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
    },
    include: { incomeType: true, expenseType: true },
    orderBy: { transactionDate: "desc" },
  });

  const incomeMap = new Map<string, { type: string; code: string | null; amount: number }>();
  const expenseMap = new Map<string, { type: string; amount: number }>();
  let income = 0;
  let qrisFee = 0;
  let expense = 0;

  const transactions = rows.map((row) => {
    const amount = Number(row.amount);
    if (row.direction === "OUT") {
      expense += amount;
      const key = row.expenseTypeId || "other";
      const current = expenseMap.get(key) || { type: row.expenseType?.name || "Pengeluaran lainnya", amount: 0 };
      current.amount += amount;
      expenseMap.set(key, current);
    } else {
      income += amount;
      if (row.source === "QRIS_XLSX") qrisFee += amount * QRIS_FEE_RATE;
      const key = row.incomeTypeId || "other";
      const current = incomeMap.get(key) || { type: row.incomeType?.name || "Pemasukan lainnya", code: row.incomeType?.uniqueCode || null, amount: 0 };
      current.amount += amount;
      incomeMap.set(key, current);
    }
    return {
      id: row.id,
      date: row.transactionDate.toISOString(),
      description: row.description,
      direction: row.direction,
      amount,
      source: row.source,
    };
  });

  const qrisFeeRounded = roundMoney(qrisFee);
  return {
    eventId: event.id,
    eventName: event.name,
    ministryName: event.ministry?.name || null,
    income: roundMoney(income),
    qrisFee: qrisFeeRounded,
    expense: roundMoney(expense),
    net: roundMoney(income - qrisFeeRounded - expense),
    incomeRows: [...incomeMap.values()].sort((a, b) => b.amount - a.amount),
    expenseRows: [...expenseMap.values()].sort((a, b) => b.amount - a.amount),
    transactionCount: rows.length,
    transactions,
  };
}
