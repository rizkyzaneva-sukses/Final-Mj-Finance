import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { ImportPreview } from "@/components/import-preview";
import { BANK_SOURCES } from "@/lib/accounts";
import { db } from "@/lib/db";
import { getBalanceEstimateSummary } from "@/lib/meeting-report";
import { isDuplicateSkipReason, parseDuplicateOfId } from "@/lib/matching";
import { qrisFeeFor, roundMoney } from "@/lib/money";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

export default async function ImportBatchPage({ params }: { params: Params }) {
  const { id } = await params;
  const batch = await db.importBatch.findUnique({
    where: { id },
    include: {
      transactions: {
        where: { isDraft: true },
        orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
        include: { ministry: true, event: true, incomeType: true, expenseType: true },
      },
    },
  });
  if (!batch || batch.status !== "REVIEW") notFound();

  const ministries = await db.ministry.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: {
      events: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: {
          incomeTypes: { where: { active: true }, orderBy: { name: "asc" } },
        },
      },
    },
  });
  const expenseTypes = await db.expenseType.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const duplicateOriginalIds = [
    ...new Set(
      batch.transactions
        .map((row) => parseDuplicateOfId(row.skipReason))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const originalRows = duplicateOriginalIds.length
    ? await db.transaction.findMany({
        where: { id: { in: duplicateOriginalIds } },
        select: {
          id: true,
          description: true,
          amount: true,
          direction: true,
          source: true,
          transactionDate: true,
          accountHolder: true,
          accountNumber: true,
          status: true,
          isDraft: true,
        },
      })
    : [];
  const originalById = new Map(originalRows.map((row) => [row.id, row]));

  // Estimasi saldo setelah terapkan: bank (semua status) + QRIS non-SKIPPED.
  const now = new Date();
  const balanceSummary = await getBalanceEstimateSummary(now);
  let bankDelta = 0;
  let qrisDeltaGross = 0;
  let qrisDeltaFee = 0;
  for (const row of batch.transactions) {
    const amount = Number(row.amount);
    const signed = row.direction === "IN" ? amount : -amount;
    if (BANK_SOURCES.includes(row.source)) {
      bankDelta += signed;
    } else if (row.source === "QRIS_XLSX" && row.status !== "SKIPPED" && row.direction === "IN") {
      qrisDeltaGross += amount;
      qrisDeltaFee += qrisFeeFor(amount);
    }
  }
  bankDelta = roundMoney(bankDelta);
  qrisDeltaGross = roundMoney(qrisDeltaGross);
  qrisDeltaFee = roundMoney(qrisDeltaFee);
  const qrisDeltaNet = roundMoney(qrisDeltaGross - qrisDeltaFee);
  const balanceImpact = {
    currentConfirmed: balanceSummary.confirmedTotal,
    currentEstimated: balanceSummary.estimatedTotal,
    bankDelta,
    qrisDeltaNet,
    afterConfirmed: roundMoney(balanceSummary.confirmedTotal + bankDelta),
    afterEstimated: roundMoney(balanceSummary.estimatedTotal + bankDelta + qrisDeltaNet),
    isBankBatch: BANK_SOURCES.includes(batch.source),
    isQrisBatch: batch.source === "QRIS_XLSX",
  };

  const rows = batch.transactions.map((row) => {
    const duplicateOfId = parseDuplicateOfId(row.skipReason);
    const original = duplicateOfId ? originalById.get(duplicateOfId) : null;
    return {
      id: row.id,
      date: row.transactionDate.toISOString(),
      description: row.description,
      amount: Number(row.amount),
      direction: row.direction as "IN" | "OUT",
      source: row.source,
      status: row.status,
      ministry: row.ministry?.name || null,
      event: row.event?.name || null,
      incomeType: row.incomeType?.name || null,
      expenseType: row.expenseType?.name || null,
      skipReason: row.skipReason,
      accountHolder: row.accountHolder,
      accountNumber: row.accountNumber,
      isDuplicate: isDuplicateSkipReason(row.skipReason),
      duplicateOf: original
        ? {
            id: original.id,
            date: original.transactionDate.toISOString(),
            description: original.description,
            amount: Number(original.amount),
            direction: original.direction as "IN" | "OUT",
            source: original.source,
            accountHolder: original.accountHolder,
            accountNumber: original.accountNumber,
            status: original.status,
            isDraft: original.isDraft,
          }
        : duplicateOfId
          ? { id: duplicateOfId, missing: true as const }
          : null,
    };
  });

  const master = ministries.map((ministry) => ({
    id: ministry.id,
    code: ministry.code,
    name: ministry.name,
    expenseTypes: expenseTypes.map((item) => ({ id: item.id, name: item.name })),
    events: ministry.events.map((event) => ({
      id: event.id,
      name: event.name,
      incomeTypes: event.incomeTypes.map((type) => ({
        id: type.id,
        name: type.name,
        uniqueCode: type.uniqueCode,
      })),
    })),
  }));

  return (
    <div className="page-stack">
      <PageHeading eyebrow="REVIEW IMPOR" title="Cek dulu sebelum masuk buku." description="Preview hasil baca file, cek rekening sumbernya, assign yang belum cocok, lalu terapkan kalau sudah aman." />
      <ImportPreview
        batch={{
          id: batch.id,
          fileName: batch.fileName,
          source: batch.source,
          accountHolder: batch.accountHolder,
          accountNumber: batch.accountNumber,
          importedRows: batch.importedRows,
          matchedRows: batch.matchedRows,
          unmatchedRows: batch.unmatchedRows,
          skippedRows: batch.skippedRows,
          duplicateRows: batch.duplicateRows,
        }}
        rows={rows}
        master={master}
        balanceImpact={balanceImpact}
      />
    </div>
  );
}
