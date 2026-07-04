import { db } from "@/lib/db";

export type MinistryReportRow = { code: number; ministry: string; income: number; expense: number; net: number };
export type EventReportRow = { event: string; ministry: string; incomeRows: { type: string; code: string | null; amount: number }[]; expense: number };

export async function getReportData(startDate: Date, endDate: Date) {
  const [transactions, ministries] = await Promise.all([
    db.transaction.findMany({
      where: { isDraft: false, status: "MATCHED", transactionDate: { gte: startDate, lte: endDate } },
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
      eventMap.set(transaction.event.id, { event: transaction.event.name, ministry: transaction.ministry.name, incomeRows: [], expense: 0, incomes: new Map() });
    }
    const event = eventMap.get(transaction.event.id)!;
    if (transaction.direction === "OUT") event.expense += Number(transaction.amount);
    else {
      const key = transaction.incomeTypeId || "other";
      const current = event.incomes.get(key) || { type: transaction.incomeType?.name || "Pemasukan lainnya", code: transaction.incomeType?.uniqueCode || null, amount: 0 };
      current.amount += Number(transaction.amount);
      event.incomes.set(key, current);
    }
  }
  const eventRows = [...eventMap.values()].map(({ incomes, ...row }) => ({ ...row, incomeRows: [...incomes.values()].length ? [...incomes.values()] : [{ type: "—", code: null, amount: 0 }] })).sort((a, b) => a.ministry.localeCompare(b.ministry) || a.event.localeCompare(b.event));
  return { ministryRows, eventRows, transactions };
}
