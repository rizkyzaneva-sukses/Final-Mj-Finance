import { PageHeading } from "@/components/page-heading";
import { TransactionReview } from "@/components/transaction-review";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = Promise<{ status?: string; source?: string; q?: string }>;

export default async function TransactionsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const statuses = ["UNMATCHED", "MATCHED", "SKIPPED"] as const;
  const status = statuses.includes(params.status as (typeof statuses)[number]) ? params.status as (typeof statuses)[number] : "UNMATCHED";
  const transactions = await db.transaction.findMany({
    where: {
      status,
      ...(params.source ? { source: params.source as never } : {}),
      ...(params.q ? { description: { contains: params.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: 150,
    include: { ministry: true, event: true, incomeType: true },
  });
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
  const counts = await db.transaction.groupBy({ by: ["status"], _count: true });
  const countMap = Object.fromEntries(counts.map((row) => [row.status, row._count]));
  const rows = transactions.map((row) => ({
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
    skipReason: row.skipReason,
  }));
  const master = ministries.map((ministry) => ({ id: ministry.id, code: ministry.code, name: ministry.name, events: ministry.events.map((event) => ({ id: event.id, name: event.name, incomeTypes: event.incomeTypes.map((type) => ({ id: type.id, name: type.name, uniqueCode: type.uniqueCode })) })) }));

  return (
    <div className="page-stack">
      <PageHeading eyebrow="BUKU TRANSAKSI" title="Yang belum jelas, kita bereskan." description="Cocokkan transaksi tanpa kode, tetapkan pengeluaran, atau periksa hasil pencocokan otomatis." />
      <TransactionReview rows={rows} master={master} activeStatus={status} counts={countMap} />
    </div>
  );
}
