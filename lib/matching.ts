import { createHash } from "node:crypto";
import type { Event, IncomeType, Prisma, TransactionDirection, TransactionSource, TransactionStatus } from "@prisma/client";
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
    transaction.accountNumber || "",
    transaction.sourceReference || "",
    transaction.transactionDate.toISOString(),
    transaction.description.trim().toUpperCase(),
    transaction.amount.toFixed(2),
    transaction.direction,
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

/**
 * Normalize a description for fuzzy comparison.
 * - Converts to uppercase
 * - Removes common noise words (transfer, payment, etc.)
 * - Splits into unique keywords
 */
function normalizeDescriptionKeywords(description: string): string[] {
  const noiseWords = new Set([
    'TRANSFER', 'TRF', 'TF', 'PAYMENT', 'BAYAR', 'PEMBAYARAN',
    'QRIS', 'DEBIT', 'KREDIT', 'CR', 'DB', 'ADM', 'BIAYA',
    'FEE', 'PPN', 'TAX', 'TGL', 'DATE',
  ]);
  return description
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !noiseWords.has(w));
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 * Returns a value between 0 and 1.
 */
function keywordSimilarity(kwA: string[], kwB: string[]): number {
  if (kwA.length === 0 && kwB.length === 0) return 1;
  if (kwA.length === 0 || kwB.length === 0) return 0;
  const setA = new Set(kwA);
  const setB = new Set(kwB);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find a potential fuzzy duplicate among existing non-draft transactions.
 * Matches on: same accountNumber, same date (±1 day), same amount, ≥60% description keyword overlap.
 * Returns the matched transaction record or null.
 */
export async function findPotentialDuplicate(
  row: NormalizedTransaction,
): Promise<{ id: string; source: TransactionSource } | null> {
  if (!row.accountNumber) return null;

  const dateFrom = new Date(row.transactionDate);
  dateFrom.setDate(dateFrom.getDate() - 1);
  const dateTo = new Date(row.transactionDate);
  dateTo.setDate(dateTo.getDate() + 1);
  // Ensure time bounds cover full days
  dateFrom.setHours(0, 0, 0, 0);
  dateTo.setHours(23, 59, 59, 999);

  const candidates = await db.transaction.findMany({
    where: {
      isDraft: false,
      accountNumber: row.accountNumber,
      direction: row.direction,
      amount: row.amount,
      transactionDate: {
        gte: dateFrom,
        lte: dateTo,
      },
    },
    select: {
      id: true,
      source: true,
      description: true,
    },
    take: 20,
  });

  const incomingKeywords = normalizeDescriptionKeywords(row.description);

  for (const candidate of candidates) {
    // Skip if same source – that's handled by fingerprint
    if (candidate.source === row.source) continue;

    const candidateKeywords = normalizeDescriptionKeywords(candidate.description);
    const similarity = keywordSimilarity(incomingKeywords, candidateKeywords);

    if (similarity >= 0.6) {
      return { id: candidate.id, source: candidate.source };
    }
  }

  return null;
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
  const counts = { imported: 0, duplicate: 0, matched: 0, unmatched: 0, skipped: 0, fuzzyDuplicate: 0 };

  for (const row of rows) {
    const hash = fingerprint(row);
    const exists = await db.transaction.findUnique({ where: { fingerprint: hash }, select: { id: true } });
    if (exists) {
      counts.duplicate++;
      continue;
    }

    // Fuzzy duplicate detection: only for finalized (non-draft) imports
    let fuzzyDupe: { id: string; source: TransactionSource } | null = null;
    if (!isDraft) {
      fuzzyDupe = await findPotentialDuplicate(row);
    }

    const isBatchQris = row.description.toUpperCase().includes(BATCH_QRIS_MARKER);

    // Determine status and skipReason
    let status: TransactionStatus;
    let skipReason: string | null = null;

    if (fuzzyDupe) {
      status = "SKIPPED";
      skipReason = `Duplikasi dari sumber lain (duplikasi dari transaksi ${fuzzyDupe.id} yang berasal dari ${fuzzyDupe.source})`;
    } else if (isBatchQris) {
      status = "SKIPPED";
      skipReason = "Gabungan pencairan QRIS, detail dihitung dari file QRIS.";
    } else {
      status = "UNMATCHED";
    }

    // Income matching only applies to non-skipped IN transactions
    const match =
      row.direction === "IN" && !isBatchQris && !fuzzyDupe
        ? findIncomeMatch(row.amount, incomeTypes)
        : undefined;
    if (match) {
      status = "MATCHED";
      skipReason = null;
    }

    await db.transaction.create({
      data: {
        ...row,
        fingerprint: hash,
        importBatchId: batchId,
        isDraft,
        status,
        skipReason,
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
    if (fuzzyDupe) counts.fuzzyDuplicate++;
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
