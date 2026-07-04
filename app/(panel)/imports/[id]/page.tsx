import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { ImportPreview } from "@/components/import-preview";
import { db } from "@/lib/db";

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

  const rows = batch.transactions.map((row) => ({
    id: row.id,
    date: row.transactionDate.toISOString(),
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    source: row.source,
    status: row.status,
    ministry: row.ministry?.name || null,
    event: row.event?.name || null,
    incomeType: row.incomeType?.name || null,
    expenseType: row.expenseType?.name || null,
    skipReason: row.skipReason,
    accountHolder: row.accountHolder,
    accountNumber: row.accountNumber,
  }));

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
      />
    </div>
  );
}
