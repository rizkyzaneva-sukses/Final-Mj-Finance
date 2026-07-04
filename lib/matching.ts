import { createHash } from "node:crypto";
import type { Event, IncomeType, Prisma, TransactionDirection, TransactionSource } from "@prisma/client";
import { db } from "@/lib/db";

export const BATCH_QRIS_MARKER = "TRF BATCH MYBB - PEMBAYARAN";

export type NormalizedTransaction = {
  transactionDate: Date;
  description: string;
  amount: number;
  direction: TransactionDirection;
  source: TransactionSource;
  accountHolder?: string | null;
  accountNumber?: string | null;
  sourceReference?: string | null;
  rawData?: Prisma.InputJsonValue;
};

export function fingerprint(transaction: NormalizedTransaction) {
  const stable = [
    transaction.source,
    transaction.accountNumber || "",
    transaction.accountHolder?.trim().toUpperCase() || "",
    transaction.sourceReference || "",
    transaction.transactionDate.toISOString(),
    transaction.description.trim().toUpperCase(),
    transaction.amount.toFixed(2),
    transaction.direction,
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

type MatchableIncomeType = IncomeType & { event: Event };

export function findIncomeMatch(amount: number, incomeTypes: MatchableIncomeType[]) {
  const wholeAmount = Math.abs(Math.trunc(amount)).toString();
  return [...incomeTypes]
    .filter((type) => type.active && type.uniqueCode)
    .sort((a, b) => (b.uniqueCode?.length ?? 0) - (a.uniqueCode?.length ?? 0))
    .find((type) => wholeAmount.endsWith(type.uniqueCode!));
}

async function persistTransactions(batchId: string, rows: NormalizedTransaction[], isDraft: boolean) {
  const incomeTypes = await db.incomeType.findMany({
    where: { active: true, uniqueCode: { not: null } },
    include: { event: true },
  });
  const counts = { imported: 0, duplicate: 0, matched: 0, unmatched: 0, skipped: 0 };

  for (const row of rows) {
    const hash = fingerprint(row);
    const exists = await db.transaction.findUnique({ where: { fingerprint: hash }, select: { id: true } });
    if (exists) {
      counts.duplicate++;
      continue;
    }

    const isBatchQris = row.description.toUpperCase().includes(BATCH_QRIS_MARKER);
    const match = row.direction === "IN" && !isBatchQris ? findIncomeMatch(row.amount, incomeTypes) : undefined;
    const status = isBatchQris ? "SKIPPED" : match ? "MATCHED" : "UNMATCHED";

    await db.transaction.create({
      data: {
        ...row,
        fingerprint: hash,
        importBatchId: batchId,
        isDraft,
        status,
        skipReason: isBatchQris ? "Gabungan pencairan QRIS, detail dihitung dari file QRIS." : null,
        ministryId: match?.event.ministryId,
        eventId: match?.eventId,
        incomeTypeId: match?.id,
        assignedAt: match ? new Date() : null,
        assignedByRole: match ? "SYSTEM" : null,
      },
    });
    counts.imported++;
    if (status === "MATCHED") counts.matched++;
    if (status === "UNMATCHED") counts.unmatched++;
    if (status === "SKIPPED") counts.skipped++;
  }

  return counts;
}

export async function stageImportTransactions(batchId: string, rows: NormalizedTransaction[]) {
  return persistTransactions(batchId, rows, true);
}

export async function finalizeImportBatch(batchId: string) {
  return db.transaction.updateMany({
    where: { importBatchId: batchId, isDraft: true },
    data: { isDraft: false },
  });
}
