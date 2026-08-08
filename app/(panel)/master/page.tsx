import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { MasterManager } from "@/components/master-manager";
import { PageHeading } from "@/components/page-heading";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  const session = await getSession();
  if (session?.role !== "FINANCE") redirect("/dashboard");
  const [ministries, incomeMasters, expenseTypes, openingBalances] = await Promise.all([
    db.ministry.findMany({
      orderBy: { code: "asc" },
      include: {
        events: {
          orderBy: { name: "asc" },
          include: {
            incomeTypes: { orderBy: { name: "asc" }, include: { incomeMaster: true } },
            _count: { select: { documents: true } },
          },
        },
      },
    }),
    db.incomeMaster.findMany({ orderBy: { name: "asc" } }),
    db.expenseType.findMany({ orderBy: { name: "asc" } }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        source: "MANUAL",
        sourceReference: { startsWith: OPENING_BALANCE_PREFIX },
      },
      orderBy: [{ accountHolder: "asc" }, { transactionDate: "asc" }],
    }),
  ]);
  const data = ministries.map((ministry) => ({
    id: ministry.id,
    code: ministry.code,
    name: ministry.name,
    active: ministry.active,
      events: ministry.events.map((event) => ({
        id: event.id,
        name: event.name,
        category: event.category,
        active: event.active,
        ministryId: event.ministryId,
        documentCount: event._count?.documents ?? 0,
      incomeTypes: event.incomeTypes.map((type) => ({
        id: type.id,
        name: type.name,
        uniqueCode: type.uniqueCode,
        incomeMasterId: type.incomeMasterId,
        incomeMasterName: type.incomeMaster?.name || type.name,
        active: type.active,
        eventId: type.eventId,
      })),
    })),
  }));
  const openingBalanceData = openingBalances.map((row) => ({
    id: row.id,
    accountHolder: row.accountHolder || "",
    accountNumber: row.accountNumber || null,
    amount: Number(row.amount),
    // Saldo awal minus disimpan sebagai amount positif + direction OUT (lihat app/api/opening-balances/route.ts),
    // supaya konvensi "IN = +, OUT = -" di seluruh perhitungan saldo tetap berlaku.
    direction: row.direction,
    // toDateInput menghitung dalam WIB. row.transactionDate.toISOString() akan menggeser
    // tanggal mundur satu hari karena 00:00 WIB = 17:00 UTC hari sebelumnya.
    transactionDate: toDateInput(row.transactionDate),
    note: typeof row.rawData === "object" && row.rawData && "note" in row.rawData && typeof row.rawData.note === "string" ? row.rawData.note : null,
  }));
  return <div className="page-stack"><PageHeading eyebrow="KAMUS KEUANGAN" title="Atur kode, lalu biarkan sistem bekerja." description="Setiap jenis pemasukan memiliki kode akhir nominal yang unik. Kode kementerian tidak memakai nol di depan." icon={<Building2 size={26} />} /><MasterManager ministries={data} incomeMasters={incomeMasters} expenseTypes={expenseTypes} openingBalances={openingBalanceData} /></div>;
}
