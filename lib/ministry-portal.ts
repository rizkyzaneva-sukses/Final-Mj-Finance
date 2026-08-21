import { db } from "@/lib/db";
import { periodBounds } from "@/lib/format";
import { excludeOpeningBalanceWhere } from "@/lib/accounts";
import { qrisFeeFor, roundMoney } from "@/lib/money";

export async function loadMinistryPortal(ministryId: string, startParam?: string, endParam?: string) {
  const { startDate, endDate, start, end } = periodBounds(startParam, endParam);

  const [
    allTimeTransactions,
    periodTransactions,
    periodTxDetail,
    events,
  ] = await Promise.all([
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId,
        ...excludeOpeningBalanceWhere(),
      },
      select: { direction: true, amount: true, source: true, eventId: true },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId,
        transactionDate: { gte: startDate, lte: endDate },
        ...excludeOpeningBalanceWhere(),
      },
      include: { incomeType: true, expenseType: true },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId,
        transactionDate: { gte: startDate, lte: endDate },
        ...excludeOpeningBalanceWhere(),
      },
      include: { incomeType: true, expenseType: true, event: true },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    }),
    db.event.findMany({
      where: { ministryId, active: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { documents: true } } },
    }),
  ]);

  const allTimeIncome = roundMoney(allTimeTransactions.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const allTimeExpense = roundMoney(allTimeTransactions.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const allTimeQrisFee = roundMoney(allTimeTransactions.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
  const saldoTerkini = roundMoney(allTimeIncome - allTimeQrisFee - allTimeExpense);
  const saldoMasuk = allTimeIncome;

  const periodIncome = roundMoney(periodTransactions.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const periodExpense = roundMoney(periodTransactions.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const periodQrisFee = roundMoney(periodTransactions.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
  const saldoDialokasikan = periodExpense;

  const eventRows = events.map((event) => {
    const eventTx = periodTransactions.filter((t) => t.eventId === event.id);
    const income = roundMoney(eventTx.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
    const expense = roundMoney(eventTx.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
    const qrisFee = roundMoney(eventTx.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
    const net = roundMoney(income - qrisFee - expense);

    const incomeByType = new Map<string, { name: string; code: string | null; amount: number }>();
    const expenseByType = new Map<string, { name: string; amount: number }>();

    for (const t of eventTx) {
      if (t.direction === "IN") {
        const key = t.incomeTypeId || "other";
        const existing = incomeByType.get(key) || { name: t.incomeType?.name || "Pemasukan lainnya", code: t.incomeType?.uniqueCode || null, amount: 0 };
        existing.amount += Number(t.amount);
        incomeByType.set(key, existing);
      } else {
        const key = t.expenseTypeId || "other";
        const existing = expenseByType.get(key) || { name: t.expenseType?.name || "Pengeluaran lainnya", amount: 0 };
        existing.amount += Number(t.amount);
        expenseByType.set(key, existing);
      }
    }

    const detailTx = periodTxDetail.filter((t) => t.eventId === event.id);

    return {
      id: event.id,
      name: event.name,
      category: event.category,
      documentCount: event._count.documents,
      income,
      expense,
      qrisFee,
      net,
      incomeRows: [...incomeByType.values()].map((r) => ({ ...r, amount: roundMoney(r.amount) })).sort((a, b) => b.amount - a.amount),
      expenseRows: [...expenseByType.values()].map((r) => ({ ...r, amount: roundMoney(r.amount) })).sort((a, b) => b.amount - a.amount),
      transactionCount: eventTx.length,
      transactions: detailTx.map((t) => ({
        id: t.id,
        date: t.transactionDate.toISOString(),
        description: t.description,
        direction: t.direction as "IN" | "OUT",
        amount: Number(t.amount),
        source: t.source,
        incomeTypeName: t.incomeType?.name || null,
        expenseTypeName: t.expenseType?.name || null,
      })),
    };
  });

  const eventAllTimeRows = events.map((event) => {
    const eventTx = allTimeTransactions.filter((t) => t.eventId === event.id);
    const income = roundMoney(eventTx.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
    const expense = roundMoney(eventTx.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
    const qrisFee = roundMoney(eventTx.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
    return { id: event.id, name: event.name, income, expense, qrisFee, net: roundMoney(income - qrisFee - expense) };
  }).filter((row) => row.income || row.expense);

  const nonEventPeriod = periodTransactions.filter((t) => !t.eventId);
  const nonEventIncome = roundMoney(nonEventPeriod.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const nonEventExpense = roundMoney(nonEventPeriod.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const nonEventQrisFee = roundMoney(nonEventPeriod.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
  const hasNonEvent = Boolean(nonEventIncome || nonEventExpense);
  const nonEventDetailTx = periodTxDetail.filter((t) => !t.eventId);

  return {
    start,
    end,
    allTimeIncome,
    allTimeExpense,
    allTimeQrisFee,
    saldoTerkini,
    saldoMasuk,
    periodIncome,
    periodExpense,
    periodQrisFee,
    saldoDialokasikan,
    eventRows,
    eventAllTimeRows,
    nonEventIncome,
    nonEventExpense,
    nonEventQrisFee,
    hasNonEvent,
    nonEventDetailTx: nonEventDetailTx.map((t) => ({
      id: t.id,
      date: t.transactionDate.toISOString(),
      description: t.description,
      direction: t.direction as "IN" | "OUT",
      amount: Number(t.amount),
      source: t.source,
      incomeTypeName: t.incomeType?.name || null,
      expenseTypeName: t.expenseType?.name || null,
    })),
  };
}
