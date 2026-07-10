import { PageHeading } from "@/components/page-heading";
import { TransactionReview } from "@/components/transaction-review";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma, TransactionSource } from "@prisma/client";

export const dynamic = "force-dynamic";
const pageSize = 50;

type Params = Promise<{
  status?: string;
  source?: string;
  tab?: string;
  q?: string;
  page?: string;
  ministryId?: string;
  eventId?: string;
  incomeTypeId?: string;
  expenseTypeId?: string;
  account?: string;
  direction?: string;
}>;

function decodeAccountKey(value: string) {
  const [holder = "", number = ""] = value.split("::");
  return {
    holder: decodeURIComponent(holder),
    number: decodeURIComponent(number),
  };
}

export default async function TransactionsPage({ searchParams }: { searchParams: Params }) {
  const session = await getSession();
  const params = await searchParams;
  const statuses = ["UNMATCHED", "MATCHED", "SKIPPED"] as const;
  const status = statuses.includes(params.status as (typeof statuses)[number]) ? params.status as (typeof statuses)[number] : "UNMATCHED";
  const direction = params.direction === "IN" || params.direction === "OUT" ? params.direction : "";
  const currentPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const query = String(params.q || "").trim();
  const baseWhere: Prisma.TransactionWhereInput = {
    isDraft: false,
    ...(params.tab === "mutasi" ? { source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] } } : {}),
    ...(params.tab === "qris" ? { source: "QRIS_XLSX" } : {}),
    ...(params.source ? { source: params.source as never } : {}),
    ...(params.ministryId ? { ministryId: params.ministryId } : {}),
    ...(params.eventId ? { eventId: params.eventId } : {}),
    ...(params.incomeTypeId ? { incomeTypeId: params.incomeTypeId } : {}),
    ...(params.expenseTypeId ? { expenseTypeId: params.expenseTypeId } : {}),
    ...(direction ? { direction } : {}),
  };

  if (query) {
    baseWhere.OR = [
      { description: { contains: query, mode: "insensitive" } },
      { accountHolder: { contains: query, mode: "insensitive" } },
      { accountNumber: { contains: query } },
      { event: { name: { contains: query, mode: "insensitive" } } },
      { ministry: { name: { contains: query, mode: "insensitive" } } },
      { incomeType: { name: { contains: query, mode: "insensitive" } } },
      { expenseType: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  if (params.account === "unknown") {
    baseWhere.AND = [
      ...(baseWhere.AND ? (Array.isArray(baseWhere.AND) ? baseWhere.AND : [baseWhere.AND]) : []),
      {
        OR: [
          { accountHolder: null },
          { accountHolder: "" },
          { accountNumber: null },
          { accountNumber: "" },
        ],
      },
    ];
  } else if (params.account) {
    const account = decodeAccountKey(params.account);
    baseWhere.AND = [
      ...(baseWhere.AND ? (Array.isArray(baseWhere.AND) ? baseWhere.AND : [baseWhere.AND]) : []),
      {
        accountHolder: account.holder || null,
        accountNumber: account.number || null,
      },
    ];
  }

  const where: Prisma.TransactionWhereInput = {
    ...baseWhere,
    status,
  };

  const [transactions, totalRows] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: { ministry: true, event: true, incomeType: true, expenseType: true },
    }),
    db.transaction.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = safePage === currentPage ? transactions : await db.transaction.findMany({
    where,
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    include: { ministry: true, event: true, incomeType: true, expenseType: true },
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
  const expenseTypes = await db.expenseType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const [counts, accountGroups] = await Promise.all([
    db.transaction.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.transaction.groupBy({
      by: ["accountHolder", "accountNumber"],
      where: { isDraft: false },
      _count: true,
      orderBy: [{ accountHolder: "asc" }, { accountNumber: "asc" }],
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((row) => [row.status, row._count]));
  const rows = pageRows.map((row) => ({
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
  const master = ministries.map((ministry) => ({ id: ministry.id, code: ministry.code, name: ministry.name, expenseTypes: expenseTypes.map((item) => ({ id: item.id, name: item.name })), events: ministry.events.map((event) => ({ id: event.id, name: event.name, incomeTypes: event.incomeTypes.map((type) => ({ id: type.id, name: type.name, uniqueCode: type.uniqueCode })) })) }));

  // --- Duplicate detection ---
  // Find all bank transactions (BANK_PDF / BANK_SCREENSHOT) with matching (amount, date, account)
  // across different sources, then mark them as potential duplicates.
  const bankTxns = await db.transaction.findMany({
    where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT" as TransactionSource] } },
    select: { id: true, amount: true, transactionDate: true, accountHolder: true, accountNumber: true, source: true },
  });
  const duplicateIds = new Set<string>();
  const groupMap = new Map<string, { sources: Set<string>; ids: string[] }>();
  for (const tx of bankTxns) {
    const dateKey = tx.transactionDate.toISOString().slice(0, 10);
    const key = `${String(tx.amount)}|${dateKey}|${(tx.accountHolder || "").toLowerCase()}|${(tx.accountNumber || "").toLowerCase()}`;
    const entry = groupMap.get(key);
    if (entry) {
      entry.sources.add(tx.source);
      entry.ids.push(tx.id);
    } else {
      groupMap.set(key, { sources: new Set([tx.source]), ids: [tx.id] });
    }
  }
  for (const entry of groupMap.values()) {
    if (entry.sources.size > 1) {
      for (const id of entry.ids) duplicateIds.add(id);
    }
  }
  const eventOptions = ministries.flatMap((ministry) =>
    ministry.events.map((event) => ({
      value: event.id,
      label: `${ministry.code} · ${ministry.name} / ${event.name}`,
      ministryId: ministry.id,
    })),
  );
  const incomeTypeOptions = ministries.flatMap((ministry) =>
    ministry.events.flatMap((event) =>
      event.incomeTypes.map((type) => ({
        value: type.id,
        label: `${ministry.code} · ${ministry.name} / ${event.name} / ${type.name}${type.uniqueCode ? ` (${type.uniqueCode})` : ""}`,
        ministryId: ministry.id,
        eventId: event.id,
      })),
    ),
  );
  const accountOptions = accountGroups.map((row) => {
    const holder = row.accountHolder || "";
    const number = row.accountNumber || "";
    return {
      value: holder || number ? `${encodeURIComponent(holder)}::${encodeURIComponent(number)}` : "unknown",
      label: holder || number ? `${holder || "Belum terbaca"}${number ? ` · ${number}` : ""}` : "Belum terbaca / Tanpa nomor rekening",
    };
  });

  return (
    <div className="page-stack">
      <PageHeading eyebrow="BUKU TRANSAKSI" title="Yang belum jelas, kita bereskan." description="Cocokkan transaksi tanpa kode, tetapkan pengeluaran, atau periksa hasil pencocokan otomatis." />
      <TransactionReview
        rows={rows}
        master={master}
        canDelete={session?.role === "FINANCE"}
        activeStatus={status}
        activeTab={params.tab || ""}
        counts={countMap}
        filters={{
          query,
          source: params.source || "",
          ministryId: params.ministryId || "",
          eventId: params.eventId || "",
          incomeTypeId: params.incomeTypeId || "",
          expenseTypeId: params.expenseTypeId || "",
          account: params.account || "",
          direction,
          ministries: ministries.map((ministry) => ({ value: ministry.id, label: `${ministry.code} · ${ministry.name}` })),
          events: eventOptions,
          incomeTypes: incomeTypeOptions,
          expenseTypes: expenseTypes.map((item) => ({ value: item.id, label: item.name })),
          accounts: accountOptions,
        }}
        pagination={{
          page: safePage,
          pageSize,
          totalRows,
          totalPages,
        }}
        duplicateIds={duplicateIds.size > 0 ? duplicateIds : undefined}
      />
    </div>
  );
}
