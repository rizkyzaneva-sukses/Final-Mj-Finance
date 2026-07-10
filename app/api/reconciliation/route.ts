import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

type ReconciliationItem = {
  accountNumber: string;
  actualBalance: number;
};

const bankSources = ["BANK_PDF", "BANK_SCREENSHOT"] as const;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const body = await request.json().catch(() => ({ items: [] as ReconciliationItem[] }));
  const items: ReconciliationItem[] = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ error: "Belum ada data rekening yang diisi." }, { status: 400 });
  }

  // Validate inputs
  for (const item of items) {
    if (!item.accountNumber || typeof item.actualBalance !== "number") {
      return NextResponse.json({ error: "Data tidak valid. Pastikan nomor rekening dan saldo diisi." }, { status: 400 });
    }
  }

  const results = await Promise.all(
    items.map(async (item) => {
      // Find all confirmed transactions for this account (bank mutasi + opening balance)
      const transactions = await db.transaction.findMany({
        where: {
          isDraft: false,
          accountNumber: item.accountNumber,
          OR: [
            { source: { in: [...bankSources] } },
            { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
          ],
        },
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

      // Calculate confirmed balance from bank transactions
      const calculatedBalance = roundMoney(
        transactions.reduce((sum, txn) => {
          const amt = Number(txn.amount);
          return sum + (txn.direction === "IN" ? amt : -amt);
        }, 0)
      );

      const discrepancy = roundMoney(item.actualBalance - calculatedBalance);

      // If there's a discrepancy, find potentially problematic transactions
      // Look for: unmatched transactions, recent large transactions, suspicious entries
      let suspiciousTransactions: {
        id: string;
        date: string;
        description: string;
        amount: number;
        direction: string;
        status: string;
        accountHolder: string | null;
        reason: string;
      }[] = [];

      if (Math.abs(discrepancy) > 0.01) {
        // Find UNMATCHED transactions for this account
        const unmatched = await db.transaction.findMany({
          where: {
            isDraft: false,
            accountNumber: item.accountNumber,
            OR: [
              { source: { in: [...bankSources] } },
              { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
            ],
            status: "UNMATCHED",
          },
          select: {
            id: true,
            transactionDate: true,
            description: true,
            amount: true,
            direction: true,
            accountHolder: true,
            status: true,
          },
          orderBy: { transactionDate: "desc" },
          take: 10,
        });

        // Find recent large transactions (top 5 by amount)
        const largeTransactions = [...transactions]
          .sort((a, b) => Number(b.amount) - Number(a.amount))
          .slice(0, 5);

        // Build list of suspicious transactions with reasons
        const seenIds = new Set<string>();

        for (const txn of unmatched) {
          if (!seenIds.has(txn.id)) {
            seenIds.add(txn.id);
            suspiciousTransactions.push({
              id: txn.id,
              date: txn.transactionDate.toISOString(),
              description: txn.description,
              amount: Number(txn.amount),
              direction: txn.direction,
              status: txn.status,
              accountHolder: txn.accountHolder,
              reason: "Belum di-assign",
            });
          }
        }

        for (const txn of largeTransactions) {
          if (!seenIds.has(txn.id) && txn.status === "UNMATCHED") {
            seenIds.add(txn.id);
            suspiciousTransactions.push({
              id: txn.id,
              date: txn.transactionDate.toISOString(),
              description: txn.description,
              amount: Number(txn.amount),
              direction: txn.direction,
              status: txn.status,
              accountHolder: txn.accountHolder,
              reason: "Nominal besar, belum di-assign",
            });
          }
        }

        // Sort suspicious transactions by date descending
        suspiciousTransactions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      }

      return {
        accountNumber: item.accountNumber,
        actualBalance: item.actualBalance,
        calculatedBalance,
        discrepancy,
        transactionCount: transactions.length,
        match: Math.abs(discrepancy) < 0.01,
        transactions: suspiciousTransactions,
      };
    })
  );

  return NextResponse.json({ results });
}
